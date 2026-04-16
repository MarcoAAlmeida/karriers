/**
 * Sprint 22 — Dynamic Strike Targeting
 *
 * Tests:
 * 1. Target moves mid-flight — strike resolves at new position
 * 2. Carrier maneuvers during return — returnEta re-anchors
 * 3. Target lost to FOW — strike continues to last known hex
 * 4. currentHex advances each step along the flight path
 */

import { describe, it, expect } from 'vitest'
import { GameEngine, createEmptyState } from '@game/engine/GameEngine'
import type { MutableGameState } from '@game/engine/GameEngine'
import type { TaskGroup, Ship, Squadron, ShipClass, GameTime, ContactRecord, FlightPlan } from '@game/types'
import { gameTimeToMinutes } from '@game/types'
import { AIRCRAFT_TYPES } from '@game/data/aircraftTypes'

// ── Fixtures ───────────────────────────────────────────────────────────────

const T0: GameTime    = { day: 1, hour: 6,  minute: 0 }
const T_END: GameTime = { day: 3, hour: 6,  minute: 0 }
const STEP_MS = 30 * 130

function makeCVClass(id: number, side: 'allied' | 'japanese' = 'allied'): ShipClass {
  return {
    id, name: 'fleet-carrier', type: 'fleet-carrier', side,
    displacement: 20000, maxSpeed: 30, aaStrength: 60, armorRating: 50,
    hullPoints: 100, damageControlRating: 70, flightDeckCapacity: 36, hangarCapacity: 72,
  }
}

function makeShip(id: string, classId: number, tgId: string, side: 'allied' | 'japanese'): Ship {
  return {
    id, name: id, classId, side, taskGroupId: tgId, status: 'operational',
    hullDamage: 0, fires: 0, floodingRisk: 0,
    fuelLevel: 100, ammoLevel: 100, damageControlEfficiency: 100,
  }
}

function makeTG(
  id: string, side: 'allied' | 'japanese',
  pos: { q: number; r: number }, shipIds: string[]
): TaskGroup {
  return {
    id, name: id, side, flagshipId: shipIds[0] ?? '', shipIds, position: pos,
    course: 90, speed: 0, currentOrder: 'standby', fuelState: 100,
  }
}

function makeSquadron(
  id: string, typeId: number, tgId: string, side: 'allied' | 'japanese', count = 18
): Squadron {
  return {
    id, name: id, aircraftTypeId: typeId, side, taskGroupId: tgId,
    aircraftCount: count, maxAircraftCount: count, pilotExperience: 'veteran',
    deckStatus: 'hangared', fuelLoad: 100, ordnanceLoaded: 'bombs-ap',
  }
}

function makeContact(
  id: string, forSide: 'allied' | 'japanese',
  tgId: string, hex: { q: number; r: number },
  isActive = true
): ContactRecord {
  return {
    id, forSide,
    lastKnownHex: hex,
    lastSeenAt: T0,
    contactType: 'confirmed',
    isActive,
    confirmedTaskGroupId: tgId,
    sightingIds: [],
  }
}

function buildBaseState(): MutableGameState {
  const state = createEmptyState()
  state.shipClasses.set(1, makeCVClass(1, 'allied'))
  state.shipClasses.set(2, makeCVClass(2, 'japanese'))
  for (const ac of AIRCRAFT_TYPES) state.aircraftTypes.set(ac.id, ac)
  state.alliedFuelPool = Infinity
  state.japaneseFuelPool = Infinity
  return state
}

function steps(engine: GameEngine, n: number): void {
  engine.setTimeScale(1)
  engine.resume()
  for (let i = 0; i < n; i++) engine.tick(STEP_MS)
}

function findDiveBomber(side: 'allied' | 'japanese') {
  const ac = AIRCRAFT_TYPES.find(a => a.role === 'dive-bomber' && a.side === side)
    ?? AIRCRAFT_TYPES.find(a => a.role === 'dive-bomber')
  if (!ac) throw new Error('No dive-bomber found')
  return ac
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Sprint 22 — Dynamic Strike Targeting', () => {

  // ── 1. Target moves mid-flight — targetHex chases TG ─────────────────────
  it('targetHex updates each step to chase the target TG when an active contact exists', () => {
    const state = buildBaseState()

    // Allied carrier at q=40 r=50
    const alliedTG = makeTG('tf-16', 'allied', { q: 40, r: 50 }, ['cv-1'])
    state.taskGroups.set('tf-16', alliedTG)
    state.ships.set('cv-1', makeShip('cv-1', 1, 'tf-16', 'allied'))

    // Japanese carrier at q=27 r=50 — target of the strike
    const japTG = makeTG('kido-butai', 'japanese', { q: 27, r: 50 }, ['jap-cv'])
    state.taskGroups.set('kido-butai', japTG)
    state.ships.set('jap-cv', makeShip('jap-cv', 2, 'kido-butai', 'japanese'))

    // Allied contact for the Japanese TG — initial position q=27 r=50
    state.alliedContacts.set('c1', makeContact('c1', 'allied', 'kido-butai', { q: 27, r: 50 }))

    const db = findDiveBomber('allied')
    state.squadrons.set('vb-6', makeSquadron('vb-6', db.id, 'tf-16', 'allied'))

    const engine = new GameEngine(state, T0, T_END, 1)

    // Launch strike at q=27 r=50 (current Japanese position)
    engine.issueOrder({
      type: 'launch-strike', taskGroupId: 'tf-16',
      squadronIds: ['vb-6'], targetHex: { q: 27, r: 50 }
    })
    steps(engine, 1)

    // Verify strike was created with targetTaskGroupId
    const plan = [...state.flightPlans.values()].find(p => p.mission === 'strike')
    expect(plan).toBeDefined()
    expect(plan!.targetTaskGroupId).toBe('kido-butai')
    expect(plan!.launchHex).toEqual({ q: 40, r: 50 })

    // Move the Japanese TG and update the contact
    japTG.position = { q: 25, r: 50 }
    state.alliedContacts.get('c1')!.lastKnownHex = { q: 25, r: 50 }

    steps(engine, 1)

    // targetHex should have chased the contact to q=25
    expect(plan!.targetHex).toEqual({ q: 25, r: 50 })
  })

  // ── 2. Carrier maneuvers during return — returnEta re-anchors ─────────────
  it('returnEta is re-anchored to carrier current position each step on return leg', () => {
    const state = buildBaseState()

    const alliedTG = makeTG('tf-16', 'allied', { q: 40, r: 50 }, ['cv-1'])
    state.taskGroups.set('tf-16', alliedTG)
    state.ships.set('cv-1', makeShip('cv-1', 1, 'tf-16', 'allied'))

    const japTG = makeTG('kido-butai', 'japanese', { q: 35, r: 50 }, ['jap-cv'])
    state.taskGroups.set('kido-butai', japTG)
    state.ships.set('jap-cv', makeShip('jap-cv', 2, 'kido-butai', 'japanese'))

    state.alliedContacts.set('c1', makeContact('c1', 'allied', 'kido-butai', { q: 35, r: 50 }))

    const db = findDiveBomber('allied')
    state.squadrons.set('vb-6', makeSquadron('vb-6', db.id, 'tf-16', 'allied'))

    const engine = new GameEngine(state, T0, T_END, 1)
    engine.issueOrder({
      type: 'launch-strike', taskGroupId: 'tf-16',
      squadronIds: ['vb-6'], targetHex: { q: 35, r: 50 }
    })

    // Advance until returning
    let plan: FlightPlan | undefined
    for (let i = 0; i < 8; i++) {
      steps(engine, 1)
      plan = [...state.flightPlans.values()].find(p => p.mission === 'strike')
      if (plan?.status === 'returning') break
    }
    expect(plan?.status).toBe('returning')

    const returnEtaBefore = plan!.returnEta ? gameTimeToMinutes(plan!.returnEta) : 0

    // Move carrier farther away
    alliedTG.position = { q: 50, r: 50 }
    steps(engine, 1)

    const returnEtaAfter = plan!.returnEta ? gameTimeToMinutes(plan!.returnEta) : 0

    // returnEta should increase when carrier moved away
    expect(returnEtaAfter).toBeGreaterThan(returnEtaBefore)
  })

  // ── 3. Target lost to FOW — strike continues to last known hex ────────────
  it('targetHex stays at last known contact hex when active contact is lost', () => {
    const state = buildBaseState()

    const alliedTG = makeTG('tf-16', 'allied', { q: 40, r: 50 }, ['cv-1'])
    state.taskGroups.set('tf-16', alliedTG)
    state.ships.set('cv-1', makeShip('cv-1', 1, 'tf-16', 'allied'))

    const japTG = makeTG('kido-butai', 'japanese', { q: 27, r: 50 }, ['jap-cv'])
    state.taskGroups.set('kido-butai', japTG)
    state.ships.set('jap-cv', makeShip('jap-cv', 2, 'kido-butai', 'japanese'))

    // Active contact at q=27
    state.alliedContacts.set('c1', makeContact('c1', 'allied', 'kido-butai', { q: 27, r: 50 }))

    const db = findDiveBomber('allied')
    state.squadrons.set('vb-6', makeSquadron('vb-6', db.id, 'tf-16', 'allied'))

    const engine = new GameEngine(state, T0, T_END, 1)
    engine.issueOrder({
      type: 'launch-strike', taskGroupId: 'tf-16',
      squadronIds: ['vb-6'], targetHex: { q: 27, r: 50 }
    })
    steps(engine, 1)

    const plan = [...state.flightPlans.values()].find(p => p.mission === 'strike')!
    expect(plan.targetHex).toEqual({ q: 27, r: 50 })

    // Contact goes inactive — Japanese TG moves but is no longer visible
    state.alliedContacts.get('c1')!.isActive = false
    japTG.position = { q: 20, r: 50 }

    steps(engine, 1)

    // targetHex must NOT follow the real TG position — stays at last known q=27
    expect(plan.targetHex).toEqual({ q: 27, r: 50 })
  })

  // ── 4. currentHex advances each step along the outbound path ─────────────
  it('currentHex advances toward targetHex each step during outbound flight', () => {
    const state = buildBaseState()

    const alliedTG = makeTG('tf-16', 'allied', { q: 40, r: 50 }, ['cv-1'])
    state.taskGroups.set('tf-16', alliedTG)
    state.ships.set('cv-1', makeShip('cv-1', 1, 'tf-16', 'allied'))

    // Target far enough away to take multiple steps
    const japTG = makeTG('kido-butai', 'japanese', { q: 20, r: 50 }, ['jap-cv'])
    state.taskGroups.set('kido-butai', japTG)
    state.ships.set('jap-cv', makeShip('jap-cv', 2, 'kido-butai', 'japanese'))

    state.alliedContacts.set('c1', makeContact('c1', 'allied', 'kido-butai', { q: 20, r: 50 }))

    const db = findDiveBomber('allied')
    state.squadrons.set('vb-6', makeSquadron('vb-6', db.id, 'tf-16', 'allied'))

    const engine = new GameEngine(state, T0, T_END, 1)
    engine.issueOrder({
      type: 'launch-strike', taskGroupId: 'tf-16',
      squadronIds: ['vb-6'], targetHex: { q: 20, r: 50 }
    })
    // Step 1: plan is created (currentHex = launchHex); step 2: updateFlightPositions advances it
    steps(engine, 2)

    const plan = [...state.flightPlans.values()].find(p => p.mission === 'strike')!
    expect(plan.currentHex).toBeDefined()
    expect(plan.launchHex).toEqual({ q: 40, r: 50 })

    const distAfterStep2 = Math.abs((plan.currentHex?.q ?? 40) - 40)
    expect(distAfterStep2).toBeGreaterThan(0)  // moved away from launch hex

    const hexAfterStep2 = { ...plan.currentHex! }
    steps(engine, 1)

    // currentHex should be closer to target after step 3 than step 2
    const distToTargetStep2 = Math.abs(hexAfterStep2.q - 20)
    const distToTargetStep3 = Math.abs((plan.currentHex?.q ?? 40) - 20)
    expect(distToTargetStep3).toBeLessThan(distToTargetStep2)
  })
})
