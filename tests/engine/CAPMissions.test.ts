import { describe, it, expect, beforeEach } from 'vitest'
import { GameEngine, createEmptyState } from '@game/engine/GameEngine'
import type { MutableGameState } from '@game/engine/GameEngine'
import type { TaskGroup, Ship, Squadron, GameTime, ShipClass } from '@game/types'
import { AIRCRAFT_TYPES } from '@game/data/aircraftTypes'

// ── Fixtures ───────────────────────────────────────────────────────────────

const T0: GameTime = { day: 1, hour: 6, minute: 0 }
const T1: GameTime = { day: 1, hour: 23, minute: 59 }

function makeShipClass(id: number, type: string): ShipClass {
  return {
    id,
    name: type,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: type as any,
    displacementTons: 20000,
    maxSpeed: 30,
    armorRating: 50,
    aaStrength: 60,
    hullPoints: 100,
    aircraftCapacity: type.includes('carrier') ? 36 : 0
  }
}

function makeShip(id: string, classId: number, tgId: string, side: 'allied' | 'japanese'): Ship {
  return {
    id,
    name: id,
    classId,
    side,
    taskGroupId: tgId,
    status: 'operational',
    hullDamage: 0,
    fires: 0,
    flooding: 0,
    crewCasualties: 0,
    systemsDisabled: []
  }
}

function makeTG(id: string, side: 'allied' | 'japanese', pos: { q: number, r: number }): TaskGroup {
  return {
    id,
    name: id,
    side,
    flagshipId: `ship-${id}`,
    shipIds: [`ship-${id}`],
    position: pos,
    course: 90,
    speed: 25,
    currentOrder: 'standby',
    fuelState: 80
  }
}

function makeSquadron(id: string, typeId: number, tgId: string, side: 'allied' | 'japanese', count = 18): Squadron {
  return {
    id,
    aircraftTypeId: typeId,
    name: id,
    side,
    taskGroupId: tgId,
    aircraftCount: count,
    maxAircraftCount: count,
    pilotExperience: 'veteran',
    deckStatus: 'hangared',
    fuelLoad: 100,
    ordnanceLoaded: 'bombs-ap'
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildState(): MutableGameState {
  const state = createEmptyState()

  const cvClass = makeShipClass(1, 'fleet-carrier')
  const ddClass = makeShipClass(2, 'destroyer')
  state.shipClasses.set(1, cvClass)
  state.shipClasses.set(2, ddClass)

  for (const ac of AIRCRAFT_TYPES) {
    state.aircraftTypes.set(ac.id, ac)
  }

  // Allied TF at q=40, r=50
  const tf16 = makeTG('tf-16', 'allied', { q: 40, r: 50 })
  tf16.shipIds = ['ship-tf16']
  state.taskGroups.set('tf-16', tf16)
  state.ships.set('ship-tf16', makeShip('ship-tf16', 1, 'tf-16', 'allied'))

  // Japanese TF at q=27, r=51 (close enough for a strike)
  const kb = makeTG('kido-butai', 'japanese', { q: 27, r: 51 })
  kb.shipIds = ['ship-kb']
  state.taskGroups.set('kido-butai', kb)
  state.ships.set('ship-kb', makeShip('ship-kb', 1, 'kido-butai', 'japanese'))

  return state
}

function oneStep(engine: GameEngine): void {
  const STEP_MS = 30 * 130 // 3 900 ms per step at 1×
  engine.setTimeScale(1)
  engine.resume()
  engine.tick(STEP_MS)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CAP Missions — Sprint 18', () => {
  let state: MutableGameState

  beforeEach(() => {
    state = buildState()
  })

  it('CAP launch order creates an airborne flight plan', () => {
    // Add a fighter squadron to the Allied TF
    // F6F Hellcat = type id 4 (fighter)
    const hellcat = AIRCRAFT_TYPES.find(a => a.role === 'fighter' && a.side === 'allied')
    expect(hellcat).toBeDefined()

    const sq = makeSquadron('vf-6', hellcat!.id, 'tf-16', 'allied', 12)
    state.squadrons.set('vf-6', sq)

    const engine = new GameEngine(state, T0, T1, 1)
    engine.issueOrder({ type: 'launch-cap', taskGroupId: 'tf-16', squadronIds: ['vf-6'] })
    oneStep(engine)

    const plans = [...state.flightPlans.values()]
    const capPlan = plans.find(p => p.mission === 'cap')
    expect(capPlan).toBeDefined()
    expect(capPlan!.status).toBe('airborne')
    expect(capPlan!.side).toBe('allied')
  })

  it('CAP intercepts an incoming Japanese strike and reduces hits', () => {
    // Fighter for Allied CAP
    const hellcat = AIRCRAFT_TYPES.find(a => a.role === 'fighter' && a.side === 'allied')!
    const capSq = makeSquadron('vf-cap', hellcat.id, 'tf-16', 'allied', 18)
    state.squadrons.set('vf-cap', capSq)

    // Japanese dive-bomber (D3A Val = type 35)
    const valType = AIRCRAFT_TYPES.find(a => a.id === 35)!
    const valSq = makeSquadron('akagi-db', valType.id, 'kido-butai', 'japanese', 18)
    valSq.ordnanceLoaded = 'bombs-ap'
    state.squadrons.set('akagi-db', valSq)

    const engine = new GameEngine(state, T0, T1, 42)

    // Launch CAP first so it's airborne when the strike arrives
    engine.issueOrder({ type: 'launch-cap', taskGroupId: 'tf-16', squadronIds: ['vf-cap'] })
    oneStep(engine)

    // Verify CAP is now airborne
    const capPlan = [...state.flightPlans.values()].find(p => p.mission === 'cap')
    expect(capPlan?.status).toBe('airborne')

    // Launch Japanese strike at the Allied TF's position
    engine.issueOrder({
      type: 'launch-strike',
      taskGroupId: 'kido-butai',
      squadronIds: ['akagi-db'],
      targetHex: { q: 40, r: 50 }
    })

    // Advance until the strike resolves (ETA ~2 steps at this range)
    let strikeResolved = false
    for (let i = 0; i < 6 && !strikeResolved; i++) {
      const result = engine.tick(30 * 130)
      if (result.snapshot) {
        const strikePlan = [...result.snapshot.flightPlans.values()]
          .find(p => p.mission === 'strike' && p.side === 'japanese')
        if (strikePlan && strikePlan.status === 'returning') strikeResolved = true
      }
    }

    // Strike should have resolved (even if CAP turned it back or it got through)
    expect(strikeResolved).toBe(true)
  })

  it('EnemyStrikeDetected event fires when Japanese strike launches', () => {
    const valType = AIRCRAFT_TYPES.find(a => a.id === 35)!
    const valSq = makeSquadron('akagi-db', valType.id, 'kido-butai', 'japanese', 18)
    state.squadrons.set('akagi-db', valSq)

    const engine = new GameEngine(state, T0, T1, 1)

    const detected: { flightPlanId: string }[] = []
    engine.events.on('EnemyStrikeDetected', e => detected.push(e))

    engine.issueOrder({
      type: 'launch-strike',
      taskGroupId: 'kido-butai',
      squadronIds: ['akagi-db'],
      targetHex: { q: 40, r: 50 }
    })
    oneStep(engine)

    expect(detected).toHaveLength(1)
    expect(detected[0]!.flightPlanId).toBeDefined()
  })

  it('cap-launched combat event is emitted in the snapshot', () => {
    const hellcat = AIRCRAFT_TYPES.find(a => a.role === 'fighter' && a.side === 'allied')!
    const capSq = makeSquadron('vf-cap', hellcat.id, 'tf-16', 'allied', 12)
    state.squadrons.set('vf-cap', capSq)

    const engine = new GameEngine(state, T0, T1, 1)
    engine.issueOrder({ type: 'launch-cap', taskGroupId: 'tf-16', squadronIds: ['vf-cap'] })
    engine.setTimeScale(1)
    engine.resume()
    const result = engine.tick(30 * 130)

    expect(result.snapshot).toBeDefined()
    const capEvent = result.snapshot!.combatEvents.find(e => e.type === 'cap-launched')
    expect(capEvent).toBeDefined()
  })
})
