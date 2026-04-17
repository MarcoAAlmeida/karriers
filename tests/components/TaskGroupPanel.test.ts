/**
 * TaskGroupPanel behaviour tests.
 *
 * Tests the logic that drives TaskGroupPanel.vue's ship status badges,
 * hull colour thresholds, and panel visibility — all verified through
 * the store layer without DOM mounting.
 */
import { describe, it, expect } from 'vitest'
import { useForcesStore } from '../../app/stores/forces'
import { useMapStore } from '../../app/stores/map'
import type { Ship, TaskGroup, ShipStatus } from '@game/types'
import type { GameSnapshot } from '@game/engine/GameEngine'

// ── Helper functions (mirrors TaskGroupPanel.vue) ─────────────────────────

function shipStatusColor(status: ShipStatus): 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'operational': return 'success'
    case 'damaged': return 'warning'
    case 'on-fire': return 'error'
    case 'sinking': return 'error'
    case 'sunk': return 'neutral'
    default: return 'neutral'
  }
}

function hullColor(pct: number): string {
  if (pct >= 75) return 'text-green-400'
  if (pct >= 50) return 'text-amber-400'
  if (pct >= 25) return 'text-orange-400'
  return 'text-red-400'
}

// ── Snapshot helpers ───────────────────────────────────────────────────────

function makeShip(id: string, status: ShipStatus = 'operational', hullDamage = 0): Ship {
  return {
    id,
    classId: 1,
    name: id,
    side: 'allied',
    taskGroupId: 'tg1',
    hullDamage,
    fires: 0,
    floodingRisk: 0,
    fuelLevel: 100,
    ammoLevel: 100,
    damageControlEfficiency: 100,
    status
  }
}

function makeTG(id: string, shipIds: string[]): TaskGroup {
  return {
    id,
    name: `TF ${id}`,
    side: 'allied',
    flagshipId: shipIds[0] ?? '',
    shipIds,
    position: { q: 10, r: 10 },
    course: 0,
    speed: 25,
    currentOrder: 'standby'
  }
}

function makeSnapshot(tg: TaskGroup, ships: Ship[]): GameSnapshot {
  return {
    time: { day: 1, hour: 6, minute: 0 },
    stepFraction: 0,
    taskGroups: new Map([[tg.id, tg]]),
    ships: new Map(ships.map(s => [s.id, s])),
    squadrons: new Map(),
    flightPlans: new Map(),
    alliedContacts: new Map(),
    japaneseContacts: new Map(),
    combatEvents: [],
    gameEvents: [],
    sightingReports: [],
    movementPaths: new Map()
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TaskGroupPanel — shipStatusColor', () => {
  it('returns success for operational', () => {
    expect(shipStatusColor('operational')).toBe('success')
  })

  it('returns warning for damaged', () => {
    expect(shipStatusColor('damaged')).toBe('warning')
  })

  it('returns error for on-fire', () => {
    expect(shipStatusColor('on-fire')).toBe('error')
  })

  it('returns error for sinking', () => {
    expect(shipStatusColor('sinking')).toBe('error')
  })

  it('returns neutral for sunk', () => {
    expect(shipStatusColor('sunk')).toBe('neutral')
  })
})

describe('TaskGroupPanel — hullColor thresholds', () => {
  it('green at 100%', () => {
    expect(hullColor(100)).toBe('text-green-400')
  })

  it('green at 75%', () => {
    expect(hullColor(75)).toBe('text-green-400')
  })

  it('amber at 74%', () => {
    expect(hullColor(74)).toBe('text-amber-400')
  })

  it('amber at 50%', () => {
    expect(hullColor(50)).toBe('text-amber-400')
  })

  it('orange at 49%', () => {
    expect(hullColor(49)).toBe('text-orange-400')
  })

  it('orange at 25%', () => {
    expect(hullColor(25)).toBe('text-orange-400')
  })

  it('red at 24%', () => {
    expect(hullColor(24)).toBe('text-red-400')
  })

  it('red at 0%', () => {
    expect(hullColor(0)).toBe('text-red-400')
  })
})

describe('TaskGroupPanel — store integration', () => {
  it('panel is hidden when no TG is selected', () => {
    const mapStore = useMapStore()
    mapStore.selectTaskGroup(null)
    expect(mapStore.selectedTaskGroupId).toBeNull()
  })

  it('panel shows correct ship data from forcesStore', () => {
    const forcesStore = useForcesStore()
    const mapStore = useMapStore()

    const damagedShip = makeShip('s1', 'damaged', 30)
    const firingShip = makeShip('s2', 'on-fire', 55)
    const tg = makeTG('tg1', ['s1', 's2'])

    forcesStore.syncFromSnapshot(makeSnapshot(tg, [damagedShip, firingShip]))
    mapStore.selectTaskGroup('tg1')

    const ships = forcesStore.shipsInGroup('tg1')
    expect(ships.find(s => s.id === 's1')?.status).toBe('damaged')
    expect(ships.find(s => s.id === 's2')?.status).toBe('on-fire')
    expect(shipStatusColor('damaged')).toBe('warning')
    expect(shipStatusColor('on-fire')).toBe('error')
  })
})
