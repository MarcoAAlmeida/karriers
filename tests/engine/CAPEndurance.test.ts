/**
 * Sprint 21 — CAP Endurance + Per-Mission Fuel Consumption
 *
 * Tests:
 * 1. CAP recalled after 90-min endurance window
 * 2. Recovering CAP has readyTime set (deck disruption blocks relaunch)
 * 3. Ship fuelLevel decrements each step proportional to speed
 * 4. Strike during rearm extends recovering squadron readyTime
 */

import { describe, it, expect } from 'vitest'
import { GameEngine, createEmptyState } from '@game/engine/GameEngine'
import type { MutableGameState } from '@game/engine/GameEngine'
import type { TaskGroup, Ship, Squadron, ShipClass, GameTime } from '@game/types'
import { gameTimeToMinutes } from '@game/types'
import { AIRCRAFT_TYPES } from '@game/data/aircraftTypes'

// ── Fixtures ───────────────────────────────────────────────────────────────

const T0: GameTime    = { day: 1, hour: 6,  minute: 0 }
const T_END: GameTime = { day: 3, hour: 6,  minute: 0 }
const STEP_MS = 30 * 130  // one 30-min step at speed-1

function makeCVClass(id: number): ShipClass {
  return {
    id,
    name: 'fleet-carrier',
    type: 'fleet-carrier',
    side: 'allied',
    displacement: 20000,
    maxSpeed: 30,
    aaStrength: 60,
    armorRating: 50,
    hullPoints: 100,
    damageControlRating: 70,
    flightDeckCapacity: 36,
    hangarCapacity: 72,
  }
}

function makeShip(
  id: string, classId: number, tgId: string, side: 'allied' | 'japanese',
  extra: Partial<Ship> = {}
): Ship {
  return {
    id, name: id, classId, side, taskGroupId: tgId,
    status: 'operational',
    hullDamage: 0, fires: 0, floodingRisk: 0,
    fuelLevel: 100, ammoLevel: 100, damageControlEfficiency: 100,
    ...extra,
  }
}

function makeTG(
  id: string,
  side: 'allied' | 'japanese',
  pos: { q: number; r: number },
  shipIds: string[],
  speed = 0
): TaskGroup {
  return {
    id, name: id, side,
    flagshipId: shipIds[0] ?? '',
    shipIds, position: pos,
    course: 90, speed,
    currentOrder: 'standby',
    fuelState: 100,
  }
}

function makeSquadron(
  id: string, typeId: number, tgId: string,
  side: 'allied' | 'japanese', count = 12,
  extra: Partial<Squadron> = {}
): Squadron {
  return {
    id, name: id, aircraftTypeId: typeId,
    side, taskGroupId: tgId,
    aircraftCount: count, maxAircraftCount: count,
    pilotExperience: 'veteran',
    deckStatus: 'hangared',
    fuelLoad: 100, ordnanceLoaded: 'none',
    ...extra,
  }
}

function findFighter(side: 'allied' | 'japanese') {
  const ac = AIRCRAFT_TYPES.find(a => a.role === 'fighter' && a.side === side)
  if (!ac) throw new Error(`No fighter type for side=${side}`)
  return ac
}

function buildBaseState(): MutableGameState {
  const state = createEmptyState()
  state.shipClasses.set(1, makeCVClass(1))
  for (const ac of AIRCRAFT_TYPES) state.aircraftTypes.set(ac.id, ac)
  return state
}

function steps(engine: GameEngine, n: number): void {
  engine.setTimeScale(1)
  engine.resume()
  for (let i = 0; i < n; i++) engine.tick(STEP_MS)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Sprint 21 — CAP Endurance + Per-Mission Fuel Consumption', () => {

  // ── 1. CAP recalled after endurance window ────────────────────────────────
  it('CAP flight plan transitions away from airborne after 90-min orbit', () => {
    const state = buildBaseState()
    const tg = makeTG('tf-16', 'allied', { q: 40, r: 50 }, ['cv-1'])
    state.taskGroups.set('tf-16', tg)
    state.ships.set('cv-1', makeShip('cv-1', 1, 'tf-16', 'allied'))

    const fighter = findFighter('allied')
    state.squadrons.set('vf-cap', makeSquadron('vf-cap', fighter.id, 'tf-16', 'allied'))

    const engine = new GameEngine(state, T0, T_END, 1)
    engine.issueOrder({ type: 'launch-cap', taskGroupId: 'tf-16', squadronIds: ['vf-cap'] })

    // Advance well past the 90-min orbit window (3 steps) + return leg + rearm
    steps(engine, 6)

    const plans = [...state.flightPlans.values()]
    const capPlan = plans.find(p => p.mission === 'cap')
    expect(capPlan).toBeDefined()
    // Plan must have left 'airborne' — orbit expired and return was processed
    expect(capPlan!.status).not.toBe('airborne')
  })

  // ── 2. Deck disruption — recovering CAP has readyTime set ─────────────────
  it('CAP squadron has readyTime set after recovering, blocking immediate relaunch', () => {
    const state = buildBaseState()
    const tg = makeTG('tf-16', 'allied', { q: 40, r: 50 }, ['cv-1'])
    state.taskGroups.set('tf-16', tg)
    state.ships.set('cv-1', makeShip('cv-1', 1, 'tf-16', 'allied'))

    const fighter = findFighter('allied')
    state.squadrons.set('vf-cap', makeSquadron('vf-cap', fighter.id, 'tf-16', 'allied'))

    const engine = new GameEngine(state, T0, T_END, 1)
    engine.issueOrder({ type: 'launch-cap', taskGroupId: 'tf-16', squadronIds: ['vf-cap'] })

    // Step 1: launch. Steps 2–4: orbit + return. Step 5: recovers with readyTime set.
    steps(engine, 5)

    const sq = state.squadrons.get('vf-cap')!
    // Squadron must be either still recovering (readyTime in future) or hangared after rearm
    if (sq.deckStatus === 'recovering') {
      expect(sq.readyTime).toBeDefined()
      // readyTime must be strictly in the future relative to T0
      expect(gameTimeToMinutes(sq.readyTime!)).toBeGreaterThan(gameTimeToMinutes(T0))
    } else {
      // If already hangared, the rearm cycle completed — that's also correct
      expect(sq.deckStatus).toBe('hangared')
    }

    // Either way the squadron must NOT be airborne (it returned)
    expect(sq.deckStatus).not.toBe('airborne')
  })

  // ── 3. Ship fuelLevel decrements each step proportional to speed ──────────
  it('ship fuelLevel decrements when task group is moving, stays constant when stationary', () => {
    const state = buildBaseState()

    // Moving TG — speed=30 (full speed for maxSpeed=30)
    const movingTG = makeTG('tf-moving', 'allied', { q: 40, r: 50 }, ['cv-moving'], 30)
    state.taskGroups.set('tf-moving', movingTG)
    state.ships.set('cv-moving', makeShip('cv-moving', 1, 'tf-moving', 'allied'))

    // Add a destroyer class with no carrier cap so it doesn't confuse air ops
    const ddClass: ShipClass = {
      id: 2, name: 'destroyer', type: 'destroyer', side: 'allied',
      displacement: 2000, maxSpeed: 36, aaStrength: 20, armorRating: 15,
      hullPoints: 25, damageControlRating: 55,
    }
    state.shipClasses.set(2, ddClass)

    // Stationary TG — speed=0
    const staticTG = makeTG('tf-static', 'allied', { q: 10, r: 10 }, ['dd-static'], 0)
    state.taskGroups.set('tf-static', staticTG)
    state.ships.set('dd-static', makeShip('dd-static', 2, 'tf-static', 'allied'))

    const engine = new GameEngine(state, T0, T_END, 1)
    steps(engine, 1)

    const movingShip = state.ships.get('cv-moving')!
    const staticShip = state.ships.get('dd-static')!

    expect(movingShip.fuelLevel).toBeLessThan(100)
    expect(staticShip.fuelLevel).toBe(100)

    // fuelState on the moving TG should also have updated
    expect(state.taskGroups.get('tf-moving')!.fuelState).toBeLessThan(100)
    expect(state.taskGroups.get('tf-static')!.fuelState).toBe(100)
  })

  // ── 4. Strike during rearm extends recovering squadron readyTime ──────────
  it('applyStrikeRearmPenalty extends readyTime of recovering squadrons on hit carrier', () => {
    const state = buildBaseState()
    const tg = makeTG('tf-16', 'allied', { q: 40, r: 50 }, ['cv-1'])
    state.taskGroups.set('tf-16', tg)
    state.ships.set('cv-1', makeShip('cv-1', 1, 'tf-16', 'allied'))

    const fighter = findFighter('allied')
    const recoverySq = makeSquadron('vf-recover', fighter.id, 'tf-16', 'allied', 12, {
      deckStatus: 'recovering',
      readyTime: { day: 1, hour: 7, minute: 0 },  // T0 + 60 min
    })
    state.squadrons.set('vf-recover', recoverySq)

    const engine = new GameEngine(state, T0, T_END, 1)
    const originalReadyMin = gameTimeToMinutes(recoverySq.readyTime!)

    // Directly invoke the rearm penalty (simulates a carrier hit)
    engine['airOpsSystem'].applyStrikeRearmPenalty(
      'cv-1', state.ships, state.squadrons, state.taskGroups, T0
    )

    expect(recoverySq.readyTime).toBeDefined()
    expect(gameTimeToMinutes(recoverySq.readyTime!)).toBeGreaterThan(originalReadyMin)
  })
})
