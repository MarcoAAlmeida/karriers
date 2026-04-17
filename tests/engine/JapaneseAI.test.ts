import { describe, it, expect } from 'vitest'
import { JapaneseAI } from '@game/engine/JapaneseAI'
import type { GameSnapshot, OrderPayload } from '@game/engine/GameEngine'
import type {
  TaskGroup, Squadron, FlightPlan, ContactRecord, GameTime
} from '@game/types'

// ── Fixtures ───────────────────────────────────────────────────────────────

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

function makeTG(overrides: Partial<TaskGroup> = {}): TaskGroup {
  return {
    id: 'kido-butai',
    name: 'Kido Butai',
    side: 'japanese',
    flagshipId: 'cv-akagi',
    shipIds: ['cv-akagi'],
    position: { q: 27, r: 51 },
    course: 135,
    speed: 25,
    currentOrder: 'strike',
    fuelState: 75,
    ...overrides
  }
}

/** Val squadron (dive-bomber, type id=35, maxRange=840 NM → strike range≈357 NM) */
function makeValSquadron(overrides: Partial<Squadron> = {}): Squadron {
  return {
    id: 'akagi-db',
    aircraftTypeId: 35, // D3A Val
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

/** Kate squadron (torpedo-bomber, type id=40, maxRange=1237 NM → strike range≈525 NM) */
function makeKateSquadron(overrides: Partial<Squadron> = {}): Squadron {
  return {
    id: 'akagi-tb',
    aircraftTypeId: 40, // B5N Kate
    name: 'Akagi Kates',
    side: 'japanese',
    taskGroupId: 'kido-butai',
    aircraftCount: 27,
    maxAircraftCount: 27,
    pilotExperience: 'ace',
    deckStatus: 'hangared',
    fuelLoad: 100,
    ordnanceLoaded: 'none',
    ...overrides
  }
}

function makeContact(overrides: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: 'c-1',
    forSide: 'japanese',
    lastKnownHex: { q: 43, r: 49 }, // ~16 hexes from KB = 320 NM (within Val range)
    lastSeenAt: TIME,
    contactType: 'carrier-force',
    isActive: true,
    sightingIds: [],
    ...overrides
  }
}

function makeAirborneStrike(overrides: Partial<FlightPlan> = {}): FlightPlan {
  return {
    id: 'fp-0',
    squadronIds: ['akagi-db'],
    mission: 'strike',
    side: 'japanese',
    targetHex: { q: 43, r: 49 },
    launchTime: TIME,
    status: 'airborne',
    aircraftLost: 0,
    ...overrides
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('JapaneseAI', () => {
  const ai = new JapaneseAI()

  function collectOrders(snapshot: GameSnapshot): OrderPayload[] {
    const orders: OrderPayload[] = []
    ai.step(snapshot, o => orders.push(o))
    return orders
  }

  // ── No-crash guarantees ──────────────────────────────────────────────────

  it('does not crash with an empty snapshot', () => {
    expect(() => collectOrders(makeSnapshot())).not.toThrow()
  })

  it('does not crash when no contacts are visible', () => {
    const tg = makeTG()
    const sq = makeValSquadron()
    const snap = makeSnapshot({
      taskGroups: new Map([['kido-butai', tg]]),
      squadrons: new Map([['akagi-db', sq]])
    })
    expect(() => collectOrders(snap)).not.toThrow()
  })

  // ── No contacts: switch to search ────────────────────────────────────────

  it('issues set-order:search when no contacts and TG is not already searching', () => {
    const tg = makeTG({ currentOrder: 'strike' })
    const sq = makeValSquadron()
    const snap = makeSnapshot({
      taskGroups: new Map([['kido-butai', tg]]),
      squadrons: new Map([['akagi-db', sq]])
    })

    const orders = collectOrders(snap)
    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({ type: 'set-order', taskGroupId: 'kido-butai', order: 'search' })
  })

  it('does not issue redundant search order when already searching', () => {
    const tg = makeTG({ currentOrder: 'search' })
    const sq = makeValSquadron()
    const snap = makeSnapshot({
      taskGroups: new Map([['kido-butai', tg]]),
      squadrons: new Map([['akagi-db', sq]])
    })

    const orders = collectOrders(snap)
    expect(orders).toHaveLength(0)
  })

  // ── Strike launch ────────────────────────────────────────────────────────

  it('launches strike when contact is in range and attack squadrons are ready', () => {
    const tg = makeTG() // at q=27,r=51; contact at q=43,r=49 (~320 NM)
    const val = makeValSquadron()
    const kate = makeKateSquadron()
    const contact = makeContact()

    const snap = makeSnapshot({
      taskGroups: new Map([['kido-butai', tg]]),
      squadrons: new Map([['akagi-db', val], ['akagi-tb', kate]]),
      japaneseContacts: new Map([['c-1', contact]])
    })

    const orders = collectOrders(snap)
    const launch = orders.find(o => o.type === 'launch-strike')
    expect(launch).toBeDefined()
    expect(launch).toMatchObject({
      type: 'launch-strike',
      taskGroupId: 'kido-butai',
      targetHex: { q: 43, r: 49 }
    })
    // Both Vals and Kates should be included
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const squadronIds = (launch as any).squadronIds as string[]
    expect(squadronIds).toContain('akagi-db')
    expect(squadronIds).toContain('akagi-tb')
  })

  it('prefers carrier-force contacts over other contact types', () => {
    const tg = makeTG()
    const val = makeValSquadron()

    // Two contacts: surface-force nearby, carrier-force farther
    const surfaceContact = makeContact({
      id: 'c-surface',
      lastKnownHex: { q: 30, r: 51 }, // very close, 3 hexes
      contactType: 'surface-force'
    })
    const carrierContact = makeContact({
      id: 'c-carrier',
      lastKnownHex: { q: 43, r: 49 }, // 16 hexes, but carrier-force
      contactType: 'carrier-force'
    })

    const snap = makeSnapshot({
      taskGroups: new Map([['kido-butai', tg]]),
      squadrons: new Map([['akagi-db', val]]),
      japaneseContacts: new Map([
        ['c-surface', surfaceContact],
        ['c-carrier', carrierContact]
      ])
    })

    const orders = collectOrders(snap)
    const launch = orders.find(o => o.type === 'launch-strike')
    expect(launch).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((launch as any).targetHex).toMatchObject({ q: 43, r: 49 }) // carrier target
  })

  it('does not launch when contact is out of range', () => {
    const tg = makeTG({ position: { q: 5, r: 5 } }) // far from contact
    const val = makeValSquadron()
    // Val strike range ≈ 357 NM = ~17 hexes; contact at 40 hexes away
    const farContact = makeContact({ lastKnownHex: { q: 45, r: 5 } })

    const snap = makeSnapshot({
      taskGroups: new Map([['kido-butai', tg]]),
      squadrons: new Map([['akagi-db', val]]),
      japaneseContacts: new Map([['c-1', farContact]])
    })

    const orders = collectOrders(snap)
    expect(orders.find(o => o.type === 'launch-strike')).toBeUndefined()
  })

  it('does not launch when a strike is already airborne', () => {
    const tg = makeTG()
    const val = makeValSquadron()
    const contact = makeContact()
    const activeStrike = makeAirborneStrike()

    const snap = makeSnapshot({
      taskGroups: new Map([['kido-butai', tg]]),
      squadrons: new Map([['akagi-db', val]]),
      flightPlans: new Map([['fp-0', activeStrike]]),
      japaneseContacts: new Map([['c-1', contact]])
    })

    const orders = collectOrders(snap)
    expect(orders.find(o => o.type === 'launch-strike')).toBeUndefined()
  })

  it('does not launch squadrons with zero aircraft', () => {
    const tg = makeTG()
    const val = makeValSquadron({ aircraftCount: 0 })
    const kate = makeKateSquadron()
    const contact = makeContact()

    const snap = makeSnapshot({
      taskGroups: new Map([['kido-butai', tg]]),
      squadrons: new Map([['akagi-db', val], ['akagi-tb', kate]]),
      japaneseContacts: new Map([['c-1', contact]])
    })

    const orders = collectOrders(snap)
    const launch = orders.find(o => o.type === 'launch-strike')
    expect(launch).toBeDefined()
    // Only Kate should be in the launch (Val has 0 aircraft)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((launch as any).squadronIds).not.toContain('akagi-db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((launch as any).squadronIds).toContain('akagi-tb')
  })

  // ── Non-carrier task forces ──────────────────────────────────────────────

  it('ignores task forces with no attack squadrons (invasion force)', () => {
    const invasionTG = makeTG({
      id: 'invasion-force',
      name: 'Midway Invasion Force',
      position: { q: 20, r: 62 }
    })
    // Only destroyers / cruisers — no squadrons at all
    const contact = makeContact()

    const snap = makeSnapshot({
      taskGroups: new Map([['invasion-force', invasionTG]]),
      japaneseContacts: new Map([['c-1', contact]])
    })

    const orders = collectOrders(snap)
    expect(orders).toHaveLength(0)
  })

  // ── Close distance when out of range ─────────────────────────────────────

  it('issues set-destination toward contact when out of strike range', () => {
    const tg = makeTG({ position: { q: 5, r: 5 } })
    const val = makeValSquadron()
    const farContact = makeContact({ lastKnownHex: { q: 45, r: 5 } })

    const snap = makeSnapshot({
      taskGroups: new Map([['kido-butai', tg]]),
      squadrons: new Map([['akagi-db', val]]),
      japaneseContacts: new Map([['c-1', farContact]])
    })

    const orders = collectOrders(snap)
    expect(orders.find(o => o.type === 'set-destination')).toBeDefined()
  })
})
