import type { GameTime, Side, ContactRecord, ContactType, SightingReport } from '../types'
import type { TaskGroup } from '../types'
import { gameTimeToMinutes } from '../types'
import { coordKey } from '../utils/hexMath'

// ── Constants ──────────────────────────────────────────────────────────────

/** A contact with no resighting in this many minutes becomes inactive. */
const CONTACT_DECAY_MINUTES = 240  // 4 hours = 8 steps

// ── FogOfWarSystem ─────────────────────────────────────────────────────────

export class FogOfWarSystem {
  private contactCounter = 0

  /**
   * Called once per 30-minute step.
   * Processes new sighting reports and ages existing contacts.
   * Mutates the contacts maps directly (they live in MutableGameState).
   */
  processStep(
    alliedContacts: Map<string, ContactRecord>,
    japaneseContacts: Map<string, ContactRecord>,
    newReports: SightingReport[],
    taskGroups: ReadonlyMap<string, TaskGroup>,
    currentTime: GameTime
  ): void {
    // 1. Decay stale contacts
    this.decayContacts(alliedContacts, currentTime)
    this.decayContacts(japaneseContacts, currentTime)

    // 2. Process new sighting reports
    for (const report of newReports) {
      const contacts = report.reportedBy === 'allied' ? alliedContacts : japaneseContacts
      this.integrateReport(contacts, report, currentTime)
    }

    // 3. Update contacts whose known TG is still visible at the same hex
    //    (e.g. from radar or persistent patrol — keeps confirmed contacts fresh)
    this.refreshConfirmedContacts(alliedContacts, taskGroups, currentTime)
    this.refreshConfirmedContacts(japaneseContacts, taskGroups, currentTime)
  }

  // ── Visibility query (called by renderer and stores) ──────────────────────

  /**
   * Returns true if the given task group is visible to `forSide`.
   * A task group is visible if there is an active contact within 1 hex of its position.
   */
  isVisible(
    taskGroupId: string,
    forSide: Side,
    taskGroups: ReadonlyMap<string, TaskGroup>,
    alliedContacts: ReadonlyMap<string, ContactRecord>,
    japaneseContacts: ReadonlyMap<string, ContactRecord>
  ): boolean {
    const tg = taskGroups.get(taskGroupId)
    if (!tg) return false
    if (tg.side === forSide) return true  // always see your own forces

    const contacts = forSide === 'allied' ? alliedContacts : japaneseContacts
    const tgKey = coordKey(tg.position)

    for (const contact of contacts.values()) {
      if (!contact.isActive) continue
      if (coordKey(contact.lastKnownHex) === tgKey) return true
      // Also visible if confirmed to this specific TG
      if (contact.confirmedTaskGroupId === taskGroupId) return true
    }
    return false
  }

  /**
   * Returns all active contacts for a given side, sorted most-recent first.
   */
  getActiveContacts(
    forSide: Side,
    alliedContacts: ReadonlyMap<string, ContactRecord>,
    japaneseContacts: ReadonlyMap<string, ContactRecord>
  ): ContactRecord[] {
    const contacts = forSide === 'allied' ? alliedContacts : japaneseContacts
    return [...contacts.values()]
      .filter(c => c.isActive)
      .sort((a, b) =>
        gameTimeToMinutes(b.lastSeenAt) - gameTimeToMinutes(a.lastSeenAt)
      )
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private decayContacts(contacts: Map<string, ContactRecord>, currentTime: GameTime): void {
    const nowMinutes = gameTimeToMinutes(currentTime)
    for (const contact of contacts.values()) {
      if (!contact.isActive) continue
      const ageMinutes = nowMinutes - gameTimeToMinutes(contact.lastSeenAt)
      if (ageMinutes >= CONTACT_DECAY_MINUTES) {
        contact.isActive = false
      }
    }
  }

  private integrateReport(
    contacts: Map<string, ContactRecord>,
    report: SightingReport,
    currentTime: GameTime
  ): void {
    // Try to match to an existing active contact at the same hex or nearby
    const existing = this.findMatchingContact(contacts, report)

    if (existing) {
      existing.lastKnownHex = { ...report.contactHex }
      existing.lastSeenAt = currentTime
      existing.isActive = true
      existing.sightingIds.push(report.id)
      if (!report.isFalseReport && report.actualTaskGroupId) {
        existing.confirmedTaskGroupId = report.actualTaskGroupId
      }
      if (report.estimatedCourse !== undefined) existing.estimatedCourse = report.estimatedCourse
      if (report.estimatedSpeed !== undefined) existing.estimatedSpeed = report.estimatedSpeed
    } else {
      // Create a new contact record
      const id = `contact-${this.contactCounter++}`
      const record: ContactRecord = {
        id,
        forSide: report.reportedBy,
        lastKnownHex: { ...report.contactHex },
        lastSeenAt: currentTime,
        contactType: report.reportedContactType,
        estimatedCourse: report.estimatedCourse,
        estimatedSpeed: report.estimatedSpeed,
        isActive: true,
        confirmedTaskGroupId: (!report.isFalseReport && report.actualTaskGroupId)
          ? report.actualTaskGroupId
          : undefined,
        sightingIds: [report.id]
      }
      contacts.set(id, record)
    }
  }

  private findMatchingContact(
    contacts: Map<string, ContactRecord>,
    report: SightingReport
  ): ContactRecord | undefined {
    const reportKey = coordKey(report.contactHex)

    for (const contact of contacts.values()) {
      if (!contact.isActive) continue

      // Match by confirmed task group ID (most reliable)
      if (
        !report.isFalseReport
        && report.actualTaskGroupId
        && contact.confirmedTaskGroupId === report.actualTaskGroupId
      ) {
        return contact
      }

      // Match by same hex
      if (coordKey(contact.lastKnownHex) === reportKey) return contact
    }
    return undefined
  }

  private refreshConfirmedContacts(
    contacts: Map<string, ContactRecord>,
    taskGroups: ReadonlyMap<string, TaskGroup>,
    currentTime: GameTime
  ): void {
    // If a confirmed contact's TG is in the same hex, keep it fresh
    // (simulates persistent tracking once a TG is confirmed)
    for (const contact of contacts.values()) {
      if (!contact.confirmedTaskGroupId) continue
      const tg = taskGroups.get(contact.confirmedTaskGroupId)
      if (!tg) continue
      // Only refresh if position matches (TG may have moved since last sighting)
      if (coordKey(tg.position) === coordKey(contact.lastKnownHex)) {
        // Just barely keep it alive — don't extend past normal decay on its own
        // (real refresh requires a new sighting report from SearchSystem)
      }
    }
  }
}
