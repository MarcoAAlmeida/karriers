/**
 * Sprint 20 — Side Fuel Pool + Oilers
 *
 * Tests: pool decrements on launch; oiler sinking deducts payload; exhaustion
 * gates launches; game ends when both sides are exhausted; pool initialises
 * correctly from scenario JSON.
 */

import { describe, it, expect } from 'vitest'
import { GameEngine, createEmptyState } from '@game/engine/GameEngine'
import type { MutableGameState } from '@game/engine/GameEngine'
import { scenarioFromDefinition } from '@game/data/scenarioRepository'
import type { TaskGroup, Ship, Squadron, ShipClass, GameTime, AircraftType } from '@game/types'
import type { ScenarioDefinition } from '@game/types/scenario'
import { AIRCRAFT_TYPES } from '@game/data/aircraftTypes'

// ── Fixtures ───────────────────────────────────────────────────────────────

const T0: GameTime = { day: 1, hour: 6, minute: 0 }
const T_END: GameTime = { day: 2, hour: 6, minute: 0 }
const STEP_MS = 30 * 130 // one 30-min step at speed-1

function makeCVClass(id: number, side: 'allied' | 'japanese' = 'allied'): ShipClass {
  return {
    id,
    name: 'fleet-carrier',
    type: 'fleet-carrier',
    side,
    displacement: 20000,
    maxSpeed: 30,
    aaStrength: 60,
    armorRating: 50,
    hullPoints: 100,
    damageControlRating: 70,
    flightDeckCapacity: 36,
    hangarCapacity: 72
  }
}

function makeOilerClass(id: number, side: 'allied' | 'japanese', fuelPayload: number): ShipClass {
  return {
    id,
    name: 'oiler',
    type: 'oiler',
    side,
    displacement: 20000,
    maxSpeed: 15,
    aaStrength: 10,
    armorRating: 5,
    hullPoints: 40,
    damageControlRating: 40,
    fuelPayload
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
    floodingRisk: 0,
    fuelLevel: 100,
    ammoLevel: 100,
    damageControlEfficiency: 100
  }
}

function makeTG(
  id: string,
  side: 'allied' | 'japanese',
  pos: { q: number, r: number },
  shipIds: string[] = []
): TaskGroup {
  return {
    id, name: id, side,
    flagshipId: shipIds[0] ?? '',
    shipIds,
    position: pos,
    course: 90,
    speed: 0,
    currentOrder: 'standby',
    fuelState: 80
  }
}

function makeSquadron(
  id: string,
  typeId: number,
  tgId: string,
  side: 'allied' | 'japanese',
  count = 18
): Squadron {
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

function findAircraft(role: string, side: 'allied' | 'japanese'): AircraftType {
  const match = AIRCRAFT_TYPES.find(a => a.role === role && a.side === side)
    ?? AIRCRAFT_TYPES.find(a => a.role === role)
  if (!match) throw new Error(`No aircraft type for role=${role} side=${side}`)
  return match
}

function steps(engine: GameEngine, n: number): void {
  engine.setTimeScale(1)
  engine.resume()
  for (let i = 0; i < n; i++) engine.tick(STEP_MS)
}

function buildBaseState(alliedPool = 15000, japPool = 12000): MutableGameState {
  const state = createEmptyState()
  state.alliedFuelPool = alliedPool
  state.japaneseFuelPool = japPool

  state.shipClasses.set(1, makeCVClass(1, 'allied'))
  state.shipClasses.set(2, makeCVClass(2, 'japanese'))

  for (const ac of AIRCRAFT_TYPES) {
    state.aircraftTypes.set(ac.id, ac)
  }
  return state
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Sprint 20 — Fuel Pool', () => {
  // ── 1. Pool decrements on launch ──────────────────────────────────────────
  it('fuel pool decrements after a mission is launched', () => {
    const state = buildBaseState(15000, 12000)

    const tg = makeTG('tf-16', 'allied', { q: 40, r: 50 }, ['cv-1'])
    state.taskGroups.set('tf-16', tg)
    state.ships.set('cv-1', makeShip('cv-1', 1, 'tf-16', 'allied'))

    const diveBomber = findAircraft('dive-bomber', 'allied')
    const sq = makeSquadron('vb-6', diveBomber.id, 'tf-16', 'allied', 18)
    state.squadrons.set('vb-6', sq)

    const engine = new GameEngine(state, T0, T_END, 1)

    // Target at q=45 → 5 hexes away; strike rate = 2 per aircraft per hex
    // cost = 18 × 2 × 5 = 180
    engine.issueOrder({
      type: 'launch-strike',
      taskGroupId: 'tf-16',
      squadronIds: ['vb-6'],
      targetHex: { q: 45, r: 50 }
    })
    steps(engine, 1)

    expect(state.alliedFuelPool).toBeLessThan(15000)
    expect(state.japaneseFuelPool).toBe(12000) // enemy pool untouched
  })

  // ── 2. Oiler sinking deducts correct payload ──────────────────────────────
  it('sinking an allied oiler deducts its fuelPayload from the allied pool', () => {
    const PAYLOAD = 5000
    const state = buildBaseState(15000, 12000)

    const oilerClass = makeOilerClass(10, 'allied', PAYLOAD)
    state.shipClasses.set(10, oilerClass)

    const tg = makeTG('tf-tanker', 'allied', { q: 40, r: 50 }, ['oiler-1'])
    state.taskGroups.set('tf-tanker', tg)
    const oiler = makeShip('oiler-1', 10, 'tf-tanker', 'allied')
    state.ships.set('oiler-1', oiler)

    const engine = new GameEngine(state, T0, T_END, 1)

    // Sink the oiler by driving hull damage to 100
    oiler.hullDamage = 100
    oiler.status = 'sunk'

    // Trigger emitShipSunk via the damage system path by running a step
    // (DamageSystem.processStep marks ships as sunk on reaching hullDamage 100).
    // We drive it manually here via the private path for test clarity.
    engine['emitShipSunk']('oiler-1', T0)

    expect(state.alliedFuelPool).toBe(15000 - PAYLOAD)
    expect(state.japaneseFuelPool).toBe(12000)
  })

  it('sinking a japanese oiler deducts its fuelPayload from the japanese pool', () => {
    const PAYLOAD = 4000
    const state = buildBaseState(15000, 12000)

    const oilerClass = makeOilerClass(11, 'japanese', PAYLOAD)
    state.shipClasses.set(11, oilerClass)

    const tg = makeTG('kido-oiler', 'japanese', { q: 30, r: 50 }, ['jap-oiler'])
    state.taskGroups.set('kido-oiler', tg)
    const oiler = makeShip('jap-oiler', 11, 'kido-oiler', 'japanese')
    state.ships.set('jap-oiler', oiler)

    const engine = new GameEngine(state, T0, T_END, 1)

    oiler.hullDamage = 100
    oiler.status = 'sunk'
    engine['emitShipSunk']('jap-oiler', T0)

    expect(state.japaneseFuelPool).toBe(12000 - PAYLOAD)
    expect(state.alliedFuelPool).toBe(15000)
  })

  // ── 3. Exhaustion gates launch attempts ───────────────────────────────────
  it('launch is rejected when the side fuel pool is at zero', () => {
    const state = buildBaseState(0, 12000) // allied pool empty

    const tg = makeTG('tf-16', 'allied', { q: 40, r: 50 }, ['cv-1'])
    state.taskGroups.set('tf-16', tg)
    state.ships.set('cv-1', makeShip('cv-1', 1, 'tf-16', 'allied'))

    const diveBomber = findAircraft('dive-bomber', 'allied')
    const sq = makeSquadron('vb-6', diveBomber.id, 'tf-16', 'allied', 18)
    state.squadrons.set('vb-6', sq)

    const engine = new GameEngine(state, T0, T_END, 1)

    engine.issueOrder({
      type: 'launch-strike',
      taskGroupId: 'tf-16',
      squadronIds: ['vb-6'],
      targetHex: { q: 45, r: 50 }
    })
    steps(engine, 1)

    // No flight plan created — pool was empty
    expect([...state.flightPlans.values()]).toHaveLength(0)
    expect(state.squadrons.get('vb-6')!.deckStatus).toBe('hangared')
    // Pool stays at zero (not negative)
    expect(state.alliedFuelPool).toBe(0)
  })

  // ── 4. Game ends when both sides are exhausted ────────────────────────────
  it('ScenarioEnded fires as a draw when both fuel pools reach zero', () => {
    const state = buildBaseState(0, 0) // both pools already empty

    // Minimal TGs to keep the engine happy (no carriers so no air ops)
    const tg = makeTG('tf-empty', 'allied', { q: 40, r: 50 }, ['dd-1'])
    state.taskGroups.set('tf-empty', tg)
    const ddClass: ShipClass = {
      id: 5, name: 'destroyer', type: 'destroyer', side: 'allied',
      displacement: 2000, maxSpeed: 36, aaStrength: 20, armorRating: 15,
      hullPoints: 25, damageControlRating: 55
    }
    state.shipClasses.set(5, ddClass)
    state.ships.set('dd-1', makeShip('dd-1', 5, 'tf-empty', 'allied'))

    const engine = new GameEngine(state, T0, T_END, 1)

    let endedEvent: { winner: string } | null = null
    engine.events.on('ScenarioEnded', (e) => {
      endedEvent = e
    })

    steps(engine, 1)

    expect(endedEvent).not.toBeNull()
    expect(endedEvent!.winner).toBe('draw')
  })

  // ── 5. Pool initialises correctly from scenario JSON ─────────────────────
  it('scenarioFromDefinition correctly passes alliedFuelPool and japaneseFuelPool', () => {
    const minimalDef: ScenarioDefinition = {
      id: 'test',
      name: 'Test',
      date: '1942-06-04',
      description: '',
      difficulty: 'medium',
      durationHours: 48,
      startTime: { day: 1, hour: 6, minute: 0 },
      endTime: { day: 3, hour: 6, minute: 0 },
      mapBounds: { minQ: 0, maxQ: 80, minR: 0, maxR: 80 },
      weatherZones: [],
      alliedFuelPool: 15000,
      japaneseFuelPool: 12000,
      forces: [],
      victoryConditions: []
    }

    const scenario = scenarioFromDefinition(minimalDef)
    expect(scenario.alliedFuelPool).toBe(15000)
    expect(scenario.japaneseFuelPool).toBe(12000)
  })
})
