/**
 * Headless runner — runs a Midway scenario to completion without a browser.
 *
 * Usage:
 *   npx tsx scripts/headless.ts
 *   npx tsx scripts/headless.ts --seed 42
 *   npx tsx scripts/headless.ts --seed 42 --durationSteps 48
 *
 * Output: JSON to stdout with winner, points, step count, and elapsed wall time.
 *
 * No Vue, no Nuxt — pure TypeScript engine only.
 */

import { MIDWAY } from '../game/data/scenarios/midway.js'
import { buildStateFromScenario } from '../game/utils/scenarioState.js'
import { GameEngine } from '../game/engine/GameEngine.js'
import { JapaneseAI } from '../game/engine/JapaneseAI.js'
import type { ScenarioParams } from '../game/types/scenario.js'

// ── CLI args ──────────────────────────────────────────────────────────────

function parseArgs(): Partial<ScenarioParams> {
  const params: Partial<ScenarioParams> = {}
  const args = process.argv.slice(2)

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]
    if (arg === '--seed' && next !== undefined) {
      params.seed = parseInt(next, 10)
      i++
    } else if (arg === '--durationSteps' && next !== undefined) {
      params.durationSteps = parseInt(next, 10)
      i++
    } else if (arg === '--spawnMode' && next !== undefined) {
      params.spawnMode = next as ScenarioParams['spawnMode']
      i++
    }
  }

  return params
}

// ── Main ──────────────────────────────────────────────────────────────────

function run(): void {
  const params: Partial<ScenarioParams> = {
    seed: 42, // reproducible by default; override with --seed
    spawnMode: 'fixed',
    ...parseArgs()
  }

  const startWall = Date.now()

  const state = buildStateFromScenario(MIDWAY, params)
  const engine = new GameEngine(state, MIDWAY.startTime, MIDWAY.endTime, params)
  const ai = new JapaneseAI()

  let stepCount = 0
  let ended = false
  let result: {
    winner: string
    alliedPoints: number
    japanesePoints: number
    simTime: { day: number, hour: number, minute: number }
  } | null = null

  engine.events.on('ScenarioEnded', (evt) => {
    ended = true
    result = {
      winner: evt.winner,
      alliedPoints: evt.alliedPoints,
      japanesePoints: evt.japanesePoints,
      simTime: evt.time
    }
  })

  engine.resume()

  // Each tick fires exactly one 30-min step.
  // MS_PER_SIM_MINUTE_AT_1X = 130, STEP_MINUTES = 30 → one step needs 30 * 130 = 3900 ms.
  // We pass just over that to guarantee exactly one step per call.
  const ONE_STEP_MS = 30 * 130 + 1

  const SAFETY_LIMIT = 20_000 // ~417 simulated days — should never reach this

  while (!ended && stepCount < SAFETY_LIMIT) {
    engine.tick(ONE_STEP_MS)
    stepCount++

    if (!ended) {
      const snap = engine.getSnapshot()
      ai.step(snap, order => engine.issueOrder(order))
    }
  }

  const wallMs = Date.now() - startWall

  if (!result) {
    console.error('Headless runner: safety limit reached without ScenarioEnded')
    process.exit(1)
  }

  console.log(JSON.stringify(
    { ...result, stepCount, wallMs },
    null,
    2
  ))
}

run()
