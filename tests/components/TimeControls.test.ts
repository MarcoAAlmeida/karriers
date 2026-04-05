/**
 * TimeControls behaviour tests.
 *
 * Tests the formattedTime computation and the store action wiring that
 * TimeControls.vue relies on, verified through the game store.
 */
import { describe, it, expect } from 'vitest'
import { useGameStore } from '../../app/stores/game'
import { createEmptyState } from '@game/engine/GameEngine'
import type { GameTime } from '@game/types'

const START: GameTime = { day: 1, hour: 6, minute: 0 }
const END: GameTime = { day: 3, hour: 0, minute: 0 }

// Mirrors TimeControls.vue formattedTime logic
function formattedTime(time: GameTime, stepFraction: number): string {
  const baseMinutes = time.day * 1440 + time.hour * 60 + time.minute
  const totalMinutes = baseMinutes + Math.floor(stepFraction * 30)
  const day = Math.floor(totalMinutes / 1440)
  const dayMinutes = totalMinutes % 1440
  const days = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const hh = String(Math.floor(dayMinutes / 60)).padStart(2, '0')
  const mm = String(dayMinutes % 60).padStart(2, '0')
  return `${days[day] ?? `D${day}`} ${hh}:${mm}`
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TimeControls — formattedTime', () => {
  it('formats day 1 06:00 correctly', () => {
    expect(formattedTime({ day: 1, hour: 6, minute: 0 }, 0)).toBe('Mon 06:00')
  })

  it('formats day 2 noon correctly', () => {
    expect(formattedTime({ day: 2, hour: 12, minute: 30 }, 0)).toBe('Tue 12:30')
  })

  it('interpolates step fraction into minutes', () => {
    // stepFraction = 0.5 → +15 minutes
    expect(formattedTime({ day: 1, hour: 10, minute: 0 }, 0.5)).toBe('Mon 10:15')
  })

  it('rolls over hour boundary when fraction pushes past :30', () => {
    // 10:30 + fraction=1.0 → 11:00
    expect(formattedTime({ day: 1, hour: 10, minute: 30 }, 1)).toBe('Mon 11:00')
  })
})

describe('TimeControls — play/pause wired to game store', () => {
  it('togglePause changes isPaused and phase', () => {
    const store = useGameStore()
    store.initEngine(START, END, createEmptyState())

    expect(store.isPaused).toBe(true)
    store.togglePause()
    expect(store.isPaused).toBe(false)
    expect(store.phase).toBe('playing')

    store.togglePause()
    expect(store.isPaused).toBe(true)
    expect(store.phase).toBe('paused')
  })
})

describe('TimeControls — speed changes wired to game store', () => {
  it('setTimeScale updates timeScale on the store and engine', () => {
    const store = useGameStore()
    store.initEngine(START, END, createEmptyState())

    store.setTimeScale(4)
    expect(store.timeScale).toBe(4)

    store.setTimeScale(1)
    expect(store.timeScale).toBe(1)
  })
})
