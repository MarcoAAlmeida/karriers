import { describe, it, expect, beforeEach } from 'vitest'
import { GameEngine, createEmptyState } from '@game/engine/GameEngine'
import type { MutableGameState, GameSnapshot, OrderPayload } from '@game/engine/GameEngine'
import type { TaskGroup, Ship, Squadron, GameTime, ShipClass, FlightPlan } from '@game/types'
import { AIRCRAFT_TYPES } from '@game/data/aircraftTypes'
import { JapaneseAI } from '@game/engine/JapaneseAI'

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
    aaStrength: 40,
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

function makeSquadron(id: string, typeId: number, tgId: string, side: 'allied' | 'japanese', count = 2): Squadron {
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
    ordnanceLoaded: 'none'
  }
}

function buildState(): MutableGameState {
  const state = createEmptyState()

  state.shipClasses.set(1, makeShipClass(1, 'fleet-carrier'))
  state.shipClasses.set(2, makeShipClass(2, 'destroyer'))

  for (const ac of AIRCRAFT_TYPES) {
    state.aircraftTypes.set(ac.id, ac)
  }

  // Allied TF
  const tf16 = makeTG('tf-16', 'allied', { q: 40, r: 50 })
  tf16.shipIds = ['ship-tf16']
  state.taskGroups.set('tf-16', tf16)
  state.ships.set('ship-tf16', makeShip('ship-tf16', 1, 'tf-16', 'allied'))

  // Japanese TF
  const kb = makeTG('kido-butai', 'japanese', { q: 27, r: 51 })
  kb.shipIds = ['ship-kb']
  state.taskGroups.set('kido-butai', kb)
  state.ships.set('ship-kb', makeShip('ship-kb', 1, 'kido-butai', 'japanese'))

  return state
}

function tick(engine: GameEngine): ReturnType<GameEngine['tick']> {
  const STEP_MS = 30 * 130
  engine.setTimeScale(1)
  if (engine.isPaused) engine.resume()
  return engine.tick(STEP_MS)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Scout Missions — Sprint 20', () => {
  let state: MutableGameState

  beforeEach(() => {
    state = buildState()
  })

  it('launch-scout order creates an airborne scout flight plan', () => {
    // E13A Jake = type 46 (scout, japanese); OS2U Kingfisher = type 17 (scout, allied)
    const jake = AIRCRAFT_TYPES.find(a => a.id === 46)!
    const jakeSquadron = makeSquadron('tone-scout', jake.id, 'kido-butai', 'japanese', 1)
    state.squadrons.set('tone-scout', jakeSquadron)

    const engine = new GameEngine(state, T0, T1, 1)
    engine.issueOrder({
      type: 'launch-scout',
      taskGroupId: 'kido-butai',
      squadronIds: ['tone-scout'],
      targetHex: { q: 40, r: 50 }
    })
    tick(engine)

    const plans = [...state.flightPlans.values()]
    const scoutPlan = plans.find(p => p.mission === 'scout')
    expect(scoutPlan).toBeDefined()
    expect(scoutPlan!.status).toBe('airborne')
    expect(scoutPlan!.targetHex).toMatchObject({ q: 40, r: 50 })
  })

  it('scout-launched combat event is emitted', () => {
    const jake = AIRCRAFT_TYPES.find(a => a.id === 46)!
    const jakeSquadron = makeSquadron('tone-scout', jake.id, 'kido-butai', 'japanese', 1)
    state.squadrons.set('tone-scout', jakeSquadron)

    const engine = new GameEngine(state, T0, T1, 1)
    engine.issueOrder({
      type: 'launch-scout',
      taskGroupId: 'kido-butai',
      squadronIds: ['tone-scout'],
      targetHex: { q: 40, r: 50 }
    })
    const result = tick(engine)

    expect(result.snapshot).toBeDefined()
    const scoutEvent = result.snapshot!.combatEvents.find(e => e.type === 'scout-launched')
    expect(scoutEvent).toBeDefined()
  })

  it('scout resolves at target hex and creates a confirmed contact when enemy TF is nearby', () => {
    // Allied scout looking for Japanese TF
    const kingfisher = AIRCRAFT_TYPES.find(a => a.role === 'scout' && a.side === 'allied')!
    const scoutSq = makeSquadron('os2u-scout', kingfisher.id, 'tf-16', 'allied', 1)
    state.squadrons.set('os2u-scout', scoutSq)

    const engine = new GameEngine(state, T0, T1, 1)

    let contactRevealed = false
    engine.events.on('ScoutContactRevealed', ({ contactFound }) => {
      if (contactFound) contactRevealed = true
    })

    // Target the Japanese TF hex directly
    engine.issueOrder({
      type: 'launch-scout',
      taskGroupId: 'tf-16',
      squadronIds: ['os2u-scout'],
      targetHex: { q: 27, r: 51 } // Japanese TF position
    })

    // Advance until scout arrives (may take several steps depending on range/speed)
    for (let i = 0; i < 12; i++) {
      tick(engine)
      if (contactRevealed) break
    }

    expect(contactRevealed).toBe(true)

    // Allied contacts should now include a confirmed contact for the Japanese TF
    const contacts = [...state.alliedContacts.values()]
    const confirmed = contacts.find(c => c.confirmedTaskGroupId === 'kido-butai')
    expect(confirmed).toBeDefined()
    expect(confirmed!.isActive).toBe(true)
  })

  it('scout-resolved event fires with contactFound=false when no enemy nearby', () => {
    const kingfisher = AIRCRAFT_TYPES.find(a => a.role === 'scout' && a.side === 'allied')!
    const scoutSq = makeSquadron('os2u-scout', kingfisher.id, 'tf-16', 'allied', 1)
    state.squadrons.set('os2u-scout', scoutSq)

    const engine = new GameEngine(state, T0, T1, 1)

    const reveals: boolean[] = []
    engine.events.on('ScoutContactRevealed', ({ contactFound }) => reveals.push(contactFound))

    // Target an empty hex within range (14 hexes = 280 NM, under OS2U's 402 NM scout radius)
    // but more than 3 hexes from the Japanese TF at q:27, r:51
    engine.issueOrder({
      type: 'launch-scout',
      taskGroupId: 'tf-16',
      squadronIds: ['os2u-scout'],
      targetHex: { q: 42, r: 38 } // no TF here
    })

    for (let i = 0; i < 12; i++) {
      tick(engine)
      if (reveals.length > 0) break
    }

    expect(reveals).toHaveLength(1)
    expect(reveals[0]).toBe(false)
  })
})

// ── JapaneseAI Scout + CAP tests ────────────────────────────────────────────

describe('JapaneseAI — Sprint 18/20 additions', () => {
  const ai = new JapaneseAI()

  const TIME: GameTime = { day: 1, hour: 6, minute: 0 }

  function makeSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
    return {
      time: TIME,
      stepFraction: 0,
      taskGroups: new Map(),
      ships: new Map(),
      squadrons: new Map(),
      flightPlans: new Map(),
      alliedContacts: new Map(),
      japaneseContacts: new Map(),
      combatEvents: [],
      gameEvents: [],
      sightingReports: [],
      movementPaths: new Map(),
      ...overrides
    }
  }

  function collectOrders(snapshot: GameSnapshot): OrderPayload[] {
    const orders: OrderPayload[] = []
    ai.step(snapshot, o => orders.push(o))
    return orders
  }

  function makeTGSnap(overrides: Partial<TaskGroup> = {}): TaskGroup {
    return {
      id: 'kido-butai',
      name: 'Kido Butai',
      side: 'japanese',
      flagshipId: 'cv-akagi',
      shipIds: ['cv-akagi'],
      position: { q: 27, r: 51 },
      course: 135,
      speed: 25,
      currentOrder: 'search',
      fuelState: 75,
      ...overrides
    }
  }

  function makeValSq(overrides: Partial<Squadron> = {}): Squadron {
    return {
      id: 'akagi-db',
      aircraftTypeId: 35,
      name: 'Akagi Vals',
      side: 'japanese',
      taskGroupId: 'kido-butai',
      aircraftCount: 18,
      maxAircraftCount: 18,
      pilotExperience: 'ace',
      deckStatus: 'hangared',
      fuelLoad: 100,
      ordnanceLoaded: 'none',
      ...overrides
    }
  }

  function makeJakeSq(overrides: Partial<Squadron> = {}): Squadron {
    return {
      id: 'tone-scout',
      aircraftTypeId: 46, // E13A Jake — scout role
      name: 'Tone Scout',
      side: 'japanese',
      taskGroupId: 'kido-butai',
      aircraftCount: 1,
      maxAircraftCount: 1,
      pilotExperience: 'veteran',
      deckStatus: 'hangared',
      fuelLoad: 100,
      ordnanceLoaded: 'none',
      ...overrides
    }
  }

  function makeZeroSq(overrides: Partial<Squadron> = {}): Squadron {
    return {
      id: 'akagi-fighter',
      aircraftTypeId: 30, // A6M Zero — fighter role
      name: 'Akagi Zeros',
      side: 'japanese',
      taskGroupId: 'kido-butai',
      aircraftCount: 9,
      maxAircraftCount: 9,
      pilotExperience: 'ace',
      deckStatus: 'hangared',
      fuelLoad: 100,
      ordnanceLoaded: 'none',
      ...overrides
    }
  }

  // ── Scout tests ────────────────────────────────────────────────────────

  it('launches scout when no contacts and scout aircraft available', () => {
    const tg = makeTGSnap()
    const valSq = makeValSq()
    const jakeSq = makeJakeSq()
    const snap = makeSnapshot({
      taskGroups: new Map([['kido-butai', tg]]),
      squadrons: new Map([['akagi-db', valSq], ['tone-scout', jakeSq]])
    })

    const orders = collectOrders(snap)
    const scoutOrder = orders.find(o => o.type === 'launch-scout')
    expect(scoutOrder).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((scoutOrder as any).squadronIds).toContain('tone-scout')
  })

  it('does not launch a second scout when one is already airborne', () => {
    const tg = makeTGSnap()
    const valSq = makeValSq()
    const jakeSq = makeJakeSq()
    const activeScout: FlightPlan = {
      id: 'fp-scout',
      squadronIds: ['tone-scout'],
      mission: 'scout',
      side: 'japanese',
      targetHex: { q: 43, r: 49 },
      launchTime: TIME,
      status: 'airborne',
      aircraftLost: 0
    }
    const snap = makeSnapshot({
      taskGroups: new Map([['kido-butai', tg]]),
      squadrons: new Map([['akagi-db', valSq], ['tone-scout', jakeSq]]),
      flightPlans: new Map([['fp-scout', activeScout]])
    })

    const orders = collectOrders(snap)
    expect(orders.find(o => o.type === 'launch-scout')).toBeUndefined()
  })

  // ── CAP tests ──────────────────────────────────────────────────────────

  it('launches CAP when Allied strike is inbound toward this TG', () => {
    const tg = makeTGSnap()
    const valSq = makeValSq()
    const zeroSq = makeZeroSq()

    // Allied strike targeting the Japanese TG's hex (within 2 hexes)
    const alliedStrike: FlightPlan = {
      id: 'fp-allied',
      squadronIds: ['vb-6'],
      mission: 'strike',
      side: 'allied',
      targetHex: { q: 27, r: 51 }, // exact TG position
      launchTime: TIME,
      status: 'airborne',
      aircraftLost: 0
    }

    const snap = makeSnapshot({
      taskGroups: new Map([['kido-butai', tg]]),
      squadrons: new Map([['akagi-db', valSq], ['akagi-fighter', zeroSq]]),
      flightPlans: new Map([['fp-allied', alliedStrike]])
    })

    const orders = collectOrders(snap)
    const capOrder = orders.find(o => o.type === 'launch-cap')
    expect(capOrder).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((capOrder as any).squadronIds).toContain('akagi-fighter')
  })

  it('does not launch CAP when CAP is already airborne', () => {
    const tg = makeTGSnap()
    const valSq = makeValSq()
    const zeroSq = makeZeroSq({ deckStatus: 'airborne' }) // already up

    const alliedStrike: FlightPlan = {
      id: 'fp-allied',
      squadronIds: ['vb-6'],
      mission: 'strike',
      side: 'allied',
      targetHex: { q: 27, r: 51 },
      launchTime: TIME,
      status: 'airborne',
      aircraftLost: 0
    }
    const existingCAP: FlightPlan = {
      id: 'fp-cap',
      squadronIds: ['akagi-fighter'],
      mission: 'cap',
      side: 'japanese',
      launchTime: TIME,
      status: 'airborne',
      aircraftLost: 0
    }

    const snap = makeSnapshot({
      taskGroups: new Map([['kido-butai', tg]]),
      squadrons: new Map([['akagi-db', valSq], ['akagi-fighter', zeroSq]]),
      flightPlans: new Map([['fp-allied', alliedStrike], ['fp-cap', existingCAP]])
    })

    const orders = collectOrders(snap)
    expect(orders.find(o => o.type === 'launch-cap')).toBeUndefined()
  })
})
