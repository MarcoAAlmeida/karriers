import { describe, it, expect } from 'vitest'
import { useGameStore } from '../../app/stores/game'
import { createEmptyState } from '@game/engine/GameEngine'
import type { GameTime } from '@game/types'

const START: GameTime = { day: 1, hour: 6, minute: 0 }
const END: GameTime = { day: 3, hour: 0, minute: 0 }

describe('useGameStore.initEngine', () => {
  it('sets phase to playing and returns a GameEngine', () => {
    const store = useGameStore()
    const engine = store.initEngine(START, END, createEmptyState())
    expect(store.phase).toBe('playing')
    expect(engine).toBeTruthy()
    engine.destroy()
  })

  it('destroys previous engine when re-initialised', () => {
    const store = useGameStore()
    const e1 = store.initEngine(START, END, createEmptyState())
    const e2 = store.initEngine(START, END, createEmptyState())
    expect(e1).not.toBe(e2)
    e2.destroy()
  })
})

describe('useGameStore.onScenarioEnded', () => {
  it('sets phase=ended, winner, and points when ScenarioEnded fires', () => {
    const store = useGameStore()
    const engine = store.initEngine(START, END, createEmptyState())

    engine.events.emit('ScenarioEnded', {
      winner: 'allied',
      time: { day: 1, hour: 14, minute: 0 },
      alliedPoints: 30,
      japanesePoints: 10
    })

    expect(store.phase).toBe('ended')
    expect(store.isPaused).toBe(true)
    expect(store.scenarioWinner).toBe('allied')
    expect(store.alliedPoints).toBe(30)
    expect(store.japanesePoints).toBe(10)
  })

  it('handles japanese winner', () => {
    const store = useGameStore()
    const engine = store.initEngine(START, END, createEmptyState())

    engine.events.emit('ScenarioEnded', {
      winner: 'japanese',
      time: { day: 2, hour: 6, minute: 0 },
      alliedPoints: 5,
      japanesePoints: 40
    })

    expect(store.scenarioWinner).toBe('japanese')
    expect(store.japanesePoints).toBe(40)
  })
})

describe('useGameStore.returnToMenu', () => {
  it('resets phase and clears winner/points', () => {
    const store = useGameStore()
    const engine = store.initEngine(START, END, createEmptyState())

    engine.events.emit('ScenarioEnded', {
      winner: 'allied',
      time: START,
      alliedPoints: 30,
      japanesePoints: 0
    })

    store.returnToMenu()

    expect(store.phase).toBe('menu')
    expect(store.scenarioWinner).toBeNull()
    expect(store.alliedPoints).toBe(0)
    expect(store.japanesePoints).toBe(0)
    expect(store.engine).toBeNull()
  })
})

describe('useGameStore.togglePause', () => {
  it('pauses and resumes the engine', () => {
    const store = useGameStore()
    store.initEngine(START, END, createEmptyState())

    // starts paused
    expect(store.isPaused).toBe(true)
    store.togglePause()
    expect(store.isPaused).toBe(false)
    store.togglePause()
    expect(store.isPaused).toBe(true)
  })
})
