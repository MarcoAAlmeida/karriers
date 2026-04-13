import type { GameSnapshot, OrderPayload } from './GameEngine'
import type { Squadron, TaskGroup } from '../types'
import { hexDistance, NM_PER_HEX } from '../utils/hexMath'
import { AIRCRAFT_TYPES } from '../data/aircraftTypes'

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * One-way strike range factor — mirrors AirOpsSystem's FUEL_RESERVE = 0.15.
 * maxRange × 0.5 × (1 − 0.15) = maxRange × 0.425
 */
const MAX_STRIKE_RANGE_FACTOR = 0.5 * 0.85

/** Aircraft roles that can execute strike missions. */
const ATTACK_ROLES = new Set(['dive-bomber', 'torpedo-bomber'])

/** Radius (hexes) within which we consider a TF to be the strike target. */
const TARGET_PROXIMITY_HEXES = 2

// ── Helpers ────────────────────────────────────────────────────────────────

/** Lower score = better target. Carrier contacts preferred; ties broken by distance. */
function contactScore(
  pos: { q: number; r: number },
  contact: { contactType: string; lastKnownHex: { q: number; r: number } }
): number {
  const carrierPenalty = contact.contactType === 'carrier-force' ? 0 : 1_000
  return carrierPenalty + hexDistance(pos, contact.lastKnownHex)
}

// ── JapaneseAI ─────────────────────────────────────────────────────────────

/**
 * Rule-based controller for all IJN forces.
 *
 * Call `step()` once per simulation step (after the step resolves) with the
 * current snapshot. Orders emitted via `issueOrder` are queued in the engine
 * and executed at the start of the next step.
 *
 * Behaviour summary:
 *  1. No contacts + no active scout → launch scout toward enemy area.
 *  2. No contacts (scout active or just searching) → switch to 'search' order.
 *  3. Allied strike inbound + no CAP → launch fighter CAP.
 *  4. Contact found + attack squadrons ready + no strike airborne → launch strike.
 *  5. Contact out of range → close distance and keep searching.
 *  6. Strike already airborne → wait; do not relaunch until planes recover.
 */
export class JapaneseAI {
  step(
    snapshot: GameSnapshot,
    issueOrder: (payload: OrderPayload) => void
  ): void {
    const activeContacts = [...snapshot.japaneseContacts.values()].filter(c => c.isActive)

    for (const tg of snapshot.taskGroups.values()) {
      if (tg.side !== 'japanese') continue

      // Only carrier task groups can strike — identified by presence of attack aircraft.
      const attackSquadrons = this.getAttackSquadrons(tg.id, snapshot)
      if (attackSquadrons.length === 0) continue

      const strikeActive = this.hasActiveStrike(tg.id, snapshot)

      // ── Sprint 18/19: CAP defense when Allied strike inbound ─────────────
      const alliedStrikeInbound = this.hasInboundStrikeToward(tg, snapshot)
      if (alliedStrikeInbound && !this.hasActiveCAP(tg.id, snapshot)) {
        const fighters = this.getFighterSquadrons(tg.id, snapshot)
        if (fighters.length > 0) {
          issueOrder({
            type: 'launch-cap',
            taskGroupId: tg.id,
            squadronIds: fighters.map(sq => sq.id)
          })
        }
      }

      // ── No contacts ──────────────────────────────────────────────────────
      if (activeContacts.length === 0) {
        // Sprint 20: launch scout before committing to strikes
        if (!this.hasActiveScout(tg.id, snapshot)) {
          const scouts = this.getScoutSquadrons(tg.id, snapshot)
          if (scouts.length > 0) {
            const scoutTarget = this.pickScoutTarget(tg, snapshot)
            issueOrder({
              type: 'launch-scout',
              taskGroupId: tg.id,
              squadronIds: [scouts[0]!.id],
              targetHex: scoutTarget
            })
          }
        }

        if (tg.currentOrder !== 'search') {
          issueOrder({
            type: 'set-order',
            taskGroupId: tg.id,
            order: 'search',
            destination: tg.destination
          })
        }
        continue
      }

      // ── Select best target ───────────────────────────────────────────────
      const sorted = [...activeContacts].sort(
        (a, b) => contactScore(tg.position, a) - contactScore(tg.position, b)
      )
      const target = sorted[0]!
      const distNm = hexDistance(tg.position, target.lastKnownHex) * NM_PER_HEX

      // Attack squadrons that are ready AND can reach the target
      const readyAttackers = attackSquadrons.filter(sq => {
        if (sq.deckStatus !== 'hangared' || sq.aircraftCount === 0) return false
        const ac = AIRCRAFT_TYPES.find(a => a.id === sq.aircraftTypeId)
        return ac ? distNm <= ac.maxRange * MAX_STRIKE_RANGE_FACTOR : false
      })

      // ── Launch strike ────────────────────────────────────────────────────
      if (readyAttackers.length > 0 && !strikeActive) {
        issueOrder({
          type: 'launch-strike',
          taskGroupId: tg.id,
          squadronIds: readyAttackers.map(sq => sq.id),
          targetHex: target.lastKnownHex
        })
        // Keep searching after launch — may discover more contacts
        if (tg.currentOrder !== 'search') {
          issueOrder({
            type: 'set-order',
            taskGroupId: tg.id,
            order: 'search',
            destination: tg.destination
          })
        }
        continue
      }

      // ── Close distance when out of range (and no strike active) ─────────
      if (!strikeActive) {
        const allOutOfRange = attackSquadrons.every(sq => {
          if (sq.deckStatus !== 'hangared' || sq.aircraftCount === 0) return true
          const ac = AIRCRAFT_TYPES.find(a => a.id === sq.aircraftTypeId)
          return ac ? distNm > ac.maxRange * MAX_STRIKE_RANGE_FACTOR : true
        })

        if (allOutOfRange && distNm > 100) {
          // Advance toward contact hex to enter strike range
          issueOrder({ type: 'set-destination', taskGroupId: tg.id, destination: target.lastKnownHex })
        }

        // Ensure we're searching so contacts stay fresh
        if (tg.currentOrder !== 'search') {
          issueOrder({
            type: 'set-order',
            taskGroupId: tg.id,
            order: 'search',
            destination: tg.destination
          })
        }
      }

      // Strike active → wait for recovery; do nothing this step.
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** All non-destroyed attack squadrons belonging to this task group. */
  private getAttackSquadrons(tgId: string, snapshot: GameSnapshot): Squadron[] {
    return [...snapshot.squadrons.values()].filter(sq => {
      if (sq.taskGroupId !== tgId || sq.side !== 'japanese') return false
      if (sq.deckStatus === 'destroyed' || sq.aircraftCount === 0) return false
      const ac = AIRCRAFT_TYPES.find(a => a.id === sq.aircraftTypeId)
      return ac ? ATTACK_ROLES.has(ac.role) : false
    })
  }

  /** Fighter squadrons that are hangared and ready. */
  private getFighterSquadrons(tgId: string, snapshot: GameSnapshot): Squadron[] {
    return [...snapshot.squadrons.values()].filter(sq => {
      if (sq.taskGroupId !== tgId || sq.side !== 'japanese') return false
      if (sq.deckStatus !== 'hangared' || sq.aircraftCount === 0) return false
      const ac = AIRCRAFT_TYPES.find(a => a.id === sq.aircraftTypeId)
      return ac?.role === 'fighter'
    })
  }

  /** Scout/patrol-bomber squadrons that are hangared and ready. */
  private getScoutSquadrons(tgId: string, snapshot: GameSnapshot): Squadron[] {
    return [...snapshot.squadrons.values()].filter(sq => {
      if (sq.taskGroupId !== tgId || sq.side !== 'japanese') return false
      if (sq.deckStatus !== 'hangared' || sq.aircraftCount === 0) return false
      const ac = AIRCRAFT_TYPES.find(a => a.id === sq.aircraftTypeId)
      return ac?.role === 'scout' || ac?.role === 'patrol-bomber'
    })
  }

  /** True if a strike from this TF's squadrons is currently airborne/inbound. */
  private hasActiveStrike(tgId: string, snapshot: GameSnapshot): boolean {
    const tgSqIds = new Set(
      [...snapshot.squadrons.values()]
        .filter(sq => sq.taskGroupId === tgId)
        .map(sq => sq.id)
    )
    return [...snapshot.flightPlans.values()].some(fp =>
      fp.side === 'japanese' &&
      fp.mission === 'strike' &&
      (fp.status === 'airborne' || fp.status === 'inbound') &&
      fp.squadronIds.some(id => tgSqIds.has(id))
    )
  }

  /** True if this TG already has CAP airborne. */
  private hasActiveCAP(tgId: string, snapshot: GameSnapshot): boolean {
    const tgSqIds = new Set(
      [...snapshot.squadrons.values()]
        .filter(sq => sq.taskGroupId === tgId)
        .map(sq => sq.id)
    )
    return [...snapshot.flightPlans.values()].some(fp =>
      fp.side === 'japanese' &&
      fp.mission === 'cap' &&
      fp.status === 'airborne' &&
      fp.squadronIds.some(id => tgSqIds.has(id))
    )
  }

  /** True if a scout from this TG is currently airborne. */
  private hasActiveScout(tgId: string, snapshot: GameSnapshot): boolean {
    const tgSqIds = new Set(
      [...snapshot.squadrons.values()]
        .filter(sq => sq.taskGroupId === tgId)
        .map(sq => sq.id)
    )
    return [...snapshot.flightPlans.values()].some(fp =>
      fp.side === 'japanese' &&
      fp.mission === 'scout' &&
      fp.status === 'airborne' &&
      fp.squadronIds.some(id => tgSqIds.has(id))
    )
  }

  /**
   * True if an Allied strike is airborne and heading toward this TG's hex.
   * Uses TARGET_PROXIMITY_HEXES tolerance since the strike targets a contact
   * position, not the exact current TG hex.
   */
  private hasInboundStrikeToward(tg: TaskGroup, snapshot: GameSnapshot): boolean {
    return [...snapshot.flightPlans.values()].some(fp =>
      fp.side === 'allied' &&
      fp.mission === 'strike' &&
      (fp.status === 'airborne' || fp.status === 'inbound') &&
      fp.targetHex !== undefined &&
      hexDistance(fp.targetHex, tg.position) <= TARGET_PROXIMITY_HEXES
    )
  }

  /**
   * Pick a scout target hex.
   * Tries the midpoint between current TG position and destination if set;
   * otherwise scouts 12 hexes ahead along the TG's expected axis of advance.
   */
  private pickScoutTarget(tg: TaskGroup, _snapshot: GameSnapshot): { q: number; r: number } {
    if (tg.destination) {
      return {
        q: Math.round((tg.position.q + tg.destination.q) / 2),
        r: Math.round((tg.position.r + tg.destination.r) / 2)
      }
    }
    // Default: scout toward Allied TF operating area (NE of Midway)
    return {
      q: Math.min(tg.position.q + 12, 70),
      r: Math.max(tg.position.r - 4, 0)
    }
  }
}
