import type {
  GameTime,
  Squadron,
  FlightPlan,
  AircraftType,
  MissionType,
  HexCoord
} from '../types'
import { gameTimeToMinutes, minutesToGameTime } from '../types'
import { hexDistance, NM_PER_HEX } from '../utils/hexMath'

// ── Constants ──────────────────────────────────────────────────────────────

/** Steps needed to spot aircraft on deck before launch. */
const SPOT_STEPS = 1
/** Steps needed to recover and secure aircraft after landing. */
const RECOVERY_STEPS = 1
/** Minimum fuel reserve fraction — strikes beyond this range are rejected. */
const FUEL_RESERVE = 0.15

// ── Launch order (queued by GameEngine.issueOrder) ─────────────────────────

export interface LaunchOrder {
  taskGroupId: string
  squadronIds: string[]
  mission: MissionType
  targetHex?: HexCoord
  searchSector?: number
}

// ── AirOpsSystem ───────────────────────────────────────────────────────────

export class AirOpsSystem {
  private aircraftTypes: Map<number, AircraftType>
  private planCounter = 0
  private pendingLaunches: LaunchOrder[] = []

  constructor(aircraftTypes: Map<number, AircraftType>) {
    this.aircraftTypes = aircraftTypes
  }

  // ── Queue management ──────────────────────────────────────────────────────

  queueLaunch(order: LaunchOrder): void {
    this.pendingLaunches.push(order)
  }

  // ── Per-step processing ───────────────────────────────────────────────────

  /**
   * Process all air operations for one 30-minute step.
   * Returns newly created FlightPlans (to be merged into game state).
   */
  processStep(
    squadrons: Map<string, Squadron>,
    flightPlans: Map<string, FlightPlan>,
    taskGroupPositions: Map<string, HexCoord>,
    currentTime: GameTime
  ): FlightPlan[] {
    const newPlans: FlightPlan[] = []

    // 1. Process recoveries — airborne squadrons whose returnEta has passed
    this.processRecoveries(squadrons, flightPlans, currentTime)

    // 2. Advance spotted squadrons (spot → airborne on next step)
    this.advanceSpottedSquadrons(squadrons, flightPlans, currentTime)

    // 3. Process pending launch orders
    for (const order of this.pendingLaunches) {
      const tgPos = taskGroupPositions.get(order.taskGroupId)
      if (!tgPos) continue

      const plan = this.executeLaunchOrder(order, squadrons, tgPos, currentTime)
      if (plan) {
        flightPlans.set(plan.id, plan)
        newPlans.push(plan)
      }
    }
    this.pendingLaunches = []

    return newPlans
  }

  // ── Recall ────────────────────────────────────────────────────────────────

  recallMission(flightPlanId: string, flightPlans: Map<string, FlightPlan>, currentTime: GameTime): void {
    const plan = flightPlans.get(flightPlanId)
    if (!plan || plan.status === 'recovered' || plan.status === 'lost') return
    // Force early return — ETA becomes now
    plan.returnEta = currentTime
    plan.status = 'returning'
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private executeLaunchOrder(
    order: LaunchOrder,
    squadrons: Map<string, Squadron>,
    carrierPosition: HexCoord,
    currentTime: GameTime
  ): FlightPlan | null {
    const validSquadronIds: string[] = []

    for (const sqId of order.squadronIds) {
      const sq = squadrons.get(sqId)
      if (!sq) continue
      if (sq.deckStatus === 'airborne' || sq.deckStatus === 'recovering') continue
      if (sq.deckStatus === 'destroyed') continue
      if (sq.aircraftCount === 0) continue

      // Check range for strike/search missions
      if (order.targetHex && order.mission !== 'cap') {
        const aircraft = this.aircraftTypes.get(sq.aircraftTypeId)
        if (aircraft) {
          const distNm = hexDistance(carrierPosition, order.targetHex) * NM_PER_HEX
          const maxStrikeRange = aircraft.maxRange * (0.5 - FUEL_RESERVE)
          if (distNm > maxStrikeRange) continue  // out of range
        }
      }

      validSquadronIds.push(sqId)
    }

    if (validSquadronIds.length === 0) return null

    // Determine ETA
    const eta = this.computeEta(validSquadronIds, squadrons, carrierPosition, order.targetHex, currentTime)
    const returnEta = this.computeReturnEta(validSquadronIds, squadrons, carrierPosition, order.targetHex, eta)

    const plan: FlightPlan = {
      id: `fp-${this.planCounter++}`,
      squadronIds: validSquadronIds,
      mission: order.mission,
      side: squadrons.get(validSquadronIds[0]!)!.side,
      targetHex: order.targetHex,
      searchSector: order.searchSector,
      launchTime: currentTime,
      eta,
      returnEta,
      status: 'airborne',
      aircraftLost: 0
    }

    // Transition squadrons to airborne
    for (const sqId of validSquadronIds) {
      const sq = squadrons.get(sqId)!
      sq.deckStatus = 'airborne'
      sq.currentMissionId = plan.id
      sq.fuelLoad = 100
    }

    return plan
  }

  private processRecoveries(
    squadrons: Map<string, Squadron>,
    flightPlans: Map<string, FlightPlan>,
    currentTime: GameTime
  ): void {
    const nowMin = gameTimeToMinutes(currentTime)

    for (const plan of flightPlans.values()) {
      if (plan.status !== 'returning' && plan.status !== 'inbound') continue
      if (!plan.returnEta) continue

      if (gameTimeToMinutes(plan.returnEta) <= nowMin) {
        plan.status = 'recovered'
        for (const sqId of plan.squadronIds) {
          const sq = squadrons.get(sqId)
          if (!sq) continue
          sq.deckStatus = 'recovering'
          sq.currentMissionId = undefined
        }
      }
    }

    // Advance recovering squadrons to hangared after RECOVERY_STEPS
    for (const sq of squadrons.values()) {
      if (sq.deckStatus === 'recovering') {
        sq.deckStatus = 'hangared'
        sq.fuelLoad = 0  // needs refueling
        sq.ordnanceLoaded = 'none'
      }
    }
  }

  private advanceSpottedSquadrons(
    squadrons: Map<string, Squadron>,
    _flightPlans: Map<string, FlightPlan>,
    _currentTime: GameTime
  ): void {
    // Spotted squadrons that don't have an assigned mission stay spotted
    // (they'll be launched when an order comes in next step)
    // No automatic advancement — player must explicitly launch
  }

  // ── ETA computation ───────────────────────────────────────────────────────

  private computeEta(
    squadronIds: string[],
    squadrons: Map<string, Squadron>,
    origin: HexCoord,
    targetHex: HexCoord | undefined,
    launchTime: GameTime
  ): GameTime {
    if (!targetHex) {
      // CAP or search — orbit for 3 steps (90 min) then return
      return minutesToGameTime(gameTimeToMinutes(launchTime) + 90)
    }

    const slowestSpeed = this.slowestCruiseSpeed(squadronIds, squadrons)
    const distNm = hexDistance(origin, targetHex) * NM_PER_HEX
    const flightMinutes = (distNm / slowestSpeed) * 60
    // Round up to next 30-min step
    const steps = Math.ceil(flightMinutes / 30)
    return minutesToGameTime(gameTimeToMinutes(launchTime) + steps * 30)
  }

  private computeReturnEta(
    squadronIds: string[],
    squadrons: Map<string, Squadron>,
    origin: HexCoord,
    targetHex: HexCoord | undefined,
    eta: GameTime
  ): GameTime {
    if (!targetHex) {
      return minutesToGameTime(gameTimeToMinutes(eta) + 30)
    }
    const slowestSpeed = this.slowestCruiseSpeed(squadronIds, squadrons)
    const distNm = hexDistance(origin, targetHex) * NM_PER_HEX
    const returnMinutes = (distNm / slowestSpeed) * 60
    const steps = Math.ceil(returnMinutes / 30)
    return minutesToGameTime(gameTimeToMinutes(eta) + steps * 30 + RECOVERY_STEPS * 30)
  }

  private slowestCruiseSpeed(squadronIds: string[], squadrons: Map<string, Squadron>): number {
    let slowest = Infinity
    for (const sqId of squadronIds) {
      const sq = squadrons.get(sqId)
      if (!sq) continue
      const aircraft = this.aircraftTypes.get(sq.aircraftTypeId)
      if (aircraft) slowest = Math.min(slowest, aircraft.cruiseSpeed)
    }
    return isFinite(slowest) ? slowest : 150
  }

  // ── Query helpers ─────────────────────────────────────────────────────────

  /** Returns all CAP squadrons defending a task group at the given hex. */
  getCAPSquadrons(
    taskGroupId: string,
    squadrons: Map<string, Squadron>,
    flightPlans: Map<string, FlightPlan>
  ): Squadron[] {
    const capSquadrons: Squadron[] = []
    for (const plan of flightPlans.values()) {
      if (plan.mission !== 'cap') continue
      if (plan.status !== 'airborne') continue
      // Check if this plan belongs to the defending task group
      const sq = squadrons.get(plan.squadronIds[0] ?? '')
      if (sq && sq.taskGroupId === taskGroupId) {
        for (const sqId of plan.squadronIds) {
          const s = squadrons.get(sqId)
          if (s) capSquadrons.push(s)
        }
      }
    }
    return capSquadrons
  }

  /** Returns any squadrons with aircraft spotted on deck (dangerous if ship is hit). */
  getSpottedSquadrons(taskGroupId: string, squadrons: Map<string, Squadron>): Squadron[] {
    return [...squadrons.values()].filter(
      sq => sq.taskGroupId === taskGroupId && sq.deckStatus === 'spotted'
    )
  }
}
