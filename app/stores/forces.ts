import type { TaskGroup, Ship, Squadron, FlightPlan } from '@game/types'
import type { GameSnapshot } from '@game/engine/GameEngine'

export const useForcesStore = defineStore('forces', () => {
  // ── State ────────────────────────────────────────────────────────────────

  const taskGroups = ref<Map<string, TaskGroup>>(new Map())
  const ships = ref<Map<string, Ship>>(new Map())
  const squadrons = ref<Map<string, Squadron>>(new Map())
  const flightPlans = ref<Map<string, FlightPlan>>(new Map())
  /** Movement paths for rendering route lines on the map. */
  const movementPaths = ref<Map<string, readonly { q: number, r: number }[]>>(new Map())
  /** Current aviation fuel pools — decremented each step. */
  const alliedFuelPool = ref<number>(0)
  const japaneseFuelPool = ref<number>(0)
  /** Initial fuel pools at scenario start — used to compute percentage. */
  const initialAlliedFuelPool = ref<number>(1)
  const initialJapaneseFuelPool = ref<number>(1)

  // ── Derived ───────────────────────────────────────────────────────────────

  const alliedTaskGroups = computed(() =>
    [...taskGroups.value.values()].filter(tg => tg.side === 'allied')
  )

  const japaneseTaskGroups = computed(() =>
    [...taskGroups.value.values()].filter(tg => tg.side === 'japanese')
  )

  /** Allied fuel as 0–100 integer percentage of the initial pool. Returns 100 for unlimited (Infinity) pools. */
  const alliedFuelPct = computed((): number => {
    if (!isFinite(alliedFuelPool.value)) return 100
    if (initialAlliedFuelPool.value <= 0) return 0
    return Math.max(0, Math.round((alliedFuelPool.value / initialAlliedFuelPool.value) * 100))
  })

  /** Japanese fuel as 0–100 integer percentage of the initial pool. Returns 100 for unlimited (Infinity) pools. */
  const japaneseFuelPct = computed((): number => {
    if (!isFinite(japaneseFuelPool.value)) return 100
    if (initialJapaneseFuelPool.value <= 0) return 0
    return Math.max(0, Math.round((japaneseFuelPool.value / initialJapaneseFuelPool.value) * 100))
  })

  function taskGroupById(id: string): TaskGroup | undefined {
    return taskGroups.value.get(id)
  }

  function shipsInGroup(taskGroupId: string): Ship[] {
    const tg = taskGroups.value.get(taskGroupId)
    if (!tg) return []
    return tg.shipIds.flatMap((id) => {
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
    alliedFuelPool.value = snapshot.alliedFuelPool ?? alliedFuelPool.value
    japaneseFuelPool.value = snapshot.japaneseFuelPool ?? japaneseFuelPool.value
  }

  /**
   * Snapshot the initial fuel pool values once at scenario load.
   * Called from useScenarioLoader before the first syncFromSnapshot.
   */
  function initFuelPools(allied: number, japanese: number): void {
    initialAlliedFuelPool.value = isFinite(allied) && allied > 0 ? allied : allied <= 0 ? 1 : allied
    initialJapaneseFuelPool.value = isFinite(japanese) && japanese > 0 ? japanese : japanese <= 0 ? 1 : japanese
    alliedFuelPool.value = allied
    japaneseFuelPool.value = japanese
  }

  function clear(): void {
    taskGroups.value = new Map()
    ships.value = new Map()
    squadrons.value = new Map()
    flightPlans.value = new Map()
    movementPaths.value = new Map()
    alliedFuelPool.value = 0
    japaneseFuelPool.value = 0
    initialAlliedFuelPool.value = 1
    initialJapaneseFuelPool.value = 1
  }

  return {
    // State
    taskGroups,
    ships,
    squadrons,
    flightPlans,
    movementPaths,
    alliedFuelPool,
    japaneseFuelPool,
    // Derived
    alliedTaskGroups,
    japaneseTaskGroups,
    alliedFuelPct,
    japaneseFuelPct,
    taskGroupById,
    shipsInGroup,
    squadronsInGroup,
    // Actions
    syncFromSnapshot,
    initFuelPools,
    clear
  }
})
