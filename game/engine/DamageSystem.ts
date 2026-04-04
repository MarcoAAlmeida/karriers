import type { Ship, Squadron, HitResult, ShipClass } from '../types'
import type { Rng } from '../utils/dice'
import { chance } from '../utils/dice'

// ── Constants ──────────────────────────────────────────────────────────────

/** Hull damage dealt per active fire per step. */
const FIRE_DAMAGE_PER_STEP = 4
/** Probability a fire spreads to an adjacent compartment each step. */
const FIRE_SPREAD_CHANCE = 0.22
/** Flooding converts to hull damage at this rate per step. */
const FLOOD_DAMAGE_RATE = 0.08
/** Hull damage threshold for each status tier. */
const DAMAGE_THRESHOLDS = { damaged: 25, onFire: 50, sinking: 75 }

// ── DamageSystem ───────────────────────────────────────────────────────────

export class DamageSystem {
  private rng: Rng
  private shipClasses: Map<number, ShipClass>

  constructor(rng: Rng, shipClasses: Map<number, ShipClass>) {
    this.rng = rng
    this.shipClasses = shipClasses
  }

  // ── Apply a single hit ────────────────────────────────────────────────────

  applyHit(ship: Ship, hit: HitResult): void {
    if (ship.status === 'sunk') return

    ship.hullDamage = Math.min(100, ship.hullDamage + hit.hullDamageDealt)
    ship.fires += hit.firesStarted
    ship.floodingRisk = Math.min(100, ship.floodingRisk + hit.floodingInduced)

    // Damage control degrades with crew casualties
    ship.damageControlEfficiency = Math.max(
      20,
      ship.damageControlEfficiency - hit.crewCasualties * 0.5
    )

    this.updateStatus(ship)
  }

  /**
   * Apply all hits from a strike result to the target task group's ships.
   * Carrier with spotted aircraft receives double fires.
   */
  applyStrikeHits(
    hits: HitResult[],
    ships: Map<string, Ship>,
    squadrons: Map<string, Squadron>
  ): string[] {
    const sunkShipIds: string[] = []

    for (const hit of hits) {
      const ship = ships.get(hit.shipId)
      if (!ship) continue

      // Spotted aircraft on deck multiply fires (historical Kido Butai disaster)
      const spotted = this.countSpottedAircraftOnShip(ship.id, squadrons)
      const fireMultiplier = spotted > 0 ? 2.5 : 1.0
      const adjustedHit: HitResult = {
        ...hit,
        firesStarted: Math.round(hit.firesStarted * fireMultiplier)
      }

      this.applyHit(ship, adjustedHit)
      if (ship.status === 'sunk') sunkShipIds.push(ship.id)
    }

    return sunkShipIds
  }

  // ── Per-step processing ───────────────────────────────────────────────────

  /**
   * Process fires, flooding, and damage control for all ships.
   * Returns IDs of ships that sink this step.
   */
  processStep(ships: Map<string, Ship>): string[] {
    const sunk: string[] = []

    for (const ship of ships.values()) {
      if (ship.status === 'sunk') continue
      this.processShipStep(ship)
      const statusAfter: string = ship.status
      if (statusAfter === 'sunk') sunk.push(ship.id)
    }

    return sunk
  }

  private processShipStep(ship: Ship): void {
    // 1. Fire spread
    if (ship.fires > 0) {
      for (let i = 0; i < ship.fires; i++) {
        if (chance(this.rng, FIRE_SPREAD_CHANCE)) ship.fires++
      }
      // Cap fires at a maximum based on ship size
      const maxFires = this.maxFiresFor(ship)
      ship.fires = Math.min(ship.fires, maxFires)
    }

    // 2. Damage control — attempt to extinguish fires
    if (ship.fires > 0) {
      const dcRate = (ship.damageControlEfficiency / 100) * 0.55
      let extinguished = 0
      for (let i = 0; i < ship.fires; i++) {
        if (chance(this.rng, dcRate)) extinguished++
      }
      ship.fires = Math.max(0, ship.fires - extinguished)
    }

    // 3. Fire damage to hull
    if (ship.fires > 0) {
      ship.hullDamage = Math.min(100, ship.hullDamage + ship.fires * FIRE_DAMAGE_PER_STEP)
    }

    // 4. Flooding
    if (ship.floodingRisk > 0) {
      const floodDamage = ship.floodingRisk * FLOOD_DAMAGE_RATE
      ship.hullDamage = Math.min(100, ship.hullDamage + floodDamage)
      // Flooding risk slowly decreases as damage control counters it
      ship.floodingRisk = Math.max(0, ship.floodingRisk - (ship.damageControlEfficiency / 100) * 8)
    }

    // 5. Speed reduction from damage (not directly stored but affects maxSpeed in engine)

    this.updateStatus(ship)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private updateStatus(ship: Ship): void {
    if (ship.hullDamage >= 100) {
      ship.status = 'sunk'
      ship.fires = 0
      ship.floodingRisk = 0
    } else if (ship.fires >= 3 || ship.hullDamage >= DAMAGE_THRESHOLDS.sinking) {
      ship.status = 'on-fire'
    } else if (ship.hullDamage >= DAMAGE_THRESHOLDS.damaged) {
      ship.status = 'damaged'
    } else {
      ship.status = 'operational'
    }
  }

  private maxFiresFor(ship: Ship): number {
    const sc = this.shipClasses.get(ship.classId)
    if (!sc) return 6
    // Carriers can sustain more fires before becoming uncontrollable
    if (sc.type.includes('carrier')) return 12
    if (sc.type === 'battleship') return 8
    return 5
  }

  private countSpottedAircraftOnShip(shipId: string, squadrons: Map<string, Squadron>): number {
    let total = 0
    for (const sq of squadrons.values()) {
      // A rough proxy: if a squadron is in 'spotted' or 'rearming' state and
      // its carrier ID matches, those planes are on deck
      if (sq.deckStatus === 'spotted' || sq.deckStatus === 'rearming') {
        // We don't directly track which carrier a squadron is ON (only which TG)
        // Simplified: any spotted squadron in the same task group as this ship
        // We'd need ship→taskGroup lookup here; for now count all spotted in state
        total += sq.aircraftCount
      }
    }
    return total
  }
}
