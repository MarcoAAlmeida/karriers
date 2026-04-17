/**
 * Sprint 24 — ScenarioParams + Headless Runner
 *
 * Tests:
 *  1. Headless run completes a full Midway game without throwing.
 *  2. ScenarioParams overrides apply — 10× fuel rate exhausts the pool much
 *     faster, ending the game well before the normal endTime step count.
 *  3. Seeded spawn ('seeded') produces identical TG positions on repeated calls.
 */

import { describe, it, expect } from 'vitest'
import { MIDWAY } from '@game/data/scenarios/midway'
import { buildStateFromScenario } from '@game/utils/scenarioState'
import { GameEngine } from '@game/engine/GameEngine'
import { JapaneseAI } from '@game/engine/JapaneseAI'
import type { ScenarioParams } from '@game/types/scenario'

// ── Helpers ────────────────────────────────────────────────────────────────

const ONE_STEP_MS = 30 * 130 + 1 // just over one 30-min step at 1× speed

/**
 * Run the engine to ScenarioEnded (or safety limit) and return step count.
 * JapaneseAI issues orders every step.
 */
function runToCompletion(params: Partial<ScenarioParams> = {}): {
  stepCount: number
  winner: string
  alliedPoints: number
  japanesePoints: number
} {
  const state = buildStateFromScenario(MIDWAY, params)
  const engine = new GameEngine(state, MIDWAY.startTime, MIDWAY.endTime, params)
  const ai = new JapaneseAI()

  let stepCount = 0
  let winner = ''
  let alliedPoints = 0
  let japanesePoints = 0
  let ended = false

  engine.events.on('ScenarioEnded', (evt) => {
    ended = true
    winner = evt.winner
    alliedPoints = evt.alliedPoints
    japanesePoints = evt.japanesePoints
  })

  engine.resume()

  const SAFETY = 10_000
  while (!ended && stepCount < SAFETY) {
    engine.tick(ONE_STEP_MS)
    stepCount++
    if (!ended) {
      ai.step(engine.getSnapshot(), order => engine.issueOrder(order))
    }
  }

  engine.destroy()
  return { stepCount, winner, alliedPoints, japanesePoints }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ScenarioParams', () => {
  it('headless runner completes a full Midway game without throwing', () => {
    const result = runToCompletion({ seed: 42, spawnMode: 'fixed' })

    expect(result.stepCount).toBeGreaterThan(0)
    expect(['allied', 'japanese', 'draw']).toContain(result.winner)
  })

  it('10× fuel rate ends the game faster than default', () => {
    // Default Midway run with a fixed seed
    const defaultResult = runToCompletion({ seed: 123 })

    // Same seed but aviation fuel rates cranked to 10×
    const highFuelResult = runToCompletion({
      seed: 123,
      strikeFuelRate: 20,
      capFuelRate: 20,
      scoutFuelRate: 10,
      searchFuelRate: 10
    })

    // High-fuel game must end sooner
    expect(highFuelResult.stepCount).toBeLessThan(defaultResult.stepCount)
  })

  it('seeded spawn produces identical TG positions on repeated calls', () => {
    const params: Partial<ScenarioParams> = { seed: 99, spawnMode: 'seeded' }

    const state1 = buildStateFromScenario(MIDWAY, params)
    const state2 = buildStateFromScenario(MIDWAY, params)

    // All task group positions must match between the two states
    for (const [id, tg1] of state1.taskGroups) {
      const tg2 = state2.taskGroups.get(id)
      expect(tg2, `TG ${id} missing in second run`).toBeDefined()
      expect(tg1.position).toEqual(tg2!.position)
    }
  })

  it('seeded spawn with different seeds produces different positions', () => {
    const stateA = buildStateFromScenario(MIDWAY, { seed: 1, spawnMode: 'seeded' })
    const stateB = buildStateFromScenario(MIDWAY, { seed: 9999, spawnMode: 'seeded' })

    const tgIds = [...stateA.taskGroups.keys()]
    const allSame = tgIds.every((id) => {
      const a = stateA.taskGroups.get(id)!
      const b = stateB.taskGroups.get(id)!
      return a.position.q === b.position.q && a.position.r === b.position.r
    })

    expect(allSame).toBe(false)
  })

  it('durationSteps override limits game length', () => {
    // Allow only 10 steps — scenario must end at or before step 10
    const result = runToCompletion({ seed: 42, durationSteps: 10 })
    expect(result.stepCount).toBeLessThanOrEqual(10)
  })
})
