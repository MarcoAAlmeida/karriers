import type {
  GameTime,
  Ship,
  TaskGroup,
  Squadron,
  FlightPlan,
  ContactRecord,
  ContactType,
  HexCell,
  HexCoord,
  CombatEvent,
  GameEvent,
  Side,
  TaskGroupOrder,
  WeatherZone,
  AircraftType,
  ShipClass,
  VictoryCondition
} from '../types'
import { gameTimeToMinutes, minutesToGameTime } from '../types'
import type { TerrainMap } from '../utils/pathfinding'
import { hexDistance } from '../utils/hexMath'
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
import type { ScenarioParams } from '../types/scenario'
import { DEFAULT_SCENARIO_PARAMS } from '../types/scenario'

export type { ScenarioParams }

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
  /** Side aviation fuel pools — initialised from scenario JSON; decremented on mission launch and oiler sinking. */
  alliedFuelPool: number
  japaneseFuelPool: number
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
  movementPaths: ReadonlyMap<string, readonly { q: number, r: number }[]>
  /** Current aviation fuel pools — for HUD fuel gauges. */
  alliedFuelPool: number
  japaneseFuelPool: number
}

/**
 * FOW-filtered observation for one side.
 * Passed to AI agents and logged to D1 — enemy task groups are never exposed
 * directly; only ContactRecords from active scouts are included.
 */
export interface SidedSnapshot {
  side: Side
  time: GameTime
  stepFraction: number
  /** Own task groups — full ground truth, always visible. */
  ownTaskGroups: ReadonlyMap<string, TaskGroup>
  /** Own ships. */
  ownShips: ReadonlyMap<string, Ship>
  /** Own squadrons. */
  ownSquadrons: ReadonlyMap<string, Squadron>
  /** Own flight plans. */
  ownFlightPlans: ReadonlyMap<string, FlightPlan>
  /** Enemy contacts visible to this side (FOW-filtered). */
  enemyContacts: ReadonlyMap<string, ContactRecord>
  combatEvents: CombatEvent[]
  gameEvents: GameEvent[]
  sightingReports: import('../types').SightingReport[]
  alliedFuelPool: number
  japaneseFuelPool: number
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
  ShipSunk: { shipId: string, taskGroupId: string, side: Side, time: GameTime }
  StrikeInbound: { flightPlanId: string, targetTaskGroupId: string, time: GameTime }
  /** Fires when a Japanese strike is launched — Allied player should be warned. */
  EnemyStrikeDetected: { flightPlanId: string, targetHex: HexCoord, estimatedArrivalTime: GameTime }
  /** Fires when a scout mission resolves at its target hex. */
  ScoutContactRevealed: { flightPlanId: string, targetHex: HexCoord, contactFound: boolean, side: Side, time: GameTime }
  ScenarioEnded: { winner: Side | 'draw', time: GameTime, alliedPoints: number, japanesePoints: number }
}

// ── Order payloads ─────────────────────────────────────────────────────────

export type OrderPayload
  = | { type: 'set-order', taskGroupId: string, order: TaskGroupOrder, destination?: { q: number, r: number } }
    | { type: 'set-speed', taskGroupId: string, speedKnots: number }
    | { type: 'set-destination', taskGroupId: string, destination: { q: number, r: number } }
    | { type: 'launch-strike', taskGroupId: string, squadronIds: string[], targetHex: { q: number, r: number }, oneWay?: boolean }
    | { type: 'launch-cap', taskGroupId: string, squadronIds: string[] }
    | { type: 'launch-search', taskGroupId: string, squadronIds: string[], searchSector: number }
    | { type: 'launch-scout', taskGroupId: string, squadronIds: string[], targetHex: { q: number, r: number } }
    | { type: 'recall-mission', flightPlanId: string }

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
  private params: ScenarioParams
  /** Sighting reports from the latest step — included in snapshot. */
  private lastStepSightings: import('../types').SightingReport[] = []
  /** Set once scenario ends to prevent repeated ScenarioEnded events. */
  private scenarioEnded = false

  constructor(
    initialState: MutableGameState,
    startTime: GameTime,
    endTime: GameTime,
    params: Partial<ScenarioParams> = {}
  ) {
    this.params = { ...DEFAULT_SCENARIO_PARAMS, ...params }

    // Seed: explicit > 0 wins; 0 or absent → Date.now()
    const seed = this.params.seed > 0 ? this.params.seed : Date.now()
    this.rng = createRng(seed)

    // durationSteps override: recompute endTime from startTime if provided
    const effectiveEndTime = this.params.durationSteps > 0
      ? minutesToGameTime(gameTimeToMinutes(startTime) + this.params.durationSteps * 30)
      : endTime

    this.state = initialState
    this.timeSystem = new TimeSystem(startTime, effectiveEndTime)
    this.movementSystem = new MovementSystem(buildTerrainMap(initialState.hexCells))
    this.searchSystem = new SearchSystem(this.rng, initialState.aircraftTypes, this.params)
    this.fogOfWarSystem = new FogOfWarSystem()
    this.damageSystem = new DamageSystem(this.rng, initialState.shipClasses, this.params)
    this.airOpsSystem = new AirOpsSystem(initialState.aircraftTypes, initialState.shipClasses, this.params)
    this.combatSystem = new CombatSystem(this.rng, initialState.aircraftTypes, initialState.shipClasses, this.airOpsSystem, this.params)
    this.surfaceCombatSystem = new SurfaceCombatSystem(this.rng, initialState.shipClasses, this.damageSystem)
    this.victorySystem = new VictorySystem(initialState.shipClasses)
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  get isPaused(): boolean { return this.timeSystem.isPaused }
  get scenarioParams(): ScenarioParams { return this.params }
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
          targetHex: payload.targetHex,
          oneWay: payload.oneWay,
          targetTaskGroupId: this.resolveTargetTG(payload.targetHex, payload.taskGroupId)
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
      case 'launch-scout': {
        const order: LaunchOrder = {
          taskGroupId: payload.taskGroupId,
          squadronIds: payload.squadronIds,
          mission: 'scout',
          targetHex: payload.targetHex
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

    // 1b. Ship fuel consumption — fuelLevel decrements proportional to speed each step
    for (const tg of this.state.taskGroups.values()) {
      if (tg.speed <= 0) continue
      for (const shipId of tg.shipIds) {
        const ship = this.state.ships.get(shipId)
        if (!ship || ship.status === 'sunk') continue
        const sc = this.state.shipClasses.get(ship.classId)
        const maxSpeed = sc?.maxSpeed ?? tg.speed
        const fraction = maxSpeed > 0 ? tg.speed / maxSpeed : 0
        ship.fuelLevel = Math.max(0, (ship.fuelLevel ?? 100) - this.params.shipFuelPerStepFull * fraction)
      }
      // Sync TG fuelState as average of non-sunk ship fuel levels
      const liveShips = tg.shipIds
        .map(id => this.state.ships.get(id))
        .filter((s): s is Ship => !!s && s.status !== 'sunk')
      if (liveShips.length > 0) {
        tg.fuelState = liveShips.reduce((sum, s) => sum + (s.fuelLevel ?? 100), 0) / liveShips.length
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
    const taskGroupPositions = new Map<string, { q: number, r: number }>()
    for (const tg of this.state.taskGroups.values()) {
      taskGroupPositions.set(tg.id, tg.position)
    }
    // Pass fuel pools as a mutable object so AirOpsSystem can gate and deduct
    const fuelPools = { allied: this.state.alliedFuelPool, japanese: this.state.japaneseFuelPool }
    const contacts = { allied: this.state.alliedContacts, japanese: this.state.japaneseContacts }
    const newPlans = this.airOpsSystem.processStep(
      this.state.squadrons,
      this.state.flightPlans,
      taskGroupPositions,
      this.state.taskGroups,
      this.state.ships,
      currentTime,
      fuelPools,
      contacts
    )
    this.state.alliedFuelPool = fuelPools.allied
    this.state.japaneseFuelPool = fuelPools.japanese
    for (const plan of newPlans) {
      if (plan.mission === 'strike') {
        this.state.pendingCombatEvents.push({
          type: 'strike-launched',
          flightPlanId: plan.id,
          at: currentTime
        })
        // Sprint 19: warn Allied side when Japanese strike launches
        if (plan.side === 'japanese' && plan.targetHex) {
          this.events.emit('EnemyStrikeDetected', {
            flightPlanId: plan.id,
            targetHex: plan.targetHex,
            estimatedArrivalTime: plan.eta ?? currentTime
          })
        }
      }
      if (plan.mission === 'cap') {
        const sq = this.state.squadrons.get(plan.squadronIds[0] ?? '')
        this.state.pendingCombatEvents.push({
          type: 'cap-launched',
          flightPlanId: plan.id,
          taskGroupId: sq?.taskGroupId ?? '',
          at: currentTime
        })
      }
      if (plan.mission === 'scout' && plan.targetHex) {
        this.state.pendingCombatEvents.push({
          type: 'scout-launched',
          flightPlanId: plan.id,
          at: currentTime,
          targetHex: plan.targetHex
        })
      }
    }

    // 4b. Scout arrivals — scouts that reached their target hex
    const arrivedScouts = this.airOpsSystem.processScoutArrivals(this.state.flightPlans, currentTime)
    for (const scoutPlan of arrivedScouts) {
      const { event, contactFound, contact } = this.resolveScoutMission(scoutPlan, currentTime)
      this.state.pendingCombatEvents.push(event)
      if (contactFound && contact) {
        const contactsMap = scoutPlan.side === 'allied'
          ? this.state.alliedContacts
          : this.state.japaneseContacts
        // Update existing confirmed contact for this TG, or insert new
        const existing = [...contactsMap.values()].find(c => c.confirmedTaskGroupId === contact.confirmedTaskGroupId)
        if (existing) {
          existing.lastKnownHex = contact.lastKnownHex
          existing.lastSeenAt = currentTime
          existing.isActive = true
        } else {
          contactsMap.set(contact.id, contact)
        }
      }
      this.events.emit('ScoutContactRevealed', {
        flightPlanId: scoutPlan.id,
        targetHex: scoutPlan.targetHex!,
        contactFound,
        side: scoutPlan.side,
        time: currentTime
      })
    }

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
      // Extend rearm downtime for recovering squadrons on any hit carrier
      for (const hit of strike.hits) {
        this.airOpsSystem.applyStrikeRearmPenalty(
          hit.shipId, this.state.ships, this.state.squadrons, this.state.taskGroups, currentTime
        )
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

    // 9. Fuel exhaustion — a grounded fleet cannot fight; opponent wins
    if (!this.scenarioEnded) {
      const alliedGrounded = isFinite(this.state.alliedFuelPool) && this.state.alliedFuelPool <= 0
      const japaneseGrounded = isFinite(this.state.japaneseFuelPool) && this.state.japaneseFuelPool <= 0
      if (alliedGrounded || japaneseGrounded) {
        this.scenarioEnded = true
        this.timeSystem.pause()
        let winner: 'allied' | 'japanese' | 'draw'
        if (alliedGrounded && japaneseGrounded) {
          winner = 'draw'
        } else if (alliedGrounded) {
          winner = 'japanese'
        } else {
          winner = 'allied'
        }
        this.events.emit('ScenarioEnded', {
          winner,
          time: currentTime,
          alliedPoints: 0,
          japanesePoints: 0
        })
      }
    }
  }

  // ── Target resolution ─────────────────────────────────────────────────────

  /**
   * Finds the enemy TG closest to targetHex (within 3 hexes) at the moment of
   * a strike launch. The ID is stored in the FlightPlan so the engine can chase
   * the TG as it moves each step.
   */
  private resolveTargetTG(targetHex: HexCoord, launchingTGId: string): string | undefined {
    const launchingTG = this.state.taskGroups.get(launchingTGId)
    if (!launchingTG) return undefined
    const enemySide: Side = launchingTG.side === 'allied' ? 'japanese' : 'allied'

    let bestId: string | undefined
    let bestDist = 3 // max hex radius to match

    for (const tg of this.state.taskGroups.values()) {
      if (tg.side !== enemySide) continue
      const dist = hexDistance(tg.position, targetHex)
      if (dist < bestDist) {
        bestId = tg.id
        bestDist = dist
      }
    }
    return bestId
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  getSnapshot(): GameSnapshot {
    return this.buildSnapshot()
  }

  /** Returns a FOW-filtered observation for the given side. */
  getObservation(side: Side): SidedSnapshot {
    const snap = this.buildSnapshot()

    const ownTaskGroups = new Map<string, TaskGroup>()
    const ownShips = new Map<string, Ship>()
    const ownSquadrons = new Map<string, Squadron>()
    const ownFlightPlans = new Map<string, FlightPlan>()

    for (const [id, tg] of snap.taskGroups) {
      if (tg.side === side) ownTaskGroups.set(id, tg)
    }
    for (const [id, ship] of snap.ships) {
      if (ship.side === side) ownShips.set(id, ship)
    }
    for (const [id, sq] of snap.squadrons) {
      if (sq.side === side) ownSquadrons.set(id, sq)
    }
    for (const [id, fp] of snap.flightPlans) {
      if (fp.side === side) ownFlightPlans.set(id, fp)
    }

    const enemyContacts = side === 'allied'
      ? new Map(snap.alliedContacts)
      : new Map(snap.japaneseContacts)

    return {
      side,
      time: snap.time,
      stepFraction: snap.stepFraction,
      ownTaskGroups,
      ownShips,
      ownSquadrons,
      ownFlightPlans,
      enemyContacts,
      combatEvents: snap.combatEvents,
      gameEvents: snap.gameEvents,
      sightingReports: snap.sightingReports,
      alliedFuelPool: snap.alliedFuelPool,
      japaneseFuelPool: snap.japaneseFuelPool
    }
  }

  private buildSnapshot(): GameSnapshot {
    const movementPaths = new Map<string, readonly { q: number, r: number }[]>()
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
      movementPaths,
      alliedFuelPool: this.state.alliedFuelPool,
      japaneseFuelPool: this.state.japaneseFuelPool
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private emitShipSunk(shipId: string, time: GameTime): void {
    const ship = this.state.ships.get(shipId)
    if (!ship) return
    // Find which TG this ship belongs to and capture its position
    let taskGroupId = ''
    let hex = { q: 0, r: 0 }
    for (const tg of this.state.taskGroups.values()) {
      if (tg.shipIds.includes(shipId)) {
        taskGroupId = tg.id
        hex = { ...tg.position }
        break
      }
    }
    const event = { type: 'ship-sunk' as const, shipId, taskGroupId, side: ship.side, at: time, hex }
    this.state.pendingCombatEvents.push(event)
    this.events.emit('ShipSunk', { shipId, taskGroupId, side: ship.side, time })

    // Carrier sinking: destroy deck squadrons; airborne squadrons rerouted lazily
    const sc = this.state.shipClasses.get(ship.classId)
    if (sc?.type.includes('carrier')) {
      this.airOpsSystem.handleCarrierSunk(
        shipId,
        taskGroupId,
        this.state.squadrons,
        this.state.ships,
        this.state.taskGroups
      )
    }

    // Oiler sinking: deduct fuel payload from the owning side's pool
    if (sc?.type === 'oiler' && sc.fuelPayload) {
      if (ship.side === 'allied') {
        this.state.alliedFuelPool = Math.max(0, this.state.alliedFuelPool - sc.fuelPayload)
      } else {
        this.state.japaneseFuelPool = Math.max(0, this.state.japaneseFuelPool - sc.fuelPayload)
      }
    }
  }

  // ── Scout resolution ──────────────────────────────────────────────────────

  private resolveScoutMission(
    plan: FlightPlan,
    currentTime: GameTime
  ): { event: CombatEvent, contactFound: boolean, contact?: ContactRecord } {
    const targetHex = plan.targetHex ?? { q: 0, r: 0 }
    const enemySide: Side = plan.side === 'allied' ? 'japanese' : 'allied'
    const SCOUT_RADIUS_HEXES = 3

    let foundTG: TaskGroup | undefined
    let minDist = Infinity
    for (const tg of this.state.taskGroups.values()) {
      if (tg.side !== enemySide) continue
      const dist = hexDistance(tg.position, targetHex)
      if (dist <= SCOUT_RADIUS_HEXES && dist < minDist) {
        foundTG = tg
        minDist = dist
      }
    }

    const event: CombatEvent = {
      type: 'scout-resolved',
      flightPlanId: plan.id,
      at: currentTime,
      contactFound: !!foundTG,
      targetHex
    }

    if (!foundTG) return { event, contactFound: false }

    const contactId = `c-scout-${plan.id}`
    const contactType = this.inferContactType(foundTG)
    const contact: ContactRecord = {
      id: contactId,
      forSide: plan.side,
      lastKnownHex: { ...foundTG.position },
      lastSeenAt: currentTime,
      contactType,
      isActive: true,
      confirmedTaskGroupId: foundTG.id,
      sightingIds: []
    }
    return { event, contactFound: true, contact }
  }

  private inferContactType(tg: TaskGroup): ContactType {
    if (tg.currentOrder === 'search' || tg.currentOrder === 'strike') return 'carrier-force'
    if (tg.currentOrder === 'patrol') return 'battleship-force'
    return 'surface-force'
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
    pendingGameEvents: [],
    alliedFuelPool: Infinity,
    japaneseFuelPool: Infinity
  }
}
