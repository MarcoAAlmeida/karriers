/**
 * useGameEvents — subscribes to GameEngine events and fires toast notifications.
 * Mount once inside a component that is alive for the lifetime of a scenario.
 */
export function useGameEvents() {
  const gameStore = useGameStore()
  const forcesStore = useForcesStore()
  const toast = useToast()

  // Unsubscribe callbacks returned by engine.events.on()
  const unsubs: (() => void)[] = []

  function clearUnsubs() {
    unsubs.splice(0).forEach(fn => fn())
  }

  function attachToEngine() {
    clearUnsubs()
    const engine = gameStore.engine
    if (!engine) return

    unsubs.push(engine.events.on('StrikeInbound', ({ targetTaskGroupId }) => {
      const tg = forcesStore.taskGroups.get(targetTaskGroupId)
      toast.add({
        title: 'Strike Inbound!',
        description: `Enemy aircraft approaching ${tg?.name ?? 'unknown force'}`,
        color: 'error',
        icon: 'i-heroicons-exclamation-triangle',
        duration: 8000
      })
    }))

    unsubs.push(engine.events.on('ShipSunk', ({ shipId, side }) => {
      const ship = forcesStore.ships.get(shipId)
      const name = ship?.name ?? shipId
      toast.add({
        title: 'Ship Sunk',
        description: name,
        color: side === 'allied' ? 'error' : 'success',
        icon: 'i-heroicons-x-circle',
        duration: 8000
      })
    }))

    unsubs.push(engine.events.on('ShipDamaged', (event) => {
      if (event.type !== 'ship-damaged') return
      const ship = forcesStore.ships.get(event.shipId)
      if (!ship) return
      // Only toast carrier hits to avoid spam
      const isCarrier = (['fleet-carrier', 'light-carrier', 'escort-carrier'] as const)
      // We don't have ship class lookup here — just show all damaged events for now
      toast.add({
        title: 'Ship Hit',
        description: `${ship.name} — ${event.damageType}`,
        color: 'warning',
        icon: 'i-heroicons-fire',
        duration: 5000
      })
    }))

    unsubs.push(engine.events.on('SightingDetected', (report) => {
      // Only show high-confidence carrier sightings to the US player
      if (report.isFalseReport) return
      if (report.confidence < 60) return
      if (report.reportedBy !== 'allied') return
      const type = report.reportedContactType.replace(/-/g, ' ')
      toast.add({
        title: 'Contact Sighted',
        description: `${type} at ${report.contactHex.q},${report.contactHex.r}`,
        color: 'info',
        icon: 'i-heroicons-eye',
        duration: 6000
      })
    }))
  }

  // Re-attach whenever the engine instance changes (scenario load / return to menu)
  watch(() => gameStore.engine, attachToEngine, { immediate: true })

  onUnmounted(clearUnsubs)
}
