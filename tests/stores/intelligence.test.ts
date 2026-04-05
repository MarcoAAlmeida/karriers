import { describe, it, expect } from 'vitest'
import { useIntelligenceStore } from '../../app/stores/intelligence'
import type { SightingReport, CombatEvent, ContactRecord } from '@game/types'
import type { GameSnapshot } from '@game/engine/GameEngine'

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeSighting(id: string, day = 1): SightingReport {
  return {
    id,
    reportedAt: { day, hour: 10, minute: 0 },
    reportedBy: 'allied',
    detectedBy: 'aircraft',
    contactHex: { q: 30, r: 40 },
    reportedContactType: 'carrier-force',
    confidence: 80,
    isFalseReport: false
  }
}

function makeStrikeEvent(day = 1): CombatEvent {
  return {
    type: 'strike-resolved',
    result: {
      flightPlanId: 'fp1',
      targetTaskGroupId: 'tg-ijn',
      resolvedAt: { day, hour: 10, minute: 0 },
      flakLosses: 2,
      hits: [],
      aircraftReturning: 14,
      aircraftLost: 4,
      narrative: ['Strike resolved']
    }
  }
}

function makeDamageEvent(shipId: string): CombatEvent {
  return {
    type: 'ship-damaged',
    shipId,
    damageType: 'bomb',
    at: { day: 1, hour: 10, minute: 0 }
  }
}

function makeSnapshot(
  sightings: SightingReport[] = [],
  combatEvents: CombatEvent[] = [],
  alliedContacts: ContactRecord[] = []
): GameSnapshot {
  return {
    time: { day: 1, hour: 10, minute: 0 },
    stepFraction: 0,
    taskGroups: new Map(),
    ships: new Map(),
    squadrons: new Map(),
    flightPlans: new Map(),
    alliedContacts: new Map(alliedContacts.map(c => [c.id, c])),
    japaneseContacts: new Map(),
    combatEvents,
    gameEvents: [],
    sightingReports: sightings,
    movementPaths: new Map()
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useIntelligenceStore.syncFromSnapshot — sightingLog', () => {
  it('prepends new sighting reports (most recent first)', () => {
    const store = useIntelligenceStore()
    store.syncFromSnapshot(makeSnapshot([makeSighting('s1', 1)]))
    store.syncFromSnapshot(makeSnapshot([makeSighting('s2', 2)]))

    // s2 is newer → should be first
    expect(store.sightingLog[0]!.id).toBe('s2')
    expect(store.sightingLog[1]!.id).toBe('s1')
  })

  it('caps sightingLog at 200 entries', () => {
    const store = useIntelligenceStore()
    for (let i = 0; i < 25; i++) {
      store.syncFromSnapshot(makeSnapshot(
        Array.from({ length: 10 }, (_, j) => makeSighting(`s${i}-${j}`))
      ))
    }
    expect(store.sightingLog.length).toBeLessThanOrEqual(200)
  })

  it('does not grow log when snapshot has no sightings', () => {
    const store = useIntelligenceStore()
    store.syncFromSnapshot(makeSnapshot([makeSighting('s1')]))
    const before = store.sightingLog.length
    store.syncFromSnapshot(makeSnapshot([])) // no new sightings
    expect(store.sightingLog.length).toBe(before)
  })
})

describe('useIntelligenceStore.syncFromSnapshot — combatLog', () => {
  it('prepends new combat events', () => {
    const store = useIntelligenceStore()
    store.syncFromSnapshot(makeSnapshot([], [makeStrikeEvent(1)]))
    store.syncFromSnapshot(makeSnapshot([], [makeStrikeEvent(2)]))

    expect(store.combatLog).toHaveLength(2)
    // Most recent first
    expect((store.combatLog[0] as { result: { resolvedAt: { day: number } } }).result.resolvedAt.day).toBe(2)
  })

  it('caps combatLog at 100 entries', () => {
    const store = useIntelligenceStore()
    for (let i = 0; i < 11; i++) {
      store.syncFromSnapshot(makeSnapshot([], Array.from({ length: 10 }, () => makeDamageEvent('s1'))))
    }
    expect(store.combatLog.length).toBeLessThanOrEqual(100)
  })
})

describe('useIntelligenceStore.clear', () => {
  it('resets all state', () => {
    const store = useIntelligenceStore()
    store.syncFromSnapshot(makeSnapshot([makeSighting('s1')], [makeStrikeEvent()]))
    store.clear()

    expect(store.sightingLog).toHaveLength(0)
    expect(store.combatLog).toHaveLength(0)
    expect(store.alliedContacts.size).toBe(0)
  })
})
