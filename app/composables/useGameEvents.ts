import { SHIP_CLASSES } from '@game/data/shipClasses'

/**
 * useGameEvents — subscribes to GameEngine events and fires toast notifications.
 * Mount once inside a component that is alive for the lifetime of a scenario.
 */
export function useGameEvents() {
  const gameStore = useGameStore()
  const forcesStore = useForcesStore()
  const toast = useToast()

  // Unsubscribe callbacks returned by engine.events.on() and Vue watchers
  const unsubs: (() => void)[] = []

  // ── Auto-speed state ──────────────────────────────────────────────────────
  // Set when an enemy carrier is confirmed sunk; cleared on engine change.
  const enemyCarrierDown = ref(false)
  // Prevents the 8× ramp from firing more than once per scenario.
  const autoSpeedFired = ref(false)

  function clearUnsubs() {
    unsubs.splice(0).forEach(fn => fn())
    // Reset auto-speed flags so a fresh engine starts clean
    enemyCarrierDown.value = false
    autoSpeedFired.value = false
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

      // Detect enemy carrier kill — will trigger auto-speed once planes are home
      if (side === 'japanese' && ship) {
        const sc = SHIP_CLASSES.find(c => c.id === ship.classId)
        if (sc?.type.includes('carrier')) {
          enemyCarrierDown.value = true
        }
      }
    }))

    // ── Auto-speed: ramp to 8× when enemy carrier is down + all Allied planes home ──
    const stopAutoSpeed = watch(() => forcesStore.squadrons, (squads) => {
      if (!enemyCarrierDown.value || autoSpeedFired.value) return
      if (gameStore.phase === 'ended') return

      const alliedAirborne = [...squads.values()].filter(
        sq => sq.side === 'allied' && sq.deckStatus === 'airborne'
      )
      if (alliedAirborne.length > 0) return

      autoSpeedFired.value = true
      if (gameStore.timeScale < 8) {
        gameStore.setTimeScale(8)
        toast.add({
          title: 'All aircraft recovered',
          description: 'Advancing to maximum speed',
          color: 'info',
          icon: 'i-heroicons-forward',
          duration: 4000
        })
      }
    })
    unsubs.push(stopAutoSpeed)

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
