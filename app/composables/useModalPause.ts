import type { Ref } from 'vue'

/**
 * useModalPause — auto-pause the simulation while a modal is open.
 *
 * If the game was running when the modal opened, it is paused immediately.
 * When the modal closes (any path: confirm, cancel, Escape), the game
 * resumes — but only if this composable was the one that paused it.
 * If the game was already paused when the modal opened, the pause state
 * is left untouched in both directions.
 */
export function useModalPause(open: Ref<boolean>) {
  const gameStore = useGameStore()
  const wasRunning = ref(false)

  watch(open, (isOpen) => {
    if (isOpen) {
      wasRunning.value = !gameStore.isPaused
      if (!gameStore.isPaused) gameStore.togglePause()
    } else if (wasRunning.value) {
      wasRunning.value = false
      if (gameStore.isPaused) gameStore.togglePause()
    }
  })
}
