import { describe, it, expect } from 'vitest'
import { CombatSystem } from '@game/engine/CombatSystem'
import { AirOpsSystem } from '@game/engine/AirOpsSystem'
import { createRng } from '@game/utils/dice'
import type { AircraftType, ShipClass, Squadron, FlightPlan, TaskGroup, Ship, GameTime } from '@game/types'

// ── Minimal fixtures ───────────────────────────────────────────────────────

const SBD_TYPE_ID = 1
const BB_CLASS_ID = 1
const TIME: GameTime = { day: 1, hour: 10, minute: 0 }

function makeAircraftType(overrides: Partial<AircraftType> = {}): AircraftType {
  return {
    id: SBD_TYPE_ID,
    name: 'SBD Dauntless',
    side: 'allied',
    role: 'dive-bomber',
    maxRange: 500,
    cruiseSpeed: 150,
    maxSpeed: 245,
    climbRate: 1100,
    bombLoad: 1000,
    torpedoCapable: false,
    aaRating: 20,
    bombingAccuracy: 60,
    experienceModifiers: { ace: 1.5, veteran: 1.2, trained: 1.0, green: 0.7 },
    ...overrides
  }
}

function makeF4FType(): AircraftType {
  return {
    id: 2,
    name: 'F4F Wildcat',
    side: 'japanese',
    role: 'fighter',
    maxRange: 770,
    cruiseSpeed: 150,
    maxSpeed: 318,
    climbRate: 1950,
    bombLoad: 0,
    torpedoCapable: false,
    aaRating: 75,
    bombingAccuracy: 30,
    experienceModifiers: { ace: 1.5, veteran: 1.2, trained: 1.0, green: 0.7 }
  }
}

function makeShipClass(overrides: Partial<ShipClass> = {}): ShipClass {
  return {
    id: BB_CLASS_ID,
    name: 'Kaga',
    type: 'fleet-carrier',
    side: 'japanese',
    displacement: 38200,
    maxSpeed: 28,
    aaStrength: 60,
    armorRating: 40,
    hullPoints: 100,
    damageControlRating: 70,
    flightDeckCapacity: 90,
    hangarCapacity: 72,
    ...overrides
  }
}

function makeShip(id: string, tgId: string): Ship {
  return {
    id,
    classId: BB_CLASS_ID,
    name: 'Kaga',
    side: 'japanese',
    taskGroupId: tgId,
    hullDamage: 0,
    fires: 0,
    floodingRisk: 0,
    fuelLevel: 100,
    ammoLevel: 100,
    damageControlEfficiency: 100,
    status: 'operational'
  }
}

function makeTG(id: string, q: number, r: number): TaskGroup {
  return {
    id,
    name: 'Kido Butai',
    side: 'japanese',
    flagshipId: 'kaga',
    shipIds: ['kaga'],
    position: { q, r },
    course: 0,
    speed: 25,
    currentOrder: 'standby'
  }
}

function makeStrikeSquadron(id: string, tgId: string): Squadron {
  return {
    id,
    aircraftTypeId: SBD_TYPE_ID,
    name: 'VB-6',
    side: 'allied',
    taskGroupId: tgId,
    aircraftCount: 18,
    maxAircraftCount: 18,
    pilotExperience: 'veteran',
    deckStatus: 'airborne',
    fuelLoad: 80,
    ordnanceLoaded: 'bombs-ap',
    currentMissionId: 'fp1'
  }
}

function makeCAPSquadron(id: string, tgId: string): Squadron {
  return {
    id,
    aircraftTypeId: 2,
    name: 'A6M Zero',
    side: 'japanese',
    taskGroupId: tgId,
    aircraftCount: 12,
    maxAircraftCount: 18,
    pilotExperience: 'veteran',
    deckStatus: 'airborne',
    fuelLoad: 70,
    ordnanceLoaded: 'none',
    currentMissionId: 'fp-cap'
  }
}

function makeStrikeFlightPlan(targetHex: { q: number, r: number }): FlightPlan {
  return {
    id: 'fp1',
    squadronIds: ['sq-strike'],
    mission: 'strike',
    side: 'allied',
    targetHex,
    launchTime: { day: 1, hour: 8, minute: 0 },
    eta: TIME,
    status: 'airborne',
    aircraftLost: 0
  }
}

function makeCAPFlightPlan(_tgId: string): FlightPlan {
  return {
    id: 'fp-cap',
    squadronIds: ['sq-cap'],
    mission: 'cap',
    side: 'japanese',
    launchTime: { day: 1, hour: 7, minute: 0 },
    status: 'airborne',
    aircraftLost: 0
  }
}

function makeCombatSystem() {
  const aircraftTypes = new Map<number, AircraftType>([
    [SBD_TYPE_ID, makeAircraftType()],
    [2, makeF4FType()]
  ])
  const shipClasses = new Map<number, ShipClass>([
    [BB_CLASS_ID, makeShipClass()]
  ])
  const airOps = new AirOpsSystem(aircraftTypes)
  return new CombatSystem(createRng(42), aircraftTypes, shipClasses, airOps)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CombatSystem', () => {
  it('resolves a strike and returns a StrikeResult', () => {
    const tgId = 'tg-ijn'
    const targetHex = { q: 40, r: 30 }

    const taskGroups = new Map([
      [tgId, makeTG(tgId, targetHex.q, targetHex.r)]
    ])
    const ships = new Map([['kaga', makeShip('kaga', tgId)]])
    const sq = makeStrikeSquadron('sq-strike', 'tg-us')
    const squadrons = new Map([['sq-strike', sq]])
    const flightPlan = makeStrikeFlightPlan(targetHex)
    const flightPlans = new Map([['fp1', flightPlan]])

    const cs = makeCombatSystem()
    const results = cs.processStep(flightPlans, taskGroups, ships, squadrons, TIME)

    expect(results).toHaveLength(1)
    expect(results[0].targetTaskGroupId).toBe(tgId)
    expect(results[0].narrative.length).toBeGreaterThan(0)
  })

  it('CAP engages the strike when flightPlans is populated', () => {
    const tgId = 'tg-ijn'
    const targetHex = { q: 40, r: 30 }

    const taskGroups = new Map([
      [tgId, makeTG(tgId, targetHex.q, targetHex.r)]
    ])
    const ships = new Map([['kaga', makeShip('kaga', tgId)]])
    const strikeSquad = makeStrikeSquadron('sq-strike', 'tg-us')
    const capSquad = makeCAPSquadron('sq-cap', tgId)
    const squadrons = new Map([
      ['sq-strike', strikeSquad],
      ['sq-cap', capSquad]
    ])

    const strikePlan = makeStrikeFlightPlan(targetHex)
    const capPlan = makeCAPFlightPlan(tgId)
    const flightPlans = new Map([
      ['fp1', strikePlan],
      ['fp-cap', capPlan]
    ])

    const cs = makeCombatSystem()
    const results = cs.processStep(flightPlans, taskGroups, ships, squadrons, TIME)

    expect(results).toHaveLength(1)
    // CAP should have been engaged — narrative must mention CAP or the result has airCombat
    const result = results[0]!
    const mentionsCAP = result.narrative.some(line => line.toLowerCase().includes('cap'))
    expect(mentionsCAP || result.airCombat !== undefined).toBe(true)
  })

  it('CAP is NOT engaged when flightPlans is empty (regression guard)', () => {
    // Demonstrates the bug that was fixed: passing an empty Map means no CAP
    const tgId = 'tg-ijn'
    const targetHex = { q: 40, r: 30 }

    const taskGroups = new Map([
      [tgId, makeTG(tgId, targetHex.q, targetHex.r)]
    ])
    const ships = new Map([['kaga', makeShip('kaga', tgId)]])
    const strikeSquad = makeStrikeSquadron('sq-strike', 'tg-us')
    const capSquad = makeCAPSquadron('sq-cap', tgId)
    const squadrons = new Map([
      ['sq-strike', strikeSquad],
      ['sq-cap', capSquad]
    ])

    // Only include the strike plan — intentionally omit cap plan (simulates old bug)
    const strikePlan = makeStrikeFlightPlan(targetHex)
    const flightPlans = new Map([['fp1', strikePlan]])

    const cs = makeCombatSystem()
    const results = cs.processStep(flightPlans, taskGroups, ships, squadrons, TIME)

    expect(results).toHaveLength(1)
    // Without the cap plan in flightPlans, airCombat should be undefined
    expect(results[0]!.airCombat).toBeUndefined()
  })
})
