/**
 * Sprint 23 — Fuel Gauge HUD
 *
 * Tests the store-level fuel percentage computeds and the visual helper
 * functions mirrored from FuelGauges.vue. No DOM mounting — same pattern
 * as TaskGroupPanel.test.ts.
 *
 * Tests:
 * 1. alliedFuelPct / japaneseFuelPct start at 100 after initFuelPools
 * 2. pct decrements proportionally on syncFromSnapshot (mission launch effect)
 * 3. Warning state activates at ≤ 20%
 * 4. GROUNDED state at 0%
 */

import { describe, it, expect } from 'vitest'
import { useForcesStore } from '../../app/stores/forces'
import type { GameSnapshot } from '@game/engine/GameEngine'

// ── Helpers (mirrors FuelGauges.vue) ──────────────────────────────────────

function barColor(pct: number, side: 'allied' | 'japanese'): string {
  if (pct === 0) return 'bg-slate-600'
  if (pct <= 20) return 'bg-amber-400'
  return side === 'allied' ? 'bg-sky-500' : 'bg-rose-500'
}

function labelColor(pct: number): string {
  if (pct === 0) return 'text-red-500'
  if (pct <= 20) return 'text-amber-400'
  return 'text-slate-400'
}

function gaugeLabel(pct: number): string {
  return pct === 0 ? 'GROUNDED' : `${pct}%`
}

// ── Snapshot builder ───────────────────────────────────────────────────────

function makeSnapshot(alliedFuelPool: number, japaneseFuelPool: number): GameSnapshot {
  return {
    time: { day: 1, hour: 6, minute: 0 },
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
    alliedFuelPool,
    japaneseFuelPool,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Sprint 23 — Fuel Gauge HUD', () => {

  // ── 1. Gauge initialises at 100% ────────────────────────────────────────
  it('alliedFuelPct and japaneseFuelPct are 100 immediately after initFuelPools', () => {
    const store = useForcesStore()
    store.initFuelPools(1000, 800)
    expect(store.alliedFuelPct).toBe(100)
    expect(store.japaneseFuelPct).toBe(100)
  })

  // ── 2. Gauge updates reactively on syncFromSnapshot (mission launch / attrition)
  it('pct decrements proportionally when syncFromSnapshot reduces fuel pools', () => {
    const store = useForcesStore()
    store.initFuelPools(1000, 800)

    // Simulate a launch consuming 30% of each side's pool
    store.syncFromSnapshot(makeSnapshot(700, 560))
    expect(store.alliedFuelPct).toBe(70)
    expect(store.japaneseFuelPct).toBe(70)

    // Simulate further attrition
    store.syncFromSnapshot(makeSnapshot(500, 400))
    expect(store.alliedFuelPct).toBe(50)
    expect(store.japaneseFuelPct).toBe(50)
  })

  // ── 3. Warning state activates at ≤ 20% ─────────────────────────────────
  it('warning styling activates when pct reaches 20%', () => {
    const store = useForcesStore()
    store.initFuelPools(1000, 800)

    // 21% — normal
    store.syncFromSnapshot(makeSnapshot(210, 168))
    expect(store.alliedFuelPct).toBe(21)
    expect(barColor(store.alliedFuelPct, 'allied')).toBe('bg-sky-500')
    expect(labelColor(store.alliedFuelPct)).toBe('text-slate-400')

    // 20% — warning threshold
    store.syncFromSnapshot(makeSnapshot(200, 160))
    expect(store.alliedFuelPct).toBe(20)
    expect(barColor(store.alliedFuelPct, 'allied')).toBe('bg-amber-400')
    expect(labelColor(store.alliedFuelPct)).toBe('text-amber-400')

    // 10% — still warning
    store.syncFromSnapshot(makeSnapshot(100, 80))
    expect(store.alliedFuelPct).toBe(10)
    expect(barColor(store.alliedFuelPct, 'japanese')).toBe('bg-amber-400')
  })

  // ── 4. GROUNDED at 0% ───────────────────────────────────────────────────
  it('shows GROUNDED label and danger styling when fuel reaches zero', () => {
    const store = useForcesStore()
    store.initFuelPools(1000, 800)
    store.syncFromSnapshot(makeSnapshot(0, 0))

    expect(store.alliedFuelPct).toBe(0)
    expect(store.japaneseFuelPct).toBe(0)
    expect(gaugeLabel(store.alliedFuelPct)).toBe('GROUNDED')
    expect(gaugeLabel(store.japaneseFuelPct)).toBe('GROUNDED')
    expect(labelColor(store.alliedFuelPct)).toBe('text-red-500')
    expect(barColor(store.alliedFuelPct, 'allied')).toBe('bg-slate-600')
    expect(barColor(store.japaneseFuelPct, 'japanese')).toBe('bg-slate-600')
  })

})
