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
  TaskGroupOrder,
  WeatherZone,
  AircraftType,
  ShipClass,
  VictoryCondition
} from '../types'
import type { TerrainMap } from '../utils/pathfinding'
import type { TimeScale } from './TimeSystem'
import { TimeSystem } from './TimeSystem'
import { MovementSystem } from './MovementSystem'
import { SearchSystem } from './SearchSystem'
import { FogOfWarSystem } from './FogOfWarSystem'
import { AirOpsSystem } from './AirOpsSystem'
import type { LaunchOrder } from './AirOpsSystem'
import { CombatSystem } from './CombatSystem'
import { DamageSystem } from './DamageSystem'
import { SurfaceCombatSystem } from './SurfaceCombatSystem'
import { VictorySystem } from './VictorySystem'
import { TypedEventEmitter } from './EventEmitter'
import { createRng } from '../utils/dice'
import type { Rng } from '../utils/dice'

// ── Engine state types ─────────────────────────────────────────────────────

export interface MutableGameState {
  taskGroups: Map<string, TaskGroup>
  ships: Map<string, Ship>
  squadrons: Map<string, Squadron>
  flightPlans: Map<string, FlightPlan>
  alliedContacts: Map<string, ContactRecord>
  japaneseContacts: Map<string, ContactRecord>
  hexCells: Map<string, HexCell>
  weatherZones: WeatherZone[]
  /** Reference data — looked up by subsystems at runtime. */
  aircraftTypes: Map<number, AircraftType>
  shipClasses: Map<number, ShipClass>
  victoryConditions: VictoryCondition[]
  pendingCombatEvents: CombatEvent[]
  pendingGameEvents: GameEvent[]
}

/**
 * Immutable snapshot exported to Vue/Pinia after each step.
 * Maps are shallow-copied so the engine can mutate freely without
 * causing unexpected Vue reactivity surprises.
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
  sightingReports: import('../types').SightingReport[]
  /** Planned movement path for each task group (for route line rendering). */
  movementPaths: ReadonlyMap<string, readonly { q: number; r: number }[]>
}

export interface TickResult {
  stepFired: boolean
  stepsCompleted: number
  stepFraction: number
  snapshot?: GameSnapshot
}

// ── Engine events ──────────────────────────────────────────────────────────

export interface EngineEvents {
  StepComplete: GameSnapshot
  SightingDetected: import('../types').SightingReport
  ShipDamaged: CombatEvent
  ShipSunk: { shipId: string; taskGroupId: string; side: Side; time: GameTime }
  StrikeInbound: { flightPlanId: string; targetTaskGroupId: string; time: GameTime }
  ScenarioEnded: { winner: Side | 'draw'; time: GameTime; alliedPoints: number; japanesePoints: number }
}

// ── Order payloads ─────────────────────────────────────────────────────────

export type OrderPayload =
  | { type: 'set-order'; taskGroupId: string; order: TaskGroupOrder; destination?: { q: number; r: number } }
  | { type: 'set-speed'; taskGroupId: string; speedKnots: number }
  | { type: 'set-destination'; taskGroupId: string; destination: { q: number; r: number } }
  | { type: 'launch-strike'; taskGroupId: string; squadronIds: string[]; targetHex: { q: number; r: number } }
  | { type: 'launch-cap'; taskGroupId: string; squadronIds: string[] }
  | { type: 'launch-search'; taskGroupId: string; squadronIds: string[]; searchSector: number }
  | { type: 'recall-mission'; flightPlanId: string }

// ── GameEngine ─────────────────────────────────────────────────────────────

export class GameEngine {
  readonly events = new TypedEventEmitter<EngineEvents>()

  private state: MutableGameState
  private timeSystem: TimeSystem
  private movementSystem: MovementSystem
  private searchSystem: SearchSystem
  private fogOfWarSystem: FogOfWarSystem
  private airOpsSystem: AirOpsSystem
  private combatSystem: CombatSystem
  private damageSystem: DamageSystem
  private surfaceCombatSystem: SurfaceCombatSystem
  private victorySystem: VictorySystem
  private rng: Rng
  /** Sighting reports from the latest step — included in snapshot. */
  private lastStepSightings: import('../types').SightingReport[] = []
  /** Set once scenario ends to prevent repeated ScenarioEnded events. */
  private scenarioEnded = false

  constructor(
    initialState: MutableGameState,
    startTime: GameTime,
    endTime: GameTime,
    seed = Date.now()
  ) {
    this.state = initialState
    this.rng = createRng(seed)
    this.timeSystem = new TimeSystem(startTime, endTime)
    this.movementSystem = new MovementSystem(buildTerrainMap(initialState.hexCells))
    this.searchSystem = new SearchSystem(this.rng, initialState.aircraftTypes)
    this.fogOfWarSystem = new FogOfWarSystem()
    this.damageSystem = new DamageSystem(this.rng, initialState.shipClasses)
    this.airOpsSystem = new AirOpsSystem(initialState.aircraftTypes)
    this.combatSystem = new CombatSystem(this.rng, initialState.aircraftTypes, initialState.shipClasses, this.airOpsSystem)
    this.surfaceCombatSystem = new SurfaceCombatSystem(this.rng, initialState.shipClasses, this.damageSystem)
    this.victorySystem = new VictorySystem(initialState.shipClasses)
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  get isPaused(): boolean { return this.timeSystem.isPaused }
  get currentTime(): GameTime { return this.timeSystem.currentTime }
  get timeScale(): TimeScale { return this.timeSystem.timeScale }
  get stepFraction(): number { return this.timeSystem.stepFraction }

  pause(): void { this.timeSystem.pause() }
  resume(): void { this.timeSystem.resume() }
  togglePause(): void { this.timeSystem.togglePause() }
  setTimeScale(scale: TimeScale): void { this.timeSystem.setTimeScale(scale) }

  // ── Orders ────────────────────────────────────────────────────────────────

  issueOrder(payload: OrderPayload): void {
    switch (payload.type) {
      case 'set-order':
      case 'set-speed':
      case 'set-destination': {
        const tg = this.state.taskGroups.get(payload.taskGroupId)
        if (!tg) return
        if (payload.type === 'set-order') {
          tg.currentOrder = payload.order
          if (payload.destination) tg.destination = { ...payload.destination }
          this.movementSystem.resetState(tg.id)
        } else if (payload.type === 'set-speed') {
          tg.speed = Math.min(payload.speedKnots, this.maxSpeedFor(tg))
        } else {
          tg.destination = { ...payload.destination }
          this.movementSystem.resetState(tg.id)
        }
        break
      }
      case 'launch-strike': {
        const order: LaunchOrder = {
          taskGroupId: payload.taskGroupId,
          squadronIds: payload.squadronIds,
          mission: 'strike',
          targetHex: payload.targetHex
        }
        this.airOpsSystem.queueLaunch(order)
        break
      }
      case 'launch-cap': {
        const order: LaunchOrder = {
          taskGroupId: payload.taskGroupId,
          squadronIds: payload.squadronIds,
          mission: 'cap'
        }
        this.airOpsSystem.queueLaunch(order)
        break
      }
      case 'launch-search': {
        const order: LaunchOrder = {
          taskGroupId: payload.taskGroupId,
          squadronIds: payload.squadronIds,
          mission: 'search',
          searchSector: payload.searchSector
        }
        this.airOpsSystem.queueLaunch(order)
        break
      }
      case 'recall-mission':
        this.airOpsSystem.recallMission(payload.flightPlanId, this.state.flightPlans, this.timeSystem.currentTime)
        break
    }
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  tick(wallClockDeltaMs: number): TickResult {
    const timeResult = this.timeSystem.tick(wallClockDeltaMs)

    if (!timeResult.stepFired) {
      return {
        stepFired: false,
        stepsCompleted: timeResult.stepsCompleted,
        stepFraction: timeResult.stepFraction
      }
    }

    for (let i = 0; i < timeResult.stepsCompleted; i++) {
      this.runStep()
    }

    const snapshot = this.buildSnapshot()
    this.events.emit('StepComplete', snapshot)

    // Emit individual sighting events for UI toasts
    for (const report of this.lastStepSightings) {
      this.events.emit('SightingDetected', report)
    }

    this.state.pendingCombatEvents = []
    this.state.pendingGameEvents = []

    return {
      stepFired: true,
      stepsCompleted: timeResult.stepsCompleted,
      stepFraction: timeResult.stepFraction,
      snapshot
    }
  }

  // ── Step ──────────────────────────────────────────────────────────────────

  private runStep(): void {
    const currentTime = this.timeSystem.currentTime

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

    // 2. Search & sighting
    const sightings = this.searchSystem.processStep(
      this.state.taskGroups,
      this.state.squadrons,
      this.state.weatherZones,
      currentTime
    )
    this.lastStepSightings = sightings

    // 3. Fog of war — integrate new sightings, decay old contacts
    this.fogOfWarSystem.processStep(
      this.state.alliedContacts,
      this.state.japaneseContacts,
      sightings,
      this.state.taskGroups,
      currentTime
    )

    // 4. Air operations — process recoveries and queued launches
    const taskGroupPositions = new Map<string, { q: number; r: number }>()
    for (const tg of this.state.taskGroups.values()) {
      taskGroupPositions.set(tg.id, tg.position)
    }
    this.airOpsSystem.processStep(
      this.state.squadrons,
      this.state.flightPlans,
      taskGroupPositions,
      currentTime
    )

    // 5. Air combat — resolve strikes that have arrived
    const strikeResults = this.combatSystem.processStep(
      this.state.flightPlans,
      this.state.taskGroups,
      this.state.ships,
      this.state.squadrons,
      currentTime
    )
    for (const strike of strikeResults) {
      this.events.emit('StrikeInbound', {
        flightPlanId: strike.flightPlanId,
        targetTaskGroupId: strike.targetTaskGroupId,
        time: currentTime
      })
      // Apply damage from strike hits
      const sunkIds = this.damageSystem.applyStrikeHits(strike.hits, this.state.ships, this.state.squadrons)
      for (const shipId of sunkIds) {
        this.emitShipSunk(shipId, currentTime)
      }
      // Record as combat event
      this.state.pendingCombatEvents.push({ type: 'strike-resolved', result: strike })
      // Individual ship-damaged events
      for (const hit of strike.hits) {
        const dmgEvent: CombatEvent = {
          type: 'ship-damaged',
          shipId: hit.shipId,
          damageType: hit.damageType,
          at: currentTime
        }
        this.state.pendingCombatEvents.push(dmgEvent)
        this.events.emit('ShipDamaged', dmgEvent)
      }
    }

    // 6. Damage control — fires, flooding, per-step decay
    const damageSunk = this.damageSystem.processStep(this.state.ships)
    for (const shipId of damageSunk) {
      this.emitShipSunk(shipId, currentTime)
    }

    // 7. Surface combat — resolve engagements at shared hexes
    const surfaceResults = this.surfaceCombatSystem.processStep(
      this.state.taskGroups,
      this.state.ships,
      currentTime
    )
    for (const battle of surfaceResults) {
      for (const shipId of battle.alliedShipsSunk) {
        this.emitShipSunk(shipId, currentTime)
      }
      for (const shipId of battle.japaneseShipsSunk) {
        this.emitShipSunk(shipId, currentTime)
      }
      this.state.pendingCombatEvents.push({ type: 'surface-combat', result: battle })
    }

    // 8. Victory evaluation
    if (!this.scenarioEnded && this.state.victoryConditions.length > 0) {
      const victoryState = this.victorySystem.evaluate(
        this.state.victoryConditions,
        this.state.ships,
        this.state.taskGroups,
        currentTime,
        this.timeSystem.endTime
      )
      if (victoryState.winner !== null) {
        this.scenarioEnded = true
        this.timeSystem.pause()
        this.events.emit('ScenarioEnded', {
          winner: victoryState.winner,
          time: currentTime,
          alliedPoints: victoryState.alliedPoints,
          japanesePoints: victoryState.japanesePoints
        })
      }
    }
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
      sightingReports: [...this.lastStepSightings],
      movementPaths
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private emitShipSunk(shipId: string, time: GameTime): void {
    const ship = this.state.ships.get(shipId)
    if (!ship) return
    // Find which TG this ship belongs to
    let taskGroupId = ''
    for (const tg of this.state.taskGroups.values()) {
      if (tg.shipIds.includes(shipId)) { taskGroupId = tg.id; break }
    }
    const event = { type: 'ship-sunk' as const, shipId, taskGroupId, side: ship.side, at: time }
    this.state.pendingCombatEvents.push(event)
    this.events.emit('ShipSunk', { shipId, taskGroupId, side: ship.side, time })
  }

  private maxSpeedFor(tg: TaskGroup): number {
    let min = Infinity
    for (const shipId of tg.shipIds) {
      const ship = this.state.ships.get(shipId)
      if (!ship) continue
      const classData = this.state.shipClasses.get(ship.classId)
      const baseSpeed = classData?.maxSpeed ?? 25
      const factor = 1 - ship.hullDamage / 200
      min = Math.min(min, baseSpeed * factor)
    }
    return isFinite(min) ? min : 25
  }

  destroy(): void {
    this.events.clear()
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────

function buildTerrainMap(hexCells: Map<string, HexCell>): TerrainMap {
  const terrain: TerrainMap = new Map()
  for (const [key, cell] of hexCells) {
    terrain.set(key, cell.terrain)
  }
  return terrain
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createEmptyState(): MutableGameState {
  return {
    taskGroups: new Map(),
    ships: new Map(),
    squadrons: new Map(),
    flightPlans: new Map(),
    alliedContacts: new Map(),
    japaneseContacts: new Map(),
    hexCells: new Map(),
    weatherZones: [],
    aircraftTypes: new Map(),
    shipClasses: new Map(),
    victoryConditions: [],
    pendingCombatEvents: [],
    pendingGameEvents: []
  }
}
