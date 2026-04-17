import type {
  GameTime,
  Squadron,
  FlightPlan,
  AircraftType,
  ShipClass,
  Ship,
  TaskGroup,
  MissionType,
  HexCoord,
  Side,
  ContactRecord
} from '../types'
import { gameTimeToMinutes, minutesToGameTime } from '../types'
import { hexDistance, lerpHex, NM_PER_HEX } from '../utils/hexMath'
import type { ScenarioParams } from '../types/scenario'
import { DEFAULT_SCENARIO_PARAMS } from '../types/scenario'

// ── Constants (internal only) ──────────────────────────────────────────────

/** Steps needed to spot aircraft on deck before launch. */
const SPOT_STEPS = 1
/** Steps needed to recover and secure aircraft after landing. */
const RECOVERY_STEPS = 1

// ── Launch order (queued by GameEngine.issueOrder) ─────────────────────────

export interface LaunchOrder {
  taskGroupId: string
  squadronIds: string[]
  mission: MissionType
  targetHex?: HexCoord
  searchSector?: number
  /** When true the range check allows the full one-way range (no return fuel required). */
  oneWay?: boolean
  /** ID of the enemy TG being targeted — enables live position tracking in flight. */
  targetTaskGroupId?: string
}

// ── AirOpsSystem ───────────────────────────────────────────────────────────

export class AirOpsSystem {
  private aircraftTypes: Map<number, AircraftType>
  private shipClasses: Map<number, ShipClass>
  private params: ScenarioParams
  private planCounter = 0
  private pendingLaunches: LaunchOrder[] = []

  constructor(
    aircraftTypes: Map<number, AircraftType>,
    shipClasses: Map<number, ShipClass>,
    params: ScenarioParams = DEFAULT_SCENARIO_PARAMS
  ) {
    this.aircraftTypes = aircraftTypes
    this.shipClasses = shipClasses
    this.params = params
  }

  // ── Queue management ──────────────────────────────────────────────────────

  queueLaunch(order: LaunchOrder): void {
    this.pendingLaunches.push(order)
  }

  // ── Per-step processing ───────────────────────────────────────────────────

  /**
   * Process all air operations for one 30-minute step.
   * Returns newly created FlightPlans (to be merged into game state).
   *
   * `fuelPools` is mutated in place — allied/japanese pool values are decremented
   * on each successful launch. The caller (GameEngine) writes the values back to state.
   */
  processStep(
    squadrons: Map<string, Squadron>,
    flightPlans: Map<string, FlightPlan>,
    taskGroupPositions: Map<string, HexCoord>,
    taskGroups: Map<string, TaskGroup>,
    ships: Map<string, Ship>,
    currentTime: GameTime,
    fuelPools: { allied: number; japanese: number },
    contacts: { allied: Map<string, ContactRecord>; japanese: Map<string, ContactRecord> }
  ): FlightPlan[] {
    const newPlans: FlightPlan[] = []

    // 0. CAP/search orbit expiry — once eta has passed, transition to returning
    this.processOrbitExpiry(flightPlans, currentTime)

    // 0b. Update live in-flight positions (chase moving targets; re-anchor return leg)
    this.updateFlightPositions(flightPlans, taskGroups, squadrons, contacts, currentTime)

    // 1. Process recoveries — airborne squadrons whose returnEta has passed
    this.processRecoveries(squadrons, flightPlans, taskGroups, ships, currentTime)

    // 2. Advance spotted squadrons (spot → airborne on next step)
    this.advanceSpottedSquadrons(squadrons, flightPlans, currentTime)

    // 3. Process pending launch orders
    for (const order of this.pendingLaunches) {
      const tgPos = taskGroupPositions.get(order.taskGroupId)
      if (!tgPos) continue

      const plan = this.executeLaunchOrder(order, squadrons, taskGroups, ships, tgPos, currentTime, fuelPools)
      if (plan) {
        flightPlans.set(plan.id, plan)
        newPlans.push(plan)
      }
    }
    this.pendingLaunches = []

    return newPlans
  }

  // ── Scout arrivals ────────────────────────────────────────────────────────

  /**
   * Finds scout missions whose ETA has been reached and transitions them to
   * 'returning'. Returns the plans so GameEngine can resolve contacts.
   * Called after processStep() in GameEngine.runStep().
   */
  processScoutArrivals(
    flightPlans: Map<string, FlightPlan>,
    currentTime: GameTime
  ): FlightPlan[] {
    const nowMin = gameTimeToMinutes(currentTime)
    const arrived: FlightPlan[] = []

    for (const plan of flightPlans.values()) {
      if (plan.mission !== 'scout') continue
      if (plan.status !== 'airborne') continue
      if (!plan.eta) continue
      if (gameTimeToMinutes(plan.eta) > nowMin) continue

      plan.status = 'returning'
      arrived.push(plan)
    }
    return arrived
  }

  // ── Recall ────────────────────────────────────────────────────────────────

  recallMission(flightPlanId: string, flightPlans: Map<string, FlightPlan>, currentTime: GameTime): void {
    const plan = flightPlans.get(flightPlanId)
    if (!plan || plan.status === 'recovered' || plan.status === 'lost') return
    // Force early return — ETA becomes now
    plan.returnEta = currentTime
    plan.status = 'returning'
  }

  // ── Carrier-sunk cascade (called by GameEngine when a carrier sinks) ───────

  /**
   * Handles immediate consequences of a carrier sinking:
   * - If this was the last operational carrier in the TG, all on-deck
   *   squadrons are immediately destroyed.
   * - Airborne squadrons are handled lazily in processRecoveries when they
   *   try to come home.
   */
  handleCarrierSunk(
    sunkShipId: string,
    tgId: string,
    squadrons: Map<string, Squadron>,
    ships: Map<string, Ship>,
    taskGroups: Map<string, TaskGroup>
  ): void {
    const tg = taskGroups.get(tgId)
    if (!tg) return

    // Any other operational carrier still in this TG?
    const hasRemainingCarrier = tg.shipIds
      .filter(id => id !== sunkShipId)
      .some(id => {
        const ship = ships.get(id)
        if (!ship || ship.status === 'sunk') return false
        const sc = this.shipClasses.get(ship.classId)
        return sc?.type.includes('carrier') ?? false
      })

    if (hasRemainingCarrier) return  // other carriers absorb the survivors

    // Last carrier in TG — destroy all on-deck squadrons
    for (const sq of squadrons.values()) {
      if (sq.taskGroupId !== tgId) continue
      if (sq.deckStatus === 'airborne' || sq.deckStatus === 'recovering') continue
      if (sq.deckStatus === 'destroyed') continue
      sq.deckStatus = 'destroyed'
      sq.aircraftCount = 0
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  /**
   * Updates live in-flight hex positions for all airborne and returning plans:
   * - Outbound: chases the target TG (or last known contact) and lerps currentHex
   *   from launchHex toward the (possibly moved) targetHex.
   * - Returning: re-anchors returnEta to the carrier's current position and lerps
   *   currentHex from the strike point (targetHex at eta) toward the carrier.
   */
  private updateFlightPositions(
    flightPlans: Map<string, FlightPlan>,
    taskGroups: Map<string, TaskGroup>,
    squadrons: Map<string, Squadron>,
    contacts: { allied: Map<string, ContactRecord>; japanese: Map<string, ContactRecord> },
    currentTime: GameTime
  ): void {
    const nowMin = gameTimeToMinutes(currentTime)

    for (const plan of flightPlans.values()) {
      if (plan.status === 'airborne') {
        // ── Chase target TG (or last known contact) ───────────────────────
        if (plan.targetTaskGroupId) {
          const sideContacts = plan.side === 'allied' ? contacts.allied : contacts.japanese
          // Find an active contact for this TG — use its lastKnownHex
          const contact = [...sideContacts.values()]
            .find(c => c.confirmedTaskGroupId === plan.targetTaskGroupId && c.isActive)
          if (contact) {
            plan.targetHex = contact.lastKnownHex
          }
          // If no active contact, keep last targetHex (FOW — last known position)
        }

        // ── Lerp currentHex along outbound leg ────────────────────────────
        if (plan.launchHex && plan.targetHex && plan.eta) {
          const launchMin = gameTimeToMinutes(plan.launchTime)
          const etaMin = gameTimeToMinutes(plan.eta)
          const total = etaMin - launchMin
          const t = total > 0 ? Math.min(1, Math.max(0, (nowMin - launchMin) / total)) : 1
          plan.currentHex = lerpHex(plan.launchHex, plan.targetHex, t)
          plan.currentHexTime = currentTime
        }

      } else if (plan.status === 'returning') {
        // All returning missions (strike, CAP, scout, search…) re-anchor returnEta
        // to the carrier's current position every step so planes always fly home to
        // where the carrier actually is, not where it was at launch.
        const sq = squadrons.get(plan.squadronIds[0] ?? '')
        if (!sq) continue
        const homeTG = taskGroups.get(sq.taskGroupId)
        if (!homeTG) continue

        // ── Re-anchor returnEta to carrier's current position ─────────────
        // fromHex: best estimate of where the planes are right now.
        //   • Strikes:   currentHex was being lerped toward target, now near targetHex.
        //   • CAP/search: currentHex = launchHex (orbit overhead the carrier).
        const fromHex = plan.currentHex ?? plan.launchHex ?? homeTG.position
        const distNm = hexDistance(fromHex, homeTG.position) * NM_PER_HEX
        const speed = this.slowestCruiseSpeed(plan.squadronIds, squadrons)
        const remainingMin = speed > 0 ? (distNm / speed) * 60 : 0

        // If planes are effectively at the carrier already (< 15 min away),
        // set returnEta = now so processRecoveries fires this step.
        if (remainingMin < 15) {
          plan.returnEta = currentTime
        } else {
          plan.returnEta = minutesToGameTime(nowMin + Math.ceil(remainingMin / 30) * 30)
        }

        // ── Lerp currentHex from current position toward carrier ──────────
        const baseMin = plan.eta ? gameTimeToMinutes(plan.eta) : (nowMin - 30)
        const returnEtaMin = gameTimeToMinutes(plan.returnEta)
        const total = returnEtaMin - baseMin
        const t = total > 0 ? Math.min(1, Math.max(0, (nowMin - baseMin) / total)) : 1
        plan.currentHex = lerpHex(fromHex, homeTG.position, t)
        plan.currentHexTime = currentTime
      }
    }
  }

  /**
   * Transitions CAP and search flight plans from 'airborne' to 'returning'
   * once their orbit time (eta) has elapsed. Mirrors processScoutArrivals
   * but requires no contact resolution — just forces the return leg.
   */
  private processOrbitExpiry(
    flightPlans: Map<string, FlightPlan>,
    currentTime: GameTime
  ): void {
    const nowMin = gameTimeToMinutes(currentTime)
    for (const plan of flightPlans.values()) {
      if (plan.mission !== 'cap' && plan.mission !== 'search') continue
      if (plan.status !== 'airborne') continue
      if (!plan.eta) continue
      if (gameTimeToMinutes(plan.eta) > nowMin) continue
      plan.status = 'returning'
    }
  }

  private executeLaunchOrder(
    order: LaunchOrder,
    squadrons: Map<string, Squadron>,
    taskGroups: Map<string, TaskGroup>,
    ships: Map<string, Ship>,
    carrierPosition: HexCoord,
    currentTime: GameTime,
    fuelPools: { allied: number; japanese: number }
  ): FlightPlan | null {
    // Determine side from the first valid squadron
    const sampleSide = squadrons.get(order.squadronIds[0] ?? '')?.side

    // Gate: fuel pool must be > 0 for this side (Infinity = unlimited, always passes)
    if (sampleSide === 'allied' && isFinite(fuelPools.allied) && fuelPools.allied <= 0) return null
    if (sampleSide === 'japanese' && isFinite(fuelPools.japanese) && fuelPools.japanese <= 0) return null

    // Gate: if the TG has carrier ships, at least one must be operational
    const tg = taskGroups.get(order.taskGroupId)
    if (tg) {
      const carrierShips = tg.shipIds
        .map(id => ships.get(id))
        .filter((s): s is Ship => s !== undefined)
        .filter(s => (this.shipClasses.get(s.classId)?.type.includes('carrier')) ?? false)

      if (carrierShips.length > 0 && !carrierShips.some(s => s.status !== 'sunk')) {
        return null  // all carriers sunk — no launches possible
      }
    }

    const validSquadronIds: string[] = []

    for (const sqId of order.squadronIds) {
      const sq = squadrons.get(sqId)
      if (!sq) continue
      if (sq.deckStatus === 'airborne' || sq.deckStatus === 'recovering') continue
      if (sq.deckStatus === 'destroyed') continue
      if (sq.aircraftCount === 0) continue

      // Check range for strike/scout missions
      if (order.targetHex && order.mission !== 'cap' && order.mission !== 'search') {
        const aircraft = this.aircraftTypes.get(sq.aircraftTypeId)
        if (aircraft) {
          const distNm = hexDistance(carrierPosition, order.targetHex) * NM_PER_HEX
          let maxRange: number
          if (order.oneWay) {
            // One-way strike: full one-way range minus fuel reserve
            maxRange = aircraft.maxRange * (1 - this.params.fuelReserve)
          } else if (order.mission === 'scout') {
            maxRange = aircraft.maxRange * 0.5
          } else {
            maxRange = aircraft.maxRange * 0.5 * (1 - this.params.fuelReserve)
          }
          if (distNm > maxRange) continue  // out of range
        }
      }

      validSquadronIds.push(sqId)
    }

    if (validSquadronIds.length === 0) return null

    // Determine ETA
    const eta = this.computeEta(validSquadronIds, squadrons, carrierPosition, order.targetHex, currentTime)
    const returnEta = order.oneWay
      ? undefined
      : this.computeReturnEta(validSquadronIds, squadrons, carrierPosition, order.targetHex, eta)

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
      aircraftLost: 0,
      isOneWay: order.oneWay ?? false,
      launchHex: carrierPosition,
      currentHex: carrierPosition,
      currentHexTime: currentTime,
      targetTaskGroupId: order.targetTaskGroupId,
    }

    // Transition squadrons to airborne
    for (const sqId of validSquadronIds) {
      const sq = squadrons.get(sqId)!
      sq.deckStatus = 'airborne'
      sq.currentMissionId = plan.id
      sq.fuelLoad = 100
    }

    // Deduct aviation fuel from side pool
    const totalAircraft = validSquadronIds.reduce(
      (n, id) => n + (squadrons.get(id)?.aircraftCount ?? 0), 0
    )
    const missionFuelRates: Partial<Record<MissionType, number>> = {
      scout: this.params.scoutFuelRate,
      search: this.params.searchFuelRate,
      cap: this.params.capFuelRate,
      strike: this.params.strikeFuelRate,
      intercept: this.params.capFuelRate,
      escort: this.params.escortFuelRate,
      asw: this.params.aswFuelRate,
    }
    const ratePerHex = missionFuelRates[order.mission] ?? 1
    const rangeHexes = order.targetHex
      ? hexDistance(carrierPosition, order.targetHex)
      : this.params.capOrbitRangeHexes
    const fuelCost = totalAircraft * ratePerHex * rangeHexes
    if (plan.side === 'allied') {
      fuelPools.allied = Math.max(0, fuelPools.allied - fuelCost)
    } else {
      fuelPools.japanese = Math.max(0, fuelPools.japanese - fuelCost)
    }

    return plan
  }

  private processRecoveries(
    squadrons: Map<string, Squadron>,
    flightPlans: Map<string, FlightPlan>,
    taskGroups: Map<string, TaskGroup>,
    ships: Map<string, Ship>,
    currentTime: GameTime
  ): void {
    const nowMin = gameTimeToMinutes(currentTime)

    for (const plan of flightPlans.values()) {
      if (plan.status !== 'returning' && plan.status !== 'inbound') continue
      if (!plan.returnEta) continue
      if (gameTimeToMinutes(plan.returnEta) > nowMin) continue

      const sampleSq = squadrons.get(plan.squadronIds[0] ?? '')
      if (!sampleSq) {
        plan.status = 'recovered'
        continue
      }

      const homeTgId = sampleSq.taskGroupId
      const homeTg = taskGroups.get(homeTgId)

      // Check whether the home TG still has an operational carrier
      if (homeTg && !this.hasOperationalCarrier(homeTgId, ships, taskGroups)) {
        // Home carrier lost — find an alternate
        const alternate = this.findAlternateCarrier(
          sampleSq.side,
          homeTg.position,
          sampleSq.aircraftTypeId,
          homeTgId,
          squadrons,
          ships,
          taskGroups
        )

        if (alternate) {
          // Reroute: update taskGroupId and extend returnEta by travel time
          const extraDistNm = hexDistance(homeTg.position, alternate.position) * NM_PER_HEX
          const speed = this.slowestCruiseSpeed(plan.squadronIds, squadrons)
          const extraMin = (extraDistNm / speed) * 60
          const newReturnEtaMin = nowMin + Math.ceil(extraMin / 30) * 30 + RECOVERY_STEPS * 30
          plan.returnEta = minutesToGameTime(newReturnEtaMin)

          for (const sqId of plan.squadronIds) {
            const sq = squadrons.get(sqId)
            if (sq) sq.taskGroupId = alternate.id
          }
          continue  // will be re-evaluated when new returnEta passes
        } else {
          // No reachable carrier — ditch
          plan.status = 'lost'
          for (const sqId of plan.squadronIds) {
            const sq = squadrons.get(sqId)
            if (!sq) continue
            sq.deckStatus = 'destroyed'
            sq.aircraftCount = 0
            sq.currentMissionId = undefined
          }
          continue
        }
      }

      // Home carrier (or land-based TG) is operational — check deck capacity
      if (homeTg) {
        const capacity = this.getCarrierCapacity(homeTgId, ships, taskGroups)
        if (capacity > 0) {
          const occupancy = this.getDeckOccupancy(homeTgId, squadrons)
          const incomingCount = plan.squadronIds.reduce(
            (n, id) => n + (squadrons.get(id)?.aircraftCount ?? 0), 0
          )

          if ((occupancy + incomingCount) > capacity * this.params.overcapHardLimit) {
            // Hard block — aircraft ditch
            plan.status = 'lost'
            for (const sqId of plan.squadronIds) {
              const sq = squadrons.get(sqId)
              if (!sq) continue
              sq.deckStatus = 'destroyed'
              sq.aircraftCount = 0
              sq.currentMissionId = undefined
            }
            continue
          }

          // Soft over-cap (100 %–overcapHardLimit): recover but penalise readyTime
          const isOverCap = (occupancy + incomingCount) > capacity
          plan.status = 'recovered'
          for (const sqId of plan.squadronIds) {
            const sq = squadrons.get(sqId)
            if (!sq) continue
            sq.deckStatus = 'recovering'
            sq.currentMissionId = undefined
            const rearmMin = this.rearmMinutesFor(plan.mission)
            const penalty = isOverCap ? this.params.overcapPenaltyMinutes : 0
            if (rearmMin + penalty > 0) {
              sq.readyTime = minutesToGameTime(nowMin + rearmMin + penalty)
            }
          }
          continue
        }
      }

      // Normal recovery (no carrier capacity constraint)
      plan.status = 'recovered'
      for (const sqId of plan.squadronIds) {
        const sq = squadrons.get(sqId)
        if (!sq) continue
        sq.deckStatus = 'recovering'
        sq.currentMissionId = undefined
        const rearmMin = this.rearmMinutesFor(plan.mission)
        if (rearmMin > 0) {
          sq.readyTime = minutesToGameTime(nowMin + rearmMin)
        }
      }
    }

    // Advance recovering squadrons to hangared (respects readyTime penalty)
    for (const sq of squadrons.values()) {
      if (sq.deckStatus !== 'recovering') continue
      if (sq.readyTime && gameTimeToMinutes(sq.readyTime) > nowMin) continue
      sq.deckStatus = 'hangared'
      sq.fuelLoad = 0  // needs refueling
      sq.ordnanceLoaded = 'none'
      sq.readyTime = undefined
    }
  }

  private advanceSpottedSquadrons(
    _squadrons: Map<string, Squadron>,
    _flightPlans: Map<string, FlightPlan>,
    _currentTime: GameTime
  ): void {
    // Spotted squadrons without an assigned mission stay spotted until launched
  }

  // ── Carrier capacity helpers ──────────────────────────────────────────────

  /** True if at least one carrier ship in the TG is not sunk. */
  private hasOperationalCarrier(
    tgId: string,
    ships: Map<string, Ship>,
    taskGroups: Map<string, TaskGroup>
  ): boolean {
    const tg = taskGroups.get(tgId)
    if (!tg) return false
    return tg.shipIds.some(shipId => {
      const ship = ships.get(shipId)
      if (!ship || ship.status === 'sunk') return false
      const sc = this.shipClasses.get(ship.classId)
      return sc?.type.includes('carrier') ?? false
    })
  }

  /** Total flight-deck + hangar capacity for non-sunk carriers in the TG. */
  private getCarrierCapacity(
    tgId: string,
    ships: Map<string, Ship>,
    taskGroups: Map<string, TaskGroup>
  ): number {
    const tg = taskGroups.get(tgId)
    if (!tg) return 0
    let total = 0
    for (const shipId of tg.shipIds) {
      const ship = ships.get(shipId)
      if (!ship || ship.status === 'sunk') continue
      const sc = this.shipClasses.get(ship.classId)
      if (sc?.type.includes('carrier')) {
        total += (sc.flightDeckCapacity ?? 0) + (sc.hangarCapacity ?? 0)
      }
    }
    return total
  }

  /** Total aircraft currently on deck (non-airborne, non-destroyed) for a TG. */
  private getDeckOccupancy(tgId: string, squadrons: Map<string, Squadron>): number {
    let total = 0
    for (const sq of squadrons.values()) {
      if (sq.taskGroupId !== tgId) continue
      if (sq.deckStatus === 'airborne' || sq.deckStatus === 'destroyed') continue
      total += sq.aircraftCount
    }
    return total
  }

  /**
   * Finds the nearest friendly TG with an operational carrier and available
   * deck space that is within reroutable fuel range of `fromHex`.
   */
  private findAlternateCarrier(
    side: Side,
    fromHex: HexCoord,
    aircraftTypeId: number,
    excludeTgId: string,
    squadrons: Map<string, Squadron>,
    ships: Map<string, Ship>,
    taskGroups: Map<string, TaskGroup>
  ): TaskGroup | null {
    const aircraft = this.aircraftTypes.get(aircraftTypeId)
    // Conservative: assume ~25 % of max range remaining for reroute hop
    const maxReroutableNm = aircraft ? aircraft.maxRange * 0.25 : 50

    let bestTG: TaskGroup | null = null
    let bestDist = Infinity

    for (const tg of taskGroups.values()) {
      if (tg.side !== side) continue
      if (tg.id === excludeTgId) continue
      if (!this.hasOperationalCarrier(tg.id, ships, taskGroups)) continue

      // Check there is at least some deck space below the hard cap
      const capacity = this.getCarrierCapacity(tg.id, ships, taskGroups)
      if (capacity > 0) {
        const occupancy = this.getDeckOccupancy(tg.id, squadrons)
        if (occupancy >= capacity * this.params.overcapHardLimit) continue
      }

      const distNm = hexDistance(fromHex, tg.position) * NM_PER_HEX
      if (distNm <= maxReroutableNm && distNm < bestDist) {
        bestTG = tg
        bestDist = distNm
      }
    }

    return bestTG
  }

  /** Rearm/refuel minutes for a mission type, using params. */
  private rearmMinutesFor(mission: MissionType): number {
    if (mission === 'cap' || mission === 'intercept') return this.params.capRearmMinutes
    if (mission === 'strike' || mission === 'escort') return this.params.strikeRearmMinutes
    return this.params.scoutRearmMinutes  // scout, search, asw
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
      // CAP or search — orbit for capOrbitMinutes then return
      return minutesToGameTime(gameTimeToMinutes(launchTime) + this.params.capOrbitMinutes)
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

  /**
   * Called when a carrier takes a hit during an air strike.
   * Extends the readyTime of all recovering squadrons in that carrier's TG
   * to simulate deck fires, blast damage, and chaos disrupting the rearm cycle.
   */
  applyStrikeRearmPenalty(
    carrierShipId: string,
    ships: Map<string, Ship>,
    squadrons: Map<string, Squadron>,
    taskGroups: Map<string, TaskGroup>,
    currentTime: GameTime
  ): void {
    const ship = ships.get(carrierShipId)
    if (!ship) return
    const sc = this.shipClasses.get(ship.classId)
    if (!sc?.type.includes('carrier')) return

    const nowMin = gameTimeToMinutes(currentTime)
    for (const sq of squadrons.values()) {
      if (sq.taskGroupId !== ship.taskGroupId) continue
      if (sq.deckStatus !== 'recovering') continue
      const baseMin = sq.readyTime ? gameTimeToMinutes(sq.readyTime) : nowMin
      sq.readyTime = minutesToGameTime(baseMin + this.params.strikeRearmPenaltyMinutes)
    }
  }
}
