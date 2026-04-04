import type { Scenario } from '@game/types'
import type { MutableGameState } from '@game/engine/GameEngine'
import { coordKey } from '@game/utils/hexMath'

/**
 * Converts a Scenario into a MutableGameState and initialises the engine.
 * Call this when the player selects a scenario from the menu.
 */
export function useScenarioLoader() {
  const gameStore = useGameStore()
  const forcesStore = useForcesStore()
  const intelStore = useIntelligenceStore()

  function loadScenario(scenario: Scenario): void {
    // Clear previous state
    forcesStore.clear()
    intelStore.clear()

    const state = buildState(scenario)
    const engine = gameStore.initEngine(scenario.startTime, scenario.endTime, state)

    // Subscribe intelligence store to engine sighting events
    engine.events.on('SightingDetected', (report) => {
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

// ── State builder ─────────────────────────────────────────────────────────

function buildState(scenario: Scenario): MutableGameState {
  const taskGroups = new Map<string, import('@game/types').TaskGroup>()
  const ships = new Map<string, import('@game/types').Ship>()
  const squadrons = new Map<string, import('@game/types').Squadron>()
  const hexCells = new Map<string, import('@game/types').HexCell>()
  const aircraftTypes = new Map<number, import('@game/types').AircraftType>()
  const shipClasses = new Map<number, import('@game/types').ShipClass>()

  // Reference data
  for (const ac of scenario.aircraftTypes) aircraftTypes.set(ac.id, ac)
  for (const sc of scenario.shipClasses) shipClasses.set(sc.id, sc)

  // Forces
  for (const force of scenario.forces) {
    for (const ship of force.ships) ships.set(ship.id, { ...ship })
    for (const tg of force.taskGroups) taskGroups.set(tg.id, { ...tg })
    for (const sq of force.squadrons) squadrons.set(sq.id, { ...sq })
  }

  // Hex cells — mark atoll/island hexes (Midway Atoll)
  // Default is open sea; only explicitly defined terrain gets a cell entry.
  // For Midway, mark the atoll hex as 'atoll' terrain.
  const atolls: { q: number; r: number }[] = [
    { q: 35, r: 55 }  // Midway Atoll
  ]
  for (const pos of atolls) {
    const key = coordKey(pos)
    hexCells.set(key, { q: pos.q, r: pos.r, terrain: 'atoll' })
  }

  return {
    taskGroups,
    ships,
    squadrons,
    flightPlans: new Map(),
    alliedContacts: new Map(),
    japaneseContacts: new Map(),
    hexCells,
    weatherZones: scenario.weatherZones,
    aircraftTypes,
    shipClasses,
    victoryConditions: scenario.victoryConditions,
    pendingCombatEvents: [],
    pendingGameEvents: []
  }
}
