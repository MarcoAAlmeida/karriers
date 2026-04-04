import type { HexCoord } from '../types'
import type { TaskGroup } from '../types'
import type { TerrainMap } from '../utils/pathfinding'
import { coordKey, speedToHexesPerStep } from '../utils/hexMath'
import { findPath, advanceAlongPath, isSurfacePassable } from '../utils/pathfinding'

// ── Types ──────────────────────────────────────────────────────────────────

export interface MovementState {
  /** Pre-computed path to destination; recalculated when destination changes. */
  path: HexCoord[]
  /** Fractional hexes accumulated toward the next whole-hex move. */
  hexAccumulator: number
  /** The destination this path was computed for (used to detect changes). */
  pathDestination: HexCoord | null
}

export type MovementStateMap = Map<string, MovementState>

export interface MovementResult {
  taskGroupId: string
  newPosition: HexCoord
  newCourse: number
  arrived: boolean
}

// ── MovementSystem ─────────────────────────────────────────────────────────

export class MovementSystem {
  private terrain: TerrainMap
  private movementStates: MovementStateMap = new Map()

  constructor(terrain: TerrainMap) {
    this.terrain = terrain
  }

  updateTerrain(terrain: TerrainMap): void {
    this.terrain = terrain
  }

  // ── Per-step processing ───────────────────────────────────────────────────

  /**
   * Process movement for all task groups that have a destination set.
   * Called once per 30-minute simulation step.
   * Returns movement results only for task groups that actually moved.
   */
  processStep(taskGroups: Map<string, TaskGroup>): MovementResult[] {
    const results: MovementResult[] = []

    for (const tg of taskGroups.values()) {
      if (!tg.destination) continue
      if (tg.currentOrder === 'standby' || tg.currentOrder === 'refuel') continue

      const result = this.moveTaskGroup(tg)
      if (result) results.push(result)
    }

    return results
  }

  // ── Individual task group movement ───────────────────────────────────────

  private moveTaskGroup(tg: TaskGroup): MovementResult | null {
    if (!tg.destination) return null

    const state = this.getOrCreateState(tg)

    // Replan if destination changed or path is empty
    if (
      !state.pathDestination
      || coordKey(state.pathDestination) !== coordKey(tg.destination)
      || state.path.length < 2
    ) {
      const newPath = findPath(tg.position, tg.destination, this.terrain, isSurfacePassable)
      if (!newPath || newPath.length < 2) {
        // No path — clear destination
        return null
      }
      state.path = newPath
      state.pathDestination = { ...tg.destination }
    }

    // How many hexes can we move this step?
    const hexesThisStep = speedToHexesPerStep(tg.speed)
    state.hexAccumulator += hexesThisStep

    const wholeHexes = Math.floor(state.hexAccumulator)
    if (wholeHexes < 1) {
      // Not enough speed to move a full hex yet
      return null
    }
    state.hexAccumulator -= wholeHexes

    const { position, remainingPath, overflow } = advanceAlongPath(state.path, wholeHexes)
    state.hexAccumulator += overflow
    state.path = remainingPath

    const arrived = remainingPath.length <= 1
    const newCourse = computeBearing(tg.position, position)

    return {
      taskGroupId: tg.id,
      newPosition: position,
      newCourse,
      arrived
    }
  }

  // ── State management ─────────────────────────────────────────────────────

  private getOrCreateState(tg: TaskGroup): MovementState {
    if (!this.movementStates.has(tg.id)) {
      this.movementStates.set(tg.id, {
        path: [],
        hexAccumulator: 0,
        pathDestination: null
      })
    }
    return this.movementStates.get(tg.id)!
  }

  /** Clear movement state for a task group (e.g. when order changes). */
  resetState(taskGroupId: string): void {
    this.movementStates.delete(taskGroupId)
  }

  /** Retrieve interpolation fraction for smooth rendering (0–1 within a hex step). */
  getHexAccumulator(taskGroupId: string): number {
    return this.movementStates.get(taskGroupId)?.hexAccumulator ?? 0
  }

  /** Returns the current planned path for a task group (for rendering). */
  getPath(taskGroupId: string): HexCoord[] {
    return this.movementStates.get(taskGroupId)?.path ?? []
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function computeBearing(from: HexCoord, to: HexCoord): number {
  // We avoid importing hexMath directly here to keep the dependency clean.
  // In Sprint 5 the renderer will call hexMath directly anyway.
  // For now, a simple cube-coordinate based bearing approximation:
  const dq = to.q - from.q
  const dr = to.r - from.r
  if (dq === 0 && dr === 0) return 0
  // Convert axial to rough angle: E=0°, NE=300°, SE=60°, W=180°, NW=240°, SW=120°
  const angle = Math.atan2(-dr - dq * 0.5, dq * 0.866) * 180 / Math.PI
  return (angle + 360) % 360
}
