/**
 * gameState.client.ts
 *
 * Exposes `window.__GAME_STATE__` in development/test mode so Playwright
 * can read live unit coordinates and game phase directly from Pinia stores
 * without having to parse canvas pixels.
 *
 * Only active when `import.meta.env.DEV` is true (Vite dev server).
 * The getter is evaluated lazily at access time so it always returns
 * the current store state.
 */

export default defineNuxtPlugin(() => {
  if (!import.meta.env.DEV) return

  const gameStore = useGameStore()
  const forcesStore = useForcesStore()
  const intelStore = useIntelligenceStore()
  const mapStore = useMapStore()

  // Action bridge — lets Playwright drive the game without pixel-level clicks
  ;(window as any).__GAME_ACTIONS__ = {
    selectTaskGroup: (id: string) => mapStore.selectTaskGroup(id),
    issueOrder: (payload: unknown) => gameStore.issueOrder(payload as any),
    togglePause: () => gameStore.togglePause(),
    selectFlightPlan: (id: string | null) => mapStore.selectFlightPlan(id),

    /**
     * Advance the simulation by exactly `nSteps` × 30-minute steps, synchronously,
     * without waiting for requestAnimationFrame. Use in Playwright tests to avoid
     * rAF throttling in headless mode.
     */
    fastForward: (nSteps: number) => {
      const engine = gameStore.engine
      if (!engine) return
      const wasPaused = engine.isPaused
      const prevScale = engine.timeScale
      engine.setTimeScale(1)
      if (wasPaused) engine.resume()
      // 30 sim-minutes × 100ms/sim-minute = 3 000ms at 1× fires exactly one step
      const STEP_MS = 30 * 100
      for (let i = 0; i < nSteps; i++) {
        const result = engine.tick(STEP_MS)
        if (result.stepFired && result.snapshot) {
          forcesStore.syncFromSnapshot(result.snapshot)
          intelStore.syncFromSnapshot(result.snapshot)
        }
        if (engine.isPaused) break   // scenario ended
      }
      engine.setTimeScale(prevScale)
      if (wasPaused) engine.pause()
      gameStore.isPaused = engine.isPaused
    },
  }

  Object.defineProperty(window, '__GAME_STATE__', {
    get() {
      return {
        phase: gameStore.phase,
        isPaused: gameStore.isPaused,
        timeScale: gameStore.timeScale,
        currentTime: { ...gameStore.currentTime },

        taskGroups: [...forcesStore.taskGroups.values()].map(tg => ({
          id: tg.id,
          name: tg.name,
          side: tg.side,
          position: { ...tg.position },
          currentOrder: tg.currentOrder,
          speed: tg.speed
        })),

        ships: [...forcesStore.ships.values()].map(s => {
          const sc = gameStore.engine?.['state']?.shipClasses?.get(s.classId)
          return {
            id: s.id,
            name: s.name,
            side: s.side,
            status: s.status,
            hullDamage: s.hullDamage,
            fires: s.fires,
            taskGroupId: s.taskGroupId,
            isCarrier: sc ? (sc.type as string).includes('carrier') : false,
          }
        }),

        squadrons: [...forcesStore.squadrons.values()].map(sq => ({
          id: sq.id,
          name: sq.name,
          side: sq.side,
          aircraftCount: sq.aircraftCount,
          deckStatus: sq.deckStatus,
          taskGroupId: sq.taskGroupId
        })),

        flightPlans: [...forcesStore.flightPlans.values()].map(fp => ({
          id: fp.id,
          mission: fp.mission,
          status: fp.status,
          side: fp.side,
          targetHex: fp.targetHex ? { ...fp.targetHex } : undefined
        })),

        contacts: intelStore.activeAlliedContacts.map(c => ({
          id: c.id,
          lastKnownHex: { ...c.lastKnownHex },
          contactType: c.contactType,
          confirmedTaskGroupId: c.confirmedTaskGroupId,
        })),

        sunkMarkers: intelStore.sunkMarkers.map(m => ({
          hex: { ...m.hex },
          side: m.side,
          shipId: m.shipId,
        })),

        alliedContactCount: intelStore.alliedContacts.size,
        sightingLogLength: intelStore.sightingLog.length,
        combatLogLength: intelStore.combatLog.length,
        selectedFlightPlanId: mapStore.selectedFlightPlanId
      }
    },
    configurable: true,
    enumerable: false
  })
})
