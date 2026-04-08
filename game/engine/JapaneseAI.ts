import type { GameSnapshot, OrderPayload } from './GameEngine'
import type { Squadron } from '../types'
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
 *  1. No contacts → switch to 'search' so SearchSystem generates sightings.
 *  2. Contact found + attack squadrons ready + no strike airborne → launch.
 *  3. Contact out of range → close distance and keep searching.
 *  4. Strike already airborne → wait; do not relaunch until planes recover.
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

      // ── No contacts: search until we find something ──────────────────────
      if (activeContacts.length === 0) {
        if (tg.currentOrder !== 'search') {
          issueOrder({
            type: 'set-order',
            taskGroupId: tg.id,
            order: 'search',
            destination: tg.destination   // preserve advance toward objective
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
}
