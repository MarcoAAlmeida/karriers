import { describe, it, expect } from 'vitest'
import { useForcesStore } from '../../app/stores/forces'
import type { TaskGroup, Ship } from '@game/types'
import type { GameSnapshot } from '@game/engine/GameEngine'

// ── Snapshot builder ───────────────────────────────────────────────────────

function makeTG(id: string): TaskGroup {
  return {
    id,
    name: `TF ${id}`,
    side: 'allied',
    flagshipId: 'ship1',
    shipIds: ['ship1'],
    position: { q: 10, r: 10 },
    course: 90,
    speed: 25,
    currentOrder: 'standby'
  }
}

function makeShip(id: string, tgId: string): Ship {
  return {
    id,
    classId: 1,
    name: id,
    side: 'allied',
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

function makeSnapshot(
  tgs: TaskGroup[],
  ships: Ship[],
  squadrons: Squadron[] = [],
  flightPlans: FlightPlan[] = []
): GameSnapshot {
  return {
    time: { day: 1, hour: 6, minute: 0 },
    stepFraction: 0,
    taskGroups: new Map(tgs.map(tg => [tg.id, tg])),
    ships: new Map(ships.map(s => [s.id, s])),
    squadrons: new Map(squadrons.map(sq => [sq.id, sq])),
    flightPlans: new Map(flightPlans.map(fp => [fp.id, fp])),
    alliedContacts: new Map(),
    japaneseContacts: new Map(),
    combatEvents: [],
    gameEvents: [],
    sightingReports: [],
    movementPaths: new Map(),
    alliedFuelPool: 0,
    japaneseFuelPool: 0,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useForcesStore.syncFromSnapshot', () => {
  it('populates taskGroups, ships, squadrons, flightPlans from snapshot', () => {
    const store = useForcesStore()
    const tg = makeTG('tg1')
    const ship = makeShip('ship1', 'tg1')
    store.syncFromSnapshot(makeSnapshot([tg], [ship]))

    expect(store.taskGroups.size).toBe(1)
    expect(store.taskGroups.get('tg1')?.name).toBe('TF tg1')
    expect(store.ships.size).toBe(1)
    expect(store.ships.get('ship1')?.side).toBe('allied')
  })

  it('replaces previous state on subsequent syncs', () => {
    const store = useForcesStore()
    store.syncFromSnapshot(makeSnapshot([makeTG('tg1')], [makeShip('s1', 'tg1')]))
    store.syncFromSnapshot(makeSnapshot([makeTG('tg2')], [makeShip('s2', 'tg2')]))

    expect(store.taskGroups.has('tg1')).toBe(false)
    expect(store.taskGroups.has('tg2')).toBe(true)
  })

  it('alliedTaskGroups derived correctly', () => {
    const store = useForcesStore()
    const alliedTG: TaskGroup = { ...makeTG('a1'), side: 'allied' }
    const japTG: TaskGroup = { ...makeTG('j1'), side: 'japanese' }
    store.syncFromSnapshot(makeSnapshot([alliedTG, japTG], []))

    expect(store.alliedTaskGroups.map(tg => tg.id)).toEqual(['a1'])
    expect(store.japaneseTaskGroups.map(tg => tg.id)).toEqual(['j1'])
  })

  it('shipsInGroup returns only ships belonging to the requested TG', () => {
    const store = useForcesStore()
    const ship1 = makeShip('s1', 'tg1')
    const ship2 = makeShip('s2', 'tg1')
    // TG must list the same IDs used by the ships
    const tg: TaskGroup = { ...makeTG('tg1'), flagshipId: 's1', shipIds: ['s1', 's2'] }
    store.syncFromSnapshot(makeSnapshot([tg], [ship1, ship2]))

    const ships = store.shipsInGroup('tg1')
    expect(ships).toHaveLength(2)
    expect(ships.map(s => s.id).sort()).toEqual(['s1', 's2'])
  })
})

describe('useForcesStore.clear', () => {
  it('empties all maps', () => {
    const store = useForcesStore()
    store.syncFromSnapshot(makeSnapshot([makeTG('tg1')], [makeShip('s1', 'tg1')]))
    store.clear()

    expect(store.taskGroups.size).toBe(0)
    expect(store.ships.size).toBe(0)
  })
})
