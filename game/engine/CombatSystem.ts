import type {
  GameTime,
  Ship,
  TaskGroup,
  Squadron,
  FlightPlan,
  AircraftType,
  ShipClass,
  HitResult,
  AirCombatResult,
  StrikeResult,
  HexCoord
} from '../types'
import type { Rng } from '../utils/dice'
import { chance } from '../utils/dice'
import { gameTimeToMinutes } from '../types'
import { coordKey } from '../utils/hexMath'
import type { AirOpsSystem } from './AirOpsSystem'
import type { ScenarioParams } from '../types/scenario'
import { DEFAULT_SCENARIO_PARAMS } from '../types/scenario'

// ── CombatSystem ───────────────────────────────────────────────────────────

export class CombatSystem {
  private rng: Rng
  private aircraftTypes: Map<number, AircraftType>
  private shipClasses: Map<number, ShipClass>
  private airOpsSystem: AirOpsSystem
  private params: ScenarioParams

  constructor(
    rng: Rng,
    aircraftTypes: Map<number, AircraftType>,
    shipClasses: Map<number, ShipClass>,
    airOpsSystem: AirOpsSystem,
    params: ScenarioParams = DEFAULT_SCENARIO_PARAMS
  ) {
    this.rng = rng
    this.aircraftTypes = aircraftTypes
    this.shipClasses = shipClasses
    this.airOpsSystem = airOpsSystem
    this.params = params
  }

  // ── Per-step processing ───────────────────────────────────────────────────

  /**
   * Resolve all strikes whose ETA has been reached this step.
   * Mutates FlightPlan statuses and applies hits via returned HitResults.
   */
  processStep(
    flightPlans: Map<string, FlightPlan>,
    taskGroups: Map<string, TaskGroup>,
    ships: Map<string, Ship>,
    squadrons: Map<string, Squadron>,
    currentTime: GameTime
  ): StrikeResult[] {
    const results: StrikeResult[] = []
    const nowMin = gameTimeToMinutes(currentTime)

    for (const plan of flightPlans.values()) {
      if (plan.status !== 'airborne') continue
      if (plan.mission !== 'strike' && plan.mission !== 'intercept') continue
      if (!plan.eta) continue
      if (gameTimeToMinutes(plan.eta) > nowMin) continue

      // Strike has arrived
      plan.status = 'inbound'

      const result = this.resolveStrike(plan, taskGroups, ships, squadrons, currentTime, flightPlans)
      if (result) {
        results.push(result)
        // Update squadron losses (may set deckStatus = 'destroyed' at zero)
        this.applySquadronLosses(plan, result.aircraftLost, squadrons)
      }

      if (plan.isOneWay) {
        // One-way strike: aircraft don't return — any survivors are still lost at sea
        plan.status = 'lost'
        for (const sqId of plan.squadronIds) {
          const sq = squadrons.get(sqId)
          if (sq && sq.deckStatus !== 'destroyed') {
            sq.aircraftCount = 0
            sq.deckStatus = 'destroyed'
            sq.currentMissionId = undefined
          }
        }
      } else {
        // Strike is now returning
        plan.status = 'returning'
      }
    }

    return results
  }

  // ── Strike resolution ─────────────────────────────────────────────────────

  private resolveStrike(
    plan: FlightPlan,
    taskGroups: Map<string, TaskGroup>,
    ships: Map<string, Ship>,
    squadrons: Map<string, Squadron>,
    currentTime: GameTime,
    flightPlans: Map<string, FlightPlan>
  ): StrikeResult | null {
    if (!plan.targetHex) return null

    const enemySide = plan.side === 'allied' ? 'japanese' : 'allied'

    // Prefer direct lookup by tracked TG ID — handles moving targets correctly.
    // Fall back to hex lookup for strikes without a tracked TG (e.g. land-based targets).
    let targetTG: TaskGroup | undefined
    if (plan.targetTaskGroupId) {
      const byId = taskGroups.get(plan.targetTaskGroupId)
      if (byId && byId.side === enemySide) targetTG = byId
    }
    if (!targetTG) {
      targetTG = this.findTaskGroupAtHex(plan.targetHex, taskGroups, enemySide)
    }
    if (!targetTG) {
      plan.status = 'returning'
      return null
    }

    // Snap targetHex to where the strike actually resolves so the return arc
    // originates from the correct position.
    plan.targetHex = { ...targetTG.position }

    const attackerSquadrons = plan.squadronIds
      .map(id => squadrons.get(id))
      .filter((s): s is Squadron => s !== undefined && s.aircraftCount > 0)

    if (attackerSquadrons.length === 0) return null

    const narrative: string[] = []
    let totalAircraftLost = 0

    // 1. CAP intercept
    const capSquadrons = this.airOpsSystem.getCAPSquadrons(targetTG.id, squadrons, flightPlans)
    let airCombat: AirCombatResult | undefined
    let survivingAttackers = attackerSquadrons.flatMap((sq) => {
      const aircraft = this.aircraftTypes.get(sq.aircraftTypeId)
      return Array(sq.aircraftCount).fill({ sq, aircraft })
    })

    if (capSquadrons.length > 0) {
      airCombat = this.resolveAirCombat(attackerSquadrons, capSquadrons, targetTG.id)
      const _attackerLossPct = airCombat.attackerLosses / Math.max(survivingAttackers.length, 1)
      totalAircraftLost += airCombat.attackerLosses
      narrative.push(
        `CAP intercept: ${airCombat.defenderLosses} fighters lost, `
        + `${airCombat.attackerLosses} attackers shot down`
      )
      if (!airCombat.attackerPenetrated) {
        narrative.push('Strike turned back by CAP.')
        return {
          flightPlanId: plan.id,
          targetTaskGroupId: targetTG.id,
          resolvedAt: currentTime,
          airCombat,
          flakLosses: 0,
          hits: [],
          aircraftReturning: plan.squadronIds.reduce((n, id) => n + (squadrons.get(id)?.aircraftCount ?? 0), 0) - totalAircraftLost,
          aircraftLost: totalAircraftLost,
          narrative
        }
      }
      // Reduce surviving attackers
      const reducedCount = Math.max(0, survivingAttackers.length - airCombat.attackerLosses)
      survivingAttackers = survivingAttackers.slice(0, reducedCount)
    }

    // 2. Flak
    const aaStrength = this.getTGAAStrength(targetTG, ships)
    const flakLosses = this.resolveFlak(survivingAttackers.length, aaStrength)
    totalAircraftLost += flakLosses
    survivingAttackers = survivingAttackers.slice(flakLosses)
    if (flakLosses > 0) narrative.push(`AA fire: ${flakLosses} attackers shot down`)

    // 3. Hits on ships
    const hits: HitResult[] = []
    const targetShips = targetTG.shipIds.map(id => ships.get(id)).filter((s): s is Ship => s !== undefined && s.status !== 'sunk')

    if (targetShips.length > 0 && survivingAttackers.length > 0) {
      const strikeHits = this.resolveHits(attackerSquadrons, survivingAttackers.length, targetShips, squadrons)
      hits.push(...strikeHits)
      if (strikeHits.length > 0) {
        narrative.push(`${strikeHits.length} hits scored on ${targetTG.name}`)
      } else {
        narrative.push('No hits scored.')
      }
    }

    const launching = plan.squadronIds.reduce((n, id) => n + (squadrons.get(id)?.aircraftCount ?? 0), 0)
    plan.aircraftLost = totalAircraftLost

    return {
      flightPlanId: plan.id,
      targetTaskGroupId: targetTG.id,
      resolvedAt: currentTime,
      airCombat,
      flakLosses,
      hits,
      aircraftReturning: Math.max(0, launching - totalAircraftLost),
      aircraftLost: totalAircraftLost,
      narrative
    }
  }

  // ── Air-to-air combat ─────────────────────────────────────────────────────

  private resolveAirCombat(
    attackers: Squadron[],
    defenders: Squadron[],
    _targetTGId: string
  ): AirCombatResult {
    const attackerCount = attackers.reduce((n, s) => n + s.aircraftCount, 0)
    const defenderCount = defenders.reduce((n, s) => n + s.aircraftCount, 0)

    if (defenderCount === 0) {
      return { attackerSquadronId: attackers[0]?.id ?? '', defenderSquadronId: '', attackerLosses: 0, defenderLosses: 0, attackerPenetrated: true }
    }

    // Defender quality score
    const defenderQuality = this.squadronQuality(defenders)
    const attackerQuality = this.squadronQuality(attackers)

    // Each defending fighter gets ~1.5 shots at attackers (scaled by CAP effectiveness)
    const shotsPerDefender = 1.5 * this.params.capEffectivenessMultiplier
    const defenderHitChance = Math.min(0.45, defenderQuality * 0.3)
    const expectedAttackerLosses = Math.round(defenderCount * shotsPerDefender * defenderHitChance)
    const attackerLosses = Math.min(attackerCount, this.poissonRound(expectedAttackerLosses))

    // Attacker fighters shoot back
    const shotsPerAttacker = 0.5
    const attackerHitChance = Math.min(0.35, attackerQuality * 0.2)
    const expectedDefenderLosses = Math.round(attackerCount * shotsPerAttacker * attackerHitChance)
    const defenderLosses = Math.min(defenderCount, this.poissonRound(expectedDefenderLosses))

    // Penetration: attackers break through if >30% survive relative to defenders
    const survivingAttackers = attackerCount - attackerLosses
    const penetrated = survivingAttackers > defenderCount * 0.3

    return {
      attackerSquadronId: attackers[0]?.id ?? '',
      defenderSquadronId: defenders[0]?.id ?? '',
      attackerLosses,
      defenderLosses,
      attackerPenetrated: penetrated
    }
  }

  // ── Flak ──────────────────────────────────────────────────────────────────

  private resolveFlak(attackerCount: number, aaStrength: number): number {
    // AA strength 0–100. At 100, ~25% of attackers shot down; at 50, ~12%
    const killRate = aaStrength / 400
    let losses = 0
    for (let i = 0; i < attackerCount; i++) {
      if (chance(this.rng, killRate)) losses++
    }
    return losses
  }

  private getTGAAStrength(tg: TaskGroup, ships: Map<string, Ship>): number {
    let total = 0
    let count = 0
    for (const shipId of tg.shipIds) {
      const ship = ships.get(shipId)
      if (!ship || ship.status === 'sunk') continue
      const sc = this.shipClasses.get(ship.classId)
      if (sc) {
        total += sc.aaStrength * (1 - ship.hullDamage / 200)
        count++
      }
    }
    return count > 0 ? total / count : 30
  }

  // ── Hit resolution ────────────────────────────────────────────────────────

  private resolveHits(
    attackerSquadrons: Squadron[],
    survivingCount: number,
    targetShips: Ship[],
    _squadrons: Map<string, Squadron>
  ): HitResult[] {
    const hits: HitResult[] = []
    if (targetShips.length === 0 || survivingCount === 0) return hits

    // Sort targets: carriers first, then capital ships, then screens
    const prioritized = [...targetShips].sort((a, b) => {
      const aClass = this.shipClasses.get(a.classId)
      const bClass = this.shipClasses.get(b.classId)
      const aIsCarrier = aClass?.type.includes('carrier') ? 1 : 0
      const bIsCarrier = bClass?.type.includes('carrier') ? 1 : 0
      return bIsCarrier - aIsCarrier
    })

    const attackersLeft = survivingCount
    let shipIndex = 0

    for (const sq of attackerSquadrons) {
      if (attackersLeft <= 0) break
      const aircraft = this.aircraftTypes.get(sq.aircraftTypeId)
      if (!aircraft) continue

      const contribution = Math.ceil((sq.aircraftCount / attackerSquadrons.reduce((n, s) => n + s.aircraftCount, 0)) * attackersLeft)
      const target = prioritized[shipIndex % prioritized.length]!
      const hit = this.resolveWeaponHit(aircraft, sq, contribution, target)
      if (hit) {
        hits.push(hit)
        // After a heavy hit, move to next ship (distribute damage)
        if (hit.hullDamageDealt > 20) shipIndex++
      }
    }

    return hits
  }

  private resolveWeaponHit(
    aircraft: AircraftType,
    squadron: Squadron,
    count: number,
    target: Ship
  ): HitResult | null {
    const expMod = aircraft.experienceModifiers[squadron.pilotExperience] ?? 1.0
    const accuracy = aircraft.bombingAccuracy / 100 * Math.min(expMod, 1.5)

    // Number of actual hits
    let hits = 0
    for (let i = 0; i < count; i++) {
      if (chance(this.rng, accuracy)) hits++
    }
    if (hits === 0) return null

    const sc = this.shipClasses.get(target.classId)
    const armorFactor = sc ? (1 - sc.armorRating / 200) : 0.8 // armor reduces damage

    // Damage per hit by weapon type
    let damagePerHit: number
    let firesPerHit: number
    let floodingPerHit: number

    if (aircraft.torpedoCapable && squadron.ordnanceLoaded === 'torpedoes') {
      damagePerHit = 18 * armorFactor * this.params.torpedoDamageMultiplier
      firesPerHit = 0
      floodingPerHit = 20 * this.params.floodingMultiplier
    } else if (aircraft.role === 'dive-bomber') {
      damagePerHit = 12 * armorFactor * this.params.bombDamageMultiplier
      firesPerHit = 1 * this.params.fireDamageMultiplier
      floodingPerHit = 5
    } else {
      damagePerHit = 8 * armorFactor * this.params.bombDamageMultiplier
      firesPerHit = chance(this.rng, 0.5) ? 1 * this.params.fireDamageMultiplier : 0
      floodingPerHit = 3
    }

    const totalDamage = Math.round(damagePerHit * hits)
    const totalFires = Math.floor(firesPerHit * hits + (this.rng() < (firesPerHit * hits % 1) ? 1 : 0))
    const totalFlooding = Math.round(floodingPerHit * hits)

    return {
      shipId: target.id,
      damageType: aircraft.torpedoCapable && squadron.ordnanceLoaded === 'torpedoes' ? 'torpedo' : 'bomb',
      hullDamageDealt: totalDamage,
      firesStarted: totalFires,
      floodingInduced: totalFlooding,
      crewCasualties: Math.round(hits * 3),
      systemsDisabled: hits >= 3 ? ['flight-deck'] : []
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private findTaskGroupAtHex(
    hex: HexCoord,
    taskGroups: Map<string, TaskGroup>,
    side: 'allied' | 'japanese'
  ): TaskGroup | undefined {
    const key = coordKey(hex)
    for (const tg of taskGroups.values()) {
      if (tg.side === side && coordKey(tg.position) === key) return tg
    }
    return undefined
  }

  private squadronQuality(squadrons: Squadron[]): number {
    if (squadrons.length === 0) return 0
    const expScores: Record<string, number> = { ace: 2.0, veteran: 1.3, trained: 1.0, green: 0.6 }
    const total = squadrons.reduce((n, s) => {
      const aircraft = this.aircraftTypes.get(s.aircraftTypeId)
      const aaRating = aircraft?.aaRating ?? 50
      const expScore = expScores[s.pilotExperience] ?? 1.0
      return n + (aaRating / 100) * expScore * s.aircraftCount
    }, 0)
    return total / squadrons.reduce((n, s) => n + s.aircraftCount, 0)
  }

  private applySquadronLosses(plan: FlightPlan, totalLost: number, squadrons: Map<string, Squadron>): void {
    let remaining = totalLost
    for (const sqId of plan.squadronIds) {
      const sq = squadrons.get(sqId)
      if (!sq || remaining <= 0) continue
      const losses = Math.min(sq.aircraftCount, Math.ceil(remaining * (sq.aircraftCount / Math.max(plan.squadronIds.length, 1))))
      sq.aircraftCount = Math.max(0, sq.aircraftCount - losses)
      remaining -= losses
      // Squadron disbanded when all aircraft are lost
      if (sq.aircraftCount === 0) {
        sq.deckStatus = 'destroyed'
        sq.currentMissionId = undefined
      }
    }
  }

  /** Stochastic rounding around an expected value. */
  private poissonRound(expected: number): number {
    const floor = Math.floor(expected)
    return floor + (chance(this.rng, expected - floor) ? 1 : 0)
  }
}
