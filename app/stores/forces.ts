import type { TaskGroup, Ship, Squadron, FlightPlan } from '@game/types'
import type { GameSnapshot } from '@game/engine/GameEngine'

export const useForcesStore = defineStore('forces', () => {
  // ── State ────────────────────────────────────────────────────────────────

  const taskGroups = ref<Map<string, TaskGroup>>(new Map())
  const ships = ref<Map<string, Ship>>(new Map())
  const squadrons = ref<Map<string, Squadron>>(new Map())
  const flightPlans = ref<Map<string, FlightPlan>>(new Map())
  /** Movement paths for rendering route lines on the map. */
  const movementPaths = ref<Map<string, readonly { q: number; r: number }[]>>(new Map())

  // ── Derived ───────────────────────────────────────────────────────────────

  const alliedTaskGroups = computed(() =>
    [...taskGroups.value.values()].filter(tg => tg.side === 'allied')
  )

  const japaneseTaskGroups = computed(() =>
    [...taskGroups.value.values()].filter(tg => tg.side === 'japanese')
  )

  function taskGroupById(id: string): TaskGroup | undefined {
    return taskGroups.value.get(id)
  }

  function shipsInGroup(taskGroupId: string): Ship[] {
    const tg = taskGroups.value.get(taskGroupId)
    if (!tg) return []
    return tg.shipIds.flatMap(id => {
      const s = ships.value.get(id)
      return s ? [s] : []
    })
  }

  function squadronsInGroup(taskGroupId: string): Squadron[] {
    return [...squadrons.value.values()].filter(s => s.taskGroupId === taskGroupId)
  }

  // ── Sync from engine snapshot ─────────────────────────────────────────────

  function syncFromSnapshot(snapshot: GameSnapshot): void {
    taskGroups.value = new Map(snapshot.taskGroups)
    ships.value = new Map(snapshot.ships)
    squadrons.value = new Map(snapshot.squadrons)
    flightPlans.value = new Map(snapshot.flightPlans)
    movementPaths.value = new Map(snapshot.movementPaths)
  }

  function clear(): void {
    taskGroups.value = new Map()
    ships.value = new Map()
    squadrons.value = new Map()
    flightPlans.value = new Map()
    movementPaths.value = new Map()
  }

  return {
    // State
    taskGroups,
    ships,
    squadrons,
    flightPlans,
    movementPaths,
    // Derived
    alliedTaskGroups,
    japaneseTaskGroups,
    taskGroupById,
    shipsInGroup,
    squadronsInGroup,
    // Actions
    syncFromSnapshot,
    clear
  }
})
