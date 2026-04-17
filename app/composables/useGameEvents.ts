import type { GameEngine } from '@game/engine/GameEngine'
import { hexDistance } from '@game/utils/hexMath'

/**
 * useGameEvents — subscribes to GameEngine events and shows toast notifications.
 *
 * Mount once in GameHUD. Returns `onOpenCAP` so the caller can wire up
 * the "Launch CAP" toast action to open the Air Ops modal on the CAP tab.
 */
export function useGameEvents() {
  const gameStore = useGameStore()
  const forcesStore = useForcesStore()
  const toast = useToast()

  // Deduplicate: one warning per flight plan ID
  const warnedStrikeIds = new Set<string>()

  // Callback set by the parent component to open the Air Ops modal on the CAP tab
  let openCAPCallback: ((taskGroupId: string) => void) | null = null

  function onOpenCAP(cb: (taskGroupId: string) => void): void {
    openCAPCallback = cb
  }

  function subscribeToEngine(engine: GameEngine): void {
    // Sprint 19: warn player when Japanese strike is launched
    engine.events.on('EnemyStrikeDetected', ({ flightPlanId, targetHex, estimatedArrivalTime }) => {
      if (warnedStrikeIds.has(flightPlanId)) return
      warnedStrikeIds.add(flightPlanId)

      // Find the nearest Allied TF to the target hex
      const alliedTGs = forcesStore.alliedTaskGroups
      const nearest = alliedTGs.reduce<typeof alliedTGs[number] | null>((best, tg) => {
        if (!best) return tg
        return hexDistance(tg.position, targetHex) < hexDistance(best.position, targetHex) ? tg : best
      }, null)

      const tgName = nearest?.name ?? 'Allied forces'
      const hh = String(estimatedArrivalTime.hour).padStart(2, '0')
      const mm = String(estimatedArrivalTime.minute).padStart(2, '0')

      toast.add({
        title: 'Incoming Strike!',
        description: `Enemy aircraft inbound to ${tgName} — ETA ${hh}:${mm}`,
        color: 'error',
        duration: 10_000,
        actions: nearest && openCAPCallback
          ? [
              {
                label: 'Launch CAP',
                color: 'neutral' as const,
                variant: 'outline' as const,
                onClick: () => openCAPCallback!(nearest.id)
              }
            ]
          : []
      })
    })

    // Sprint 20: notify when scout confirms a contact
    engine.events.on('ScoutContactRevealed', ({ contactFound, targetHex, side, time }) => {
      if (side !== 'allied') return // only show Allied scout results to player
      const hh = String(time.hour).padStart(2, '0')
      const mm = String(time.minute).padStart(2, '0')
      if (contactFound) {
        toast.add({
          title: 'Scout Contact!',
          description: `Scout confirmed enemy contact at (${targetHex.q}, ${targetHex.r}) — ${hh}:${mm}`,
          color: 'info',
          duration: 6_000
        })
      } else {
        toast.add({
          title: 'Scout Returned',
          description: `No contact found at (${targetHex.q}, ${targetHex.r})`,
          color: 'neutral',
          duration: 4_000
        })
      }
    })
  }

  watch(
    () => gameStore.engine,
    (engine) => {
      if (engine) {
        subscribeToEngine(engine)
      } else {
        warnedStrikeIds.clear()
      }
    },
    { immediate: true }
  )

  return { onOpenCAP }
}
