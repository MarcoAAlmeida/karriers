import type {
  GameTime,
  Ship,
  TaskGroup,
  HitResult,
  ShipClass,
  SurfaceCombatResult,
  SurfaceCombatRound
} from '../types'
import type { Rng } from '../utils/dice'
import { chance } from '../utils/dice'
import { coordKey } from '../utils/hexMath'
import type { DamageSystem } from './DamageSystem'

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_ROUNDS = 4
const CARRIER_RETREAT_CHANCE = 0.90 // carriers almost always flee surface contact

// ── SurfaceCombatSystem ────────────────────────────────────────────────────

export class SurfaceCombatSystem {
  private rng: Rng
  private shipClasses: Map<number, ShipClass>
  private damageSystem: DamageSystem

  constructor(rng: Rng, shipClasses: Map<number, ShipClass>, damageSystem: DamageSystem) {
    this.rng = rng
    this.shipClasses = shipClasses
    this.damageSystem = damageSystem
  }

  // ── Per-step processing ───────────────────────────────────────────────────

  processStep(
    taskGroups: Map<string, TaskGroup>,
    ships: Map<string, Ship>,
    currentTime: GameTime
  ): SurfaceCombatResult[] {
    const results: SurfaceCombatResult[] = []

    // Group TGs by hex
    const hexMap = new Map<string, TaskGroup[]>()
    for (const tg of taskGroups.values()) {
      const key = coordKey(tg.position)
      if (!hexMap.has(key)) hexMap.set(key, [])
      hexMap.get(key)!.push(tg)
    }

    // Find hexes with opposing forces
    for (const [, tgsAtHex] of hexMap) {
      const allied = tgsAtHex.filter(tg => tg.side === 'allied')
      const japanese = tgsAtHex.filter(tg => tg.side === 'japanese')
      if (allied.length === 0 || japanese.length === 0) continue

      // Merge all ships from each side for this engagement
      const alliedShips = allied.flatMap(tg =>
        tg.shipIds.map(id => ships.get(id)).filter((s): s is Ship => s !== undefined && s.status !== 'sunk')
      )
      const japaneseShips = japanese.flatMap(tg =>
        tg.shipIds.map(id => ships.get(id)).filter((s): s is Ship => s !== undefined && s.status !== 'sunk')
      )

      if (alliedShips.length === 0 || japaneseShips.length === 0) continue

      const result = this.resolveSurfaceBattle(
        allied[0]!.id,
        japanese[0]!.id,
        alliedShips,
        japaneseShips,
        ships,
        currentTime
      )
      results.push(result)

      // Retreat carriers from the hex
      this.retreatCarriers(allied, taskGroups)
      this.retreatCarriers(japanese, taskGroups)
    }

    return results
  }

  // ── Battle resolution ─────────────────────────────────────────────────────

  private resolveSurfaceBattle(
    alliedTGId: string,
    japaneseTGId: string,
    alliedShips: Ship[],
    japaneseShips: Ship[],
    ships: Map<string, Ship>,
    currentTime: GameTime
  ): SurfaceCombatResult {
    const rounds: SurfaceCombatRound[] = []
    const alliedSunk: string[] = []
    const japaneseSunk: string[] = []
    const narrative: string[] = [`Surface engagement between TG ${alliedTGId} and ${japaneseTGId}`]

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const activeAllied = alliedShips.filter(s => s.status !== 'sunk')
      const activeJapanese = japaneseShips.filter(s => s.status !== 'sunk')

      if (activeAllied.length === 0 || activeJapanese.length === 0) break

      const alliedFires = this.countGunFires(activeAllied)
      const japaneseFires = this.countGunFires(activeJapanese)

      const alliedHits = this.resolveGunFire(activeAllied, activeJapanese, alliedFires)
      const japaneseHits = this.resolveGunFire(activeJapanese, activeAllied, japaneseFires)

      // Apply hits
      for (const hit of alliedHits) {
        const ship = ships.get(hit.shipId)
        if (ship) {
          this.damageSystem.applyHit(ship, hit)
          if (ship.status === 'sunk' && !japaneseSunk.includes(ship.id)) japaneseSunk.push(ship.id)
        }
      }
      for (const hit of japaneseHits) {
        const ship = ships.get(hit.shipId)
        if (ship) {
          this.damageSystem.applyHit(ship, hit)
          if (ship.status === 'sunk' && !alliedSunk.includes(ship.id)) alliedSunk.push(ship.id)
        }
      }

      rounds.push({
        roundNumber: round,
        alliedFires,
        japaneseFires,
        alliedHits,
        japaneseHits
      })

      // One side may disengage
      const alliedStrength = this.combatStrength(activeAllied)
      const japaneseStrength = this.combatStrength(activeJapanese)
      if (alliedStrength < japaneseStrength * 0.4) {
        narrative.push('Allied forces disengage.')
        break
      }
      if (japaneseStrength < alliedStrength * 0.4) {
        narrative.push('Japanese forces disengage.')
        break
      }
    }

    if (alliedSunk.length > 0) narrative.push(`Allied ships sunk: ${alliedSunk.length}`)
    if (japaneseSunk.length > 0) narrative.push(`Japanese ships sunk: ${japaneseSunk.length}`)

    return {
      resolvedAt: currentTime,
      location: alliedShips[0] ? { q: 0, r: 0 } : { q: 0, r: 0 }, // filled by caller
      alliedTaskGroupId: alliedTGId,
      japaneseTaskGroupId: japaneseTGId,
      rounds,
      alliedShipsSunk: alliedSunk,
      japaneseShipsSunk: japaneseSunk,
      narrative
    }
  }

  // ── Gun fire resolution ───────────────────────────────────────────────────

  private countGunFires(ships: Ship[]): number {
    return ships.reduce((n, s) => {
      const sc = this.shipClasses.get(s.classId)
      if (!sc || sc.type.includes('carrier') || sc.type === 'transport' || sc.type === 'oiler') return n
      // Proxy: use displacement as gun power indicator
      return n + Math.ceil(sc.displacement / 5000)
    }, 0)
  }

  private resolveGunFire(
    attackers: Ship[],
    defenders: Ship[],
    totalFires: number
  ): HitResult[] {
    const hits: HitResult[] = []
    if (defenders.length === 0) return hits

    // Distribute shots across defender ships (prioritize largest)
    const sortedDefenders = [...defenders].sort((a, b) => {
      const asc = this.shipClasses.get(a.classId)
      const bsc = this.shipClasses.get(b.classId)
      return (bsc?.displacement ?? 0) - (asc?.displacement ?? 0)
    })

    const shotsPerShip = Math.ceil(totalFires / sortedDefenders.length)
    const baseHitChance = 0.08 // 8% per shot at surface range

    for (const target of sortedDefenders) {
      const sc = this.shipClasses.get(target.classId)
      const armorFactor = sc ? (1 - sc.armorRating / 250) : 0.8
      let shellHits = 0
      for (let i = 0; i < shotsPerShip; i++) {
        if (chance(this.rng, baseHitChance)) shellHits++
      }
      if (shellHits === 0) continue

      hits.push({
        shipId: target.id,
        damageType: 'shell',
        hullDamageDealt: Math.round(shellHits * 6 * armorFactor),
        firesStarted: chance(this.rng, 0.3 * shellHits) ? 1 : 0,
        floodingInduced: chance(this.rng, 0.15 * shellHits) ? 10 : 0,
        crewCasualties: shellHits * 5,
        systemsDisabled: []
      })
    }

    return hits
  }

  private combatStrength(ships: Ship[]): number {
    return ships.reduce((n, s) => {
      if (s.status === 'sunk') return n
      const sc = this.shipClasses.get(s.classId)
      if (!sc || sc.type.includes('carrier')) return n
      return n + sc.displacement * (1 - s.hullDamage / 100)
    }, 0)
  }

  private retreatCarriers(taskGroups: TaskGroup[], _allGroups: Map<string, TaskGroup>): void {
    for (const tg of taskGroups) {
      // Mark carriers as needing to retire — they'll be moved by MovementSystem next step
      if (tg.currentOrder !== 'retire' && chance(this.rng, CARRIER_RETREAT_CHANCE)) {
        tg.currentOrder = 'retire'
        // Set a destination ~5 hexes back along reciprocal course
        const retreatQ = tg.position.q + Math.round(Math.cos((tg.course + 180) * Math.PI / 180) * 5)
        const retreatR = tg.position.r + Math.round(Math.sin((tg.course + 180) * Math.PI / 180) * 5)
        tg.destination = { q: Math.max(0, Math.min(71, retreatQ)), r: Math.max(0, Math.min(83, retreatR)) }
      }
    }
  }
}
