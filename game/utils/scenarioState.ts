/**
 * Pure-TypeScript utility: converts a Scenario + optional ScenarioParams into
 * a MutableGameState ready to pass to GameEngine.
 *
 * Handles spawnMode:
 *   'fixed'  — positions from the scenario JSON unchanged.
 *   'seeded' — deterministic random offset for each TG (uses params.seed).
 *   'random' — non-deterministic random offset (uses Date.now() as seed).
 *
 * No Vue or Nuxt imports. Safe to call from headless scripts and unit tests.
 */

import type { Scenario } from '../types/scenario'
import type { ScenarioParams } from '../types/scenario'
import { DEFAULT_SCENARIO_PARAMS } from '../types/scenario'
import type { MutableGameState } from '../engine/GameEngine'
import type { HexCoord, HexCell } from '../types/map'
import { coordKey } from './hexMath'
import { createRng } from './dice'

// ── State builder ─────────────────────────────────────────────────────────

/**
 * Build a MutableGameState from a Scenario.
 * Applies spawnMode when params are supplied (defaults to 'fixed').
 */
export function buildStateFromScenario(
  scenario: Scenario,
  params: Partial<ScenarioParams> = {}
): MutableGameState {
  const p: ScenarioParams = { ...DEFAULT_SCENARIO_PARAMS, ...params }

  const taskGroups = new Map<string, import('../types').TaskGroup>()
  const ships = new Map<string, import('../types').Ship>()
  const squadrons = new Map<string, import('../types').Squadron>()
  const hexCells = new Map<string, HexCell>()
  const aircraftTypes = new Map<number, import('../types').AircraftType>()
  const shipClasses = new Map<number, import('../types').ShipClass>()

  // Reference data
  for (const ac of scenario.aircraftTypes) aircraftTypes.set(ac.id, ac)
  for (const sc of scenario.shipClasses) shipClasses.set(sc.id, sc)

  // Forces — deep-copy to avoid mutating the scenario object
  for (const force of scenario.forces) {
    for (const ship of force.ships) ships.set(ship.id, { ...ship })
    for (const tg of force.taskGroups) taskGroups.set(tg.id, { ...tg })
    for (const sq of force.squadrons) squadrons.set(sq.id, { ...sq })
  }

  // Apply spawnMode position offsets
  if (p.spawnMode !== 'fixed') {
    const spawnSeed = p.spawnMode === 'seeded' && p.seed > 0 ? p.seed : Date.now()
    applySpawnOffsets(taskGroups, scenario.mapBounds, spawnSeed)
  }

  // Hex cells — mark terrain (Midway Atoll hex)
  const atolls: HexCoord[] = [{ q: 35, r: 55 }]
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
    pendingGameEvents: [],
    // Fallback to Infinity (unlimited) when scenario doesn't define pools.
    alliedFuelPool: scenario.alliedFuelPool ?? Infinity,
    japaneseFuelPool: scenario.japaneseFuelPool ?? Infinity,
  }
}

// ── Spawn offset helper ───────────────────────────────────────────────────

/**
 * Randomly displaces each task group's position by ±10 hexes (clamped to
 * mapBounds). Uses a seeded Mulberry32 RNG for reproducibility.
 */
function applySpawnOffsets(
  taskGroups: Map<string, import('../types').TaskGroup>,
  bounds: { minQ: number; maxQ: number; minR: number; maxR: number },
  seed: number
): void {
  const rng = createRng(seed)
  const MAX_OFFSET = 10

  for (const tg of taskGroups.values()) {
    const dq = Math.round((rng() * 2 - 1) * MAX_OFFSET)
    const dr = Math.round((rng() * 2 - 1) * MAX_OFFSET)

    tg.position = {
      q: Math.max(bounds.minQ, Math.min(bounds.maxQ, tg.position.q + dq)),
      r: Math.max(bounds.minR, Math.min(bounds.maxR, tg.position.r + dr)),
    }

    // Sync destination offsets if present
    if (tg.destination) {
      tg.destination = {
        q: Math.max(bounds.minQ, Math.min(bounds.maxQ, tg.destination.q + dq)),
        r: Math.max(bounds.minR, Math.min(bounds.maxR, tg.destination.r + dr)),
      }
    }
    if (tg.strikeTargetHex) {
      tg.strikeTargetHex = {
        q: Math.max(bounds.minQ, Math.min(bounds.maxQ, tg.strikeTargetHex.q + dq)),
        r: Math.max(bounds.minR, Math.min(bounds.maxR, tg.strikeTargetHex.r + dr)),
      }
    }
  }
}
