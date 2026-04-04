/**
 * useGameLoop — drives the engine tick via requestAnimationFrame.
 *
 * Mount this once in a top-level component (e.g. the game page).
 * It reads the engine from the game store and calls tick() every frame,
 * then syncs all dependent stores when a step fires.
 */
export function useGameLoop() {
  const gameStore = useGameStore()
  const forcesStore = useForcesStore()

  let rafHandle = 0
  let lastTimestamp: number | null = null

  function loop(timestamp: number): void {
    const delta = lastTimestamp !== null ? timestamp - lastTimestamp : 0
    lastTimestamp = timestamp

    const engine = gameStore.engine
    if (engine && delta > 0) {
      const result = engine.tick(delta)

      // Always update step fraction for smooth interpolation
      gameStore.stepFraction = result.stepFraction

      if (result.stepFired && result.snapshot) {
        forcesStore.syncFromSnapshot(result.snapshot)
        // intelligence store will also sync here in Sprint 3
      }

      // Mirror pause state (engine may self-pause at scenario end)
      if (engine.isPaused !== gameStore.isPaused) {
        gameStore.isPaused = engine.isPaused
      }
    }

    rafHandle = requestAnimationFrame(loop)
  }

  onMounted(() => {
    rafHandle = requestAnimationFrame(loop)
  })

  onUnmounted(() => {
    cancelAnimationFrame(rafHandle)
    lastTimestamp = null
  })
}
