import type { Scenario } from '@game/types'
import { buildStateFromScenario } from '@game/utils/scenarioState'

/**
 * Converts a Scenario into a MutableGameState and initialises the engine.
 * Call this when the player selects a scenario from the menu.
 */
export function useScenarioLoader() {
  const gameStore = useGameStore()
  const forcesStore = useForcesStore()
  const intelStore = useIntelligenceStore()
  const logger = useGameLogger()

  function loadScenario(scenario: Scenario): void {
    // Clear previous state
    forcesStore.clear()
    intelStore.clear()

    // Snapshot initial fuel pools before any steps run (used to compute gauge %)
    forcesStore.initFuelPools(scenario.alliedFuelPool ?? 0, scenario.japaneseFuelPool ?? 0)

    const state = buildStateFromScenario(scenario)
    const engine = gameStore.initEngine(scenario.startTime, scenario.endTime, state)

    logger.init(engine, scenario.id)

    // Subscribe intelligence store to engine sighting events
    engine.events.on('SightingDetected', (_report) => {
      // Toasts for player-relevant sightings are handled in the HUD component
      // The intelligence store syncs on StepComplete
    })

    // Populate stores with initial snapshot
    const initialSnapshot = engine.getSnapshot()
    forcesStore.syncFromSnapshot(initialSnapshot)
    intelStore.syncFromSnapshot(initialSnapshot)
  }

  return { loadScenario }
}
