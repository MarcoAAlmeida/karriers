import { GameEngine, createEmptyState } from '@game/engine/GameEngine'
import type { GameSnapshot, OrderPayload } from '@game/engine/GameEngine'
import type { GameTime } from '@game/types'
import type { TimeScale } from '@game/engine/TimeSystem'

export type GamePhase = 'menu' | 'playing' | 'paused' | 'ended'

export const useGameStore = defineStore('game', () => {
  // ── State ────────────────────────────────────────────────────────────────

  const phase = ref<GamePhase>('menu')
  const currentTime = ref<GameTime>({ day: 1, hour: 6, minute: 0 })
  const timeScale = ref<TimeScale>(1)
  const isPaused = ref(true)
  const stepFraction = ref(0)   // 0–1 for rendering interpolation

  /**
   * The engine instance — stored in a shallowRef to prevent Vue from
   * deep-watching the engine's internal Maps and class instances.
   */
  const engine = shallowRef<GameEngine | null>(null)

  // ── Engine init ───────────────────────────────────────────────────────────

  function initEngine(
    startTime: GameTime,
    endTime: GameTime,
    initialState = createEmptyState()
  ): GameEngine {
    engine.value?.destroy()

    const e = new GameEngine(initialState, startTime, endTime)
    engine.value = e

    // Subscribe to engine events
    e.events.on('StepComplete', onStepComplete)
    e.events.on('ScenarioEnded', onScenarioEnded)

    phase.value = 'playing'
    currentTime.value = { ...startTime }
    isPaused.value = true

    return e
  }

  // ── Engine event handlers ─────────────────────────────────────────────────

  function onStepComplete(snapshot: GameSnapshot): void {
    currentTime.value = { ...snapshot.time }
    stepFraction.value = snapshot.stepFraction

    // Other stores sync themselves via their own event subscriptions.
    // The game store only tracks time and phase.
  }

  function onScenarioEnded({ time }: { winner: string; time: GameTime }): void {
    currentTime.value = { ...time }
    phase.value = 'ended'
    isPaused.value = true
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  function togglePause(): void {
    if (!engine.value) return
    engine.value.togglePause()
    isPaused.value = engine.value.isPaused
    phase.value = isPaused.value ? 'paused' : 'playing'
  }

  function setTimeScale(scale: TimeScale): void {
    engine.value?.setTimeScale(scale)
    timeScale.value = scale
  }

  function issueOrder(payload: OrderPayload): void {
    engine.value?.issueOrder(payload)
  }

  function returnToMenu(): void {
    engine.value?.destroy()
    engine.value = null
    phase.value = 'menu'
    isPaused.value = true
  }

  return {
    // State
    phase,
    currentTime,
    timeScale,
    isPaused,
    stepFraction,
    engine,
    // Actions
    initEngine,
    togglePause,
    setTimeScale,
    issueOrder,
    returnToMenu
  }
})
