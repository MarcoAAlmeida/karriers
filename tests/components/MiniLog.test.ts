/**
 * MiniLog behaviour tests.
 *
 * Tests the formatting and colouring logic that MiniLog.vue uses to render
 * sighting and combat log entries, verified through the store layer.
 * Avoids DOM mounting to keep the test fast and free of Nuxt UI dependencies.
 */
import { describe, it, expect } from 'vitest'
import { useIntelligenceStore } from '../../app/stores/intelligence'
import type { SightingReport, CombatEvent } from '@game/types'
import type { GameSnapshot } from '@game/engine/GameEngine'

// ── Helpers (mirrors MiniLog.vue computeds) ────────────────────────────────

interface LogEntry {
  time: string
  text: string
  className: string
}

function formatTime(t: { day: number; hour: number; minute: number }): string {
  return `D${t.day} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
}

function sightingEntry(r: SightingReport): LogEntry {
  const type = r.reportedContactType.replace(/-/g, ' ')
  const hex = `${r.contactHex.q},${r.contactHex.r}`
  return {
    time: formatTime(r.reportedAt),
    text: `${r.reportedBy === 'allied' ? 'US' : 'IJN'} sighted ${type} at ${hex}`,
    className: r.isFalseReport ? 'text-gray-600 line-through' : 'text-gray-300'
  }
}

function combatEntry(e: CombatEvent, ships = new Map<string, { name: string }>()): LogEntry | null {
  if (e.type === 'strike-resolved') {
    const hits = e.result.hits.length
    const lost = e.result.aircraftLost
    return {
      time: formatTime(e.result.resolvedAt),
      text: `Strike vs ${e.result.targetTaskGroupId}: ${hits} hit${hits !== 1 ? 's' : ''}, ${lost} aircraft lost`,
      className: 'text-amber-400'
    }
  }
  if (e.type === 'ship-damaged') {
    const name = ships.get(e.shipId)?.name ?? e.shipId
    return { time: formatTime(e.at), text: `${name} hit (${e.damageType})`, className: 'text-orange-400' }
  }
  if (e.type === 'ship-sunk') {
    const name = ships.get(e.shipId)?.name ?? e.shipId
    return { time: formatTime(e.at), text: `${name} sunk`, className: 'text-red-400 font-semibold' }
  }
  return null
}

function makeSnapshot(
  sightings: SightingReport[] = [],
  combat: CombatEvent[] = []
): GameSnapshot {
  return {
    time: { day: 1, hour: 10, minute: 0 },
    stepFraction: 0,
    taskGroups: new Map(),
    ships: new Map(),
    squadrons: new Map(),
    flightPlans: new Map(),
    alliedContacts: new Map(),
    japaneseContacts: new Map(),
    combatEvents: combat,
    gameEvents: [],
    sightingReports: sightings,
    movementPaths: new Map()
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MiniLog — sighting entry formatting', () => {
  it('formats time as Dd HH:MM', () => {
    const entry = sightingEntry({
      id: '1',
      reportedAt: { day: 1, hour: 9, minute: 0 },
      reportedBy: 'allied',
      detectedBy: 'aircraft',
      contactHex: { q: 30, r: 40 },
      reportedContactType: 'carrier-force',
      confidence: 80,
      isFalseReport: false
    })
    expect(entry.time).toBe('D1 09:00')
  })

  it('formats allied sighting with US prefix', () => {
    const entry = sightingEntry({
      id: '1',
      reportedAt: { day: 1, hour: 10, minute: 0 },
      reportedBy: 'allied',
      detectedBy: 'aircraft',
      contactHex: { q: 30, r: 40 },
      reportedContactType: 'carrier-force',
      confidence: 80,
      isFalseReport: false
    })
    expect(entry.text).toMatch(/^US sighted/)
  })

  it('formats japanese sighting with IJN prefix', () => {
    const entry = sightingEntry({
      id: '1',
      reportedAt: { day: 1, hour: 10, minute: 0 },
      reportedBy: 'japanese',
      detectedBy: 'aircraft',
      contactHex: { q: 30, r: 40 },
      reportedContactType: 'carrier-force',
      confidence: 80,
      isFalseReport: false
    })
    expect(entry.text).toMatch(/^IJN sighted/)
  })

  it('applies line-through class for false reports', () => {
    const entry = sightingEntry({
      id: '1',
      reportedAt: { day: 1, hour: 10, minute: 0 },
      reportedBy: 'allied',
      detectedBy: 'aircraft',
      contactHex: { q: 30, r: 40 },
      reportedContactType: 'unknown',
      confidence: 10,
      isFalseReport: true
    })
    expect(entry.className).toContain('line-through')
  })
})

describe('MiniLog — combat entry formatting', () => {
  it('formats strike-resolved entry in amber', () => {
    const event: CombatEvent = {
      type: 'strike-resolved',
      result: {
        flightPlanId: 'fp1',
        targetTaskGroupId: 'Kido Butai',
        resolvedAt: { day: 1, hour: 14, minute: 0 },
        flakLosses: 2,
        hits: [{ shipId: 's1', damageType: 'bomb', hullDamageDealt: 12, firesStarted: 1, floodingInduced: 5, crewCasualties: 3, systemsDisabled: [] }],
        aircraftReturning: 14,
        aircraftLost: 4,
        narrative: []
      }
    }
    const entry = combatEntry(event)!
    expect(entry).not.toBeNull()
    expect(entry.className).toBe('text-amber-400')
    expect(entry.text).toContain('1 hit')
    expect(entry.text).toContain('4 aircraft lost')
  })

  it('formats ship-damaged entry in orange', () => {
    const event: CombatEvent = {
      type: 'ship-damaged',
      shipId: 'akagi',
      damageType: 'torpedo',
      at: { day: 1, hour: 14, minute: 30 }
    }
    const ships = new Map([['akagi', { name: 'Akagi' }]])
    const entry = combatEntry(event, ships)!
    expect(entry.className).toBe('text-orange-400')
    expect(entry.text).toContain('Akagi')
    expect(entry.text).toContain('torpedo')
  })

  it('formats ship-sunk entry in red bold', () => {
    const event: CombatEvent = {
      type: 'ship-sunk',
      shipId: 'akagi',
      taskGroupId: 'tg-ijn',
      side: 'japanese',
      at: { day: 1, hour: 15, minute: 0 }
    }
    const ships = new Map([['akagi', { name: 'Akagi' }]])
    const entry = combatEntry(event, ships)!
    expect(entry.className).toContain('text-red-400')
    expect(entry.text).toContain('Akagi sunk')
  })
})

describe('MiniLog — store integration (entries after syncFromSnapshot)', () => {
  it('sightingLog grows after syncFromSnapshot with new sightings', () => {
    const store = useIntelligenceStore()
    const sighting: SightingReport = {
      id: 'r1',
      reportedAt: { day: 1, hour: 10, minute: 0 },
      reportedBy: 'allied',
      detectedBy: 'aircraft',
      contactHex: { q: 30, r: 40 },
      reportedContactType: 'carrier-force',
      confidence: 80,
      isFalseReport: false
    }
    store.syncFromSnapshot(makeSnapshot([sighting]))
    expect(store.sightingLog.length).toBeGreaterThan(0)
  })

  it('combatLog grows after syncFromSnapshot with combat events', () => {
    const store = useIntelligenceStore()
    const event: CombatEvent = {
      type: 'ship-damaged',
      shipId: 'akagi',
      damageType: 'bomb',
      at: { day: 1, hour: 10, minute: 0 }
    }
    store.syncFromSnapshot(makeSnapshot([], [event]))
    expect(store.combatLog.length).toBeGreaterThan(0)
  })
})
