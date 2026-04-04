import type { ContactRecord, SightingReport, Side } from '@game/types'
import type { GameSnapshot } from '@game/engine/GameEngine'

export const useIntelligenceStore = defineStore('intelligence', () => {
  // ── State ────────────────────────────────────────────────────────────────

  const alliedContacts = ref<Map<string, ContactRecord>>(new Map())
  const japaneseContacts = ref<Map<string, ContactRecord>>(new Map())
  const sightingLog = ref<SightingReport[]>([])

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeAlliedContacts = computed(() =>
    [...alliedContacts.value.values()].filter(c => c.isActive)
  )

  const activeJapaneseContacts = computed(() =>
    [...japaneseContacts.value.values()].filter(c => c.isActive)
  )

  function activeContactsFor(side: Side): ContactRecord[] {
    return side === 'allied'
      ? activeAlliedContacts.value
      : activeJapaneseContacts.value
  }

  /**
   * Returns true if the given task group is visible to `forSide`.
   * Own forces are always visible; enemy forces only if there is an active
   * contact at their position.
   */
  function isVisible(taskGroupId: string, forSide: Side): boolean {
    const contacts = forSide === 'allied' ? alliedContacts.value : japaneseContacts.value
    for (const c of contacts.values()) {
      if (!c.isActive) continue
      if (c.confirmedTaskGroupId === taskGroupId) return true
    }
    return false
  }

  // ── Sync from engine snapshot ─────────────────────────────────────────────

  function syncFromSnapshot(snapshot: GameSnapshot): void {
    alliedContacts.value = new Map(snapshot.alliedContacts)
    japaneseContacts.value = new Map(snapshot.japaneseContacts)

    // Prepend new sighting reports (most recent first, cap at 200)
    if (snapshot.sightingReports.length > 0) {
      sightingLog.value = [
        ...snapshot.sightingReports,
        ...sightingLog.value
      ].slice(0, 200)
    }
  }

  function clear(): void {
    alliedContacts.value = new Map()
    japaneseContacts.value = new Map()
    sightingLog.value = []
  }

  return {
    alliedContacts,
    japaneseContacts,
    sightingLog,
    activeAlliedContacts,
    activeJapaneseContacts,
    activeContactsFor,
    isVisible,
    syncFromSnapshot,
    clear
  }
})
