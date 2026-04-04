import type {
  GameTime,
  Ship,
  TaskGroup,
  Squadron,
  FlightPlan,
  ContactRecord,
  HexCell,
  CombatEvent,
  GameEvent,
  Side,
  TaskGroupOrder
} from '../types'
import type { TerrainMap } from '../utils/pathfinding'
import type { TimeScale } from './TimeSystem'
import { TimeSystem } from './TimeSystem'
import { MovementSystem } from './MovementSystem'
import { TypedEventEmitter } from './EventEmitter'
import { coordKey } from '../utils/hexMath'

// ── Engine state types ─────────────────────────────────────────────────────

export interface MutableGameState {
  taskGroups: Map<string, TaskGroup>
  ships: Map<string, Ship>
  squadrons: Map<string, Squadron>
  flightPlans: Map<string, FlightPlan>
  alliedContacts: Map<string, ContactRecord>
  japaneseContacts: Map<string, ContactRecord>
  hexCells: Map<string, HexCell>
  pendingCombatEvents: CombatEvent[]
  pendingGameEvents: GameEvent[]
}

/**
 * Immutable snapshot exported to Vue/Pinia after each step.
 * All Maps are copied so the engine can mutate state freely without
 * causing unexpected Vue reactivity issues.
 */
export interface GameSnapshot {
  time: GameTime
  stepFraction: number
  taskGroups: ReadonlyMap<string, TaskGroup>
  ships: ReadonlyMap<string, Ship>
  squadrons: ReadonlyMap<string, Squadron>
  flightPlans: ReadonlyMap<string, FlightPlan>
  alliedContacts: ReadonlyMap<string, ContactRecord>
  japaneseContacts: ReadonlyMap<string, ContactRecord>
  combatEvents: CombatEvent[]
  gameEvents: GameEvent[]
  /** Path for each task group (for rendering route lines). */
  movementPaths: ReadonlyMap<string, readonly { q: number; r: number }[]>
}

export interface TickResult {
  stepFired: boolean
  /** Number of completed steps (usually 0 or 1). */
  stepsCompleted: number
  stepFraction: number
  /** Present only when stepFired = true. */
  snapshot?: GameSnapshot
}

// ── Engine events (subscribed to by Pinia stores) ──────────────────────────

export interface EngineEvents {
  StepComplete: GameSnapshot
  SightingDetected: GameEvent
  ShipDamaged: CombatEvent
  ShipSunk: { shipId: string; taskGroupId: string; side: Side; time: GameTime }
  StrikeInbound: { flightPlanId: string; targetTaskGroupId: string; time: GameTime }
  ScenarioEnded: { winner: Side | 'draw'; time: GameTime }
}

// ── Order payload types ────────────────────────────────────────────────────

export type OrderPayload =
  | { type: 'set-order'; taskGroupId: string; order: TaskGroupOrder; destination?: { q: number; r: number } }
  | { type: 'set-speed'; taskGroupId: string; speedKnots: number }
  | { type: 'set-destination'; taskGroupId: string; destination: { q: number; r: number } }

// ── GameEngine ─────────────────────────────────────────────────────────────

export class GameEngine {
  readonly events = new TypedEventEmitter<EngineEvents>()

  private state: MutableGameState
  private timeSystem: TimeSystem
  private movementSystem: MovementSystem

  constructor(
    initialState: MutableGameState,
    startTime: GameTime,
    endTime: GameTime
  ) {
    this.state = initialState
    this.timeSystem = new TimeSystem(startTime, endTime)
    this.movementSystem = new MovementSystem(buildTerrainMap(initialState.hexCells))
  }

  // ── Public controls ───────────────────────────────────────────────────────

  get isPaused(): boolean { return this.timeSystem.isPaused }
  get currentTime(): GameTime { return this.timeSystem.currentTime }
  get timeScale(): TimeScale { return this.timeSystem.timeScale }
  get stepFraction(): number { return this.timeSystem.stepFraction }

  pause(): void { this.timeSystem.pause() }
  resume(): void { this.timeSystem.resume() }
  togglePause(): void { this.timeSystem.togglePause() }
  setTimeScale(scale: TimeScale): void { this.timeSystem.setTimeScale(scale) }

  // ── Order issuance ────────────────────────────────────────────────────────

  issueOrder(payload: OrderPayload): void {
    const tg = this.state.taskGroups.get(payload.taskGroupId)
    if (!tg) return

    switch (payload.type) {
      case 'set-order':
        tg.currentOrder = payload.order
        if (payload.destination) {
          tg.destination = { ...payload.destination }
        }
        this.movementSystem.resetState(tg.id)
        break

      case 'set-speed':
        tg.speed = Math.min(payload.speedKnots, this.maxSpeedFor(tg))
        break

      case 'set-destination':
        tg.destination = { ...payload.destination }
        this.movementSystem.resetState(tg.id)
        break
    }
  }

  // ── Main tick (called every animation frame by useGameLoop) ───────────────

  tick(wallClockDeltaMs: number): TickResult {
    const timeResult = this.timeSystem.tick(wallClockDeltaMs)

    if (!timeResult.stepFired) {
      return {
        stepFired: false,
        stepsCompleted: timeResult.stepsCompleted,
        stepFraction: timeResult.stepFraction
      }
    }

    // Run all simulation subsystems for each completed step
    for (let i = 0; i < timeResult.stepsCompleted; i++) {
      this.runStep()
    }

    const snapshot = this.buildSnapshot()
    this.events.emit('StepComplete', snapshot)

    // Drain pending events
    this.state.pendingCombatEvents = []
    this.state.pendingGameEvents = []

    return {
      stepFired: true,
      stepsCompleted: timeResult.stepsCompleted,
      stepFraction: timeResult.stepFraction,
      snapshot
    }
  }

  // ── Per-step simulation ───────────────────────────────────────────────────

  private runStep(): void {
    // 1. Movement
    const moveResults = this.movementSystem.processStep(this.state.taskGroups)
    for (const result of moveResults) {
      const tg = this.state.taskGroups.get(result.taskGroupId)
      if (!tg) continue
      tg.position = result.newPosition
      tg.course = result.newCourse
      if (result.arrived) {
        tg.destination = undefined
        if (tg.currentOrder === 'retire' || tg.currentOrder === 'patrol') {
          tg.currentOrder = 'standby'
        }
      }
    }

    // 2–9. Other subsystems will be wired in Sprints 3–4.
    //       They are no-ops for now.
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  getSnapshot(): GameSnapshot {
    return this.buildSnapshot()
  }

  private buildSnapshot(): GameSnapshot {
    const movementPaths = new Map<string, readonly { q: number; r: number }[]>()
    for (const tg of this.state.taskGroups.values()) {
      const path = this.movementSystem.getPath(tg.id)
      if (path.length > 0) movementPaths.set(tg.id, path)
    }

    return {
      time: this.timeSystem.currentTime,
      stepFraction: this.timeSystem.stepFraction,
      taskGroups: new Map(this.state.taskGroups),
      ships: new Map(this.state.ships),
      squadrons: new Map(this.state.squadrons),
      flightPlans: new Map(this.state.flightPlans),
      alliedContacts: new Map(this.state.alliedContacts),
      japaneseContacts: new Map(this.state.japaneseContacts),
      combatEvents: [...this.state.pendingCombatEvents],
      gameEvents: [...this.state.pendingGameEvents],
      movementPaths
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private maxSpeedFor(tg: TaskGroup): number {
    // Find the slowest ship in the group
    let min = Infinity
    for (const shipId of tg.shipIds) {
      const ship = this.state.ships.get(shipId)
      if (!ship) continue
      // Reduce max speed based on hull damage
      const factor = 1 - ship.hullDamage / 200  // 50% reduction at 100% hull damage
      min = Math.min(min, 30 * factor)           // 30 kts as fallback if no class data
    }
    return isFinite(min) ? min : 30
  }

  destroy(): void {
    this.events.clear()
  }
}

// ── Utility ────────────────────────────────────────────────────────────────

function buildTerrainMap(hexCells: Map<string, HexCell>): TerrainMap {
  const terrain: TerrainMap = new Map()
  for (const [key, cell] of hexCells) {
    terrain.set(key, cell.terrain)
  }
  return terrain
}

// ── Factory ────────────────────────────────────────────────────────────────

/** Create an empty engine state (useful for testing and Sprint 2 dev mode). */
export function createEmptyState(): MutableGameState {
  return {
    taskGroups: new Map(),
    ships: new Map(),
    squadrons: new Map(),
    flightPlans: new Map(),
    alliedContacts: new Map(),
    japaneseContacts: new Map(),
    hexCells: new Map(),
    pendingCombatEvents: [],
    pendingGameEvents: []
  }
}
