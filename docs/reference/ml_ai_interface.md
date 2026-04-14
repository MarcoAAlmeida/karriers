# ML AI Interface Design for Karriers

Analysis of making the game engine compatible with machine-learning adversarial AIs, covering
two paradigms — Evolutionary Algorithms (EA) and Neural Networks (RL) — plus shared
infrastructure, feasibility, and alternatives.

---

## 1. What the Engine Already Gets Right

The `JapaneseAI` class already expresses the correct implicit contract:

```typescript
step(snapshot: GameSnapshot, issueOrder: (p: OrderPayload) => void): void
```

This is exactly the interface both ML paradigms need — observation in, actions out, no coupling to
wall-clock or UI. Three additional properties make the engine well-suited for ML training:

- **Seeded RNG** — deterministic replays; essential for fair EA fitness evaluation across a population
- **Discrete 30-minute steps** — a clean Markov Decision Process; no sub-step timing ambiguity
- **Zero DOM/PixiJS dependencies** — the engine runs headlessly in Node.js worker threads without modification

---

## 2. Shared Infrastructure (Required by Both Approaches)

These additions are needed regardless of ML flavor. They form the training substrate.

### 2.1 Formalize the `AIController` Interface

Currently implicit in `JapaneseAI`. Extracting it to an explicit interface makes both sides pluggable
and enables self-play (Allied AI vs. Japanese AI).

```typescript
// game/engine/AIController.ts
export interface AIController {
  readonly side: Side
  step(snapshot: GameSnapshot, issueOrder: (p: OrderPayload) => void): void
  reset?(): void   // called between episodes (EA generations, RL resets)
}
```

`JapaneseAI` is then refactored to `implements AIController`. An `AlliedAI` can be added symmetrically.

---

### 2.2 `HeadlessRunner` — Synchronous Episode Pump

The current `tick(wallClockDeltaMs)` is tied to real time for UI rendering. Training requires a
synchronous step-pump that advances the simulation as fast as the CPU allows.

```typescript
// game/engine/HeadlessRunner.ts
export interface EpisodeResult {
  winner: Side | 'draw'
  alliedPoints: number
  japanesePoints: number
  stepCount: number
  finalSnapshot: GameSnapshot
  combatLog: CombatEvent[]
}

export interface StepOutcome {
  done: boolean
  snapshot: GameSnapshot
  reward: { allied: number; japanese: number }
}

export class HeadlessRunner {
  constructor(
    scenario: Scenario,
    alliedAI: AIController,
    japaneseAI: AIController,
    seed?: number
  )

  /** Run a full episode to completion. Returns terminal result. */
  runToEnd(): EpisodeResult

  /** Advance a single step. Used by RL environments that need per-step rewards. */
  step(): StepOutcome

  /** Deep-clone this runner at its current state. Used for EA parallel rollouts. */
  clone(): HeadlessRunner

  /** Reset to scenario initial state with a new optional seed. */
  reset(seed?: number): void
}
```

Key implementation detail: `HeadlessRunner` calls `GameEngine.runStep()` directly in a tight loop,
bypassing `TimeSystem.tick()`. A Midway scenario (~96 steps at 30-minute intervals) completes in
under 1 ms of CPU time, making population-scale evaluation practical.

---

### 2.3 `MutableGameState` Deep Clone

EA requires running hundreds of games from identical starting states (same scenario, same seed).
`MutableGameState` uses `Map` with mutable object references — a shallow copy would cause state
corruption across parallel runners.

```typescript
// game/engine/stateClone.ts
export function cloneGameState(state: MutableGameState): MutableGameState {
  return {
    taskGroups:        deepCloneMap(state.taskGroups),
    ships:             deepCloneMap(state.ships),
    squadrons:         deepCloneMap(state.squadrons),
    flightPlans:       deepCloneMap(state.flightPlans),
    alliedContacts:    deepCloneMap(state.alliedContacts),
    japaneseContacts:  deepCloneMap(state.japaneseContacts),
    hexCells:          state.hexCells,       // immutable terrain — safe to share
    weatherZones:      state.weatherZones.map(z => ({ ...z })),
    aircraftTypes:     state.aircraftTypes,  // immutable reference data
    shipClasses:       state.shipClasses,    // immutable reference data
    victoryConditions: state.victoryConditions.slice(),
    pendingCombatEvents: [],
    pendingGameEvents: [],
    alliedFuelPool:    state.alliedFuelPool,
    japaneseFuelPool:  state.japaneseFuelPool,
  }
}
```

`hexCells`, `aircraftTypes`, and `shipClasses` are read-only reference data and can be shared
across clones without issue.

---

### 2.4 Continuous Reward / Fitness Signal

`VictorySystem` only fires at scenario end. Both ML approaches benefit from a continuous signal
that can be evaluated mid-episode (for RL per-step rewards) or at terminal state (for EA fitness).

```typescript
// game/engine/rewardFn.ts
export function computeReward(snapshot: GameSnapshot, side: Side): number {
  const enemy: Side = side === 'allied' ? 'japanese' : 'allied'
  let score = 0

  // Fleet survival (carriers worth most)
  for (const ship of snapshot.ships.values()) {
    const weight = shipRewardWeight(ship)  // carriers > BBs > others
    if (ship.side === side)  score += weight * (1 - ship.hullDamage / 100)
    if (ship.side === enemy) score -= weight * (1 - ship.hullDamage / 100)
  }

  // Active contact intelligence (reward for knowing where the enemy is)
  const ownContacts = side === 'allied' ? snapshot.alliedContacts : snapshot.japaneseContacts
  score += [...ownContacts.values()].filter(c => c.isActive).length * 5

  // Time pressure — reward for acting decisively
  // (can be weighted by scenario duration to normalize)

  return score
}
```

This function is the shared backbone. EA uses it as a terminal fitness score; RL uses it as a
per-step reward delta (difference from previous step).

---

## 3. Evolutionary Algorithm Path

### 3.1 Concept

EA does not learn a policy in the NN sense. It evolves the **parameters of a decision function**.
The genome encodes thresholds and weights used by the AI's rule logic — the existing
`JapaneseAI` is already parameterized implicitly via hard-coded constants. Externalizing those
constants into a genome is the main code change.

See `docs/reference/evolutionary.md` for the detailed genome schema (`JapaneseAIGenome`),
fitness formula, and exploit analysis. This document focuses on the interface layer.

### 3.2 `ParameterizedAI`

```typescript
// game/engine/ParameterizedAI.ts
export type Genome = Float32Array

export interface ParameterizedAI extends AIController {
  readonly genome: Genome
  withGenome(g: Genome): ParameterizedAI   // returns a new instance with different weights
}
```

The existing `JapaneseAI.step()` logic becomes the body of `ParameterizedAI.step()`, with every
hard-coded constant (`TARGET_PROXIMITY_HEXES`, `MAX_STRIKE_RANGE_FACTOR`, the `contactScore`
carrier penalty, etc.) replaced by `this.genome[i]`.

### 3.3 Training Loop

```typescript
// train/ea/runEvolution.ts
import { Worker } from 'node:worker_threads'

async function evaluatePopulation(
  genomes: Genome[],
  scenario: Scenario,
  runsPerGenome: number,   // average over N seeds to reduce RNG variance
  workerCount = 8
): Promise<number[]> {
  // Distribute genomes across worker_threads
  // Each worker runs HeadlessRunner.runToEnd() independently
  // Returns fitness scores array aligned to genomes input
}

async function runEvolution(generations = 200, populationSize = 100) {
  let population = generateInitialPopulation(populationSize)

  for (let gen = 0; gen < generations; gen++) {
    const scores = await evaluatePopulation(population, midwayScenario, runsPerGenome = 5)
    population = evolveNextGeneration(population, scores)   // tournament select + mutate + crossover
    console.log(`Gen ${gen}: best=${Math.max(...scores).toFixed(1)}`)
  }

  saveTrainedWeights(bestGenome(population, scores))
}
```

Population of 100 × 5 seeds = 500 episodes per generation. At <1 ms each on a single thread,
8 workers finish a generation in under 100 ms. 200 generations ≈ 20 seconds of wall clock.
**This is the fastest path to a non-trivial adaptive AI with no external dependencies.**

### 3.4 EA Flavor Choices

| Variant | Fit for this game | Notes |
|---|---|---|
| Simple GA (tournament + single-point crossover) | Yes | Lowest barrier; good first step |
| CMA-ES | Yes | Better convergence for continuous weight vectors; drop-in replacement once GA baseline works |
| NEAT (topology evolution) | Partially | Useful if you replace the rule-based AI with a small NN evolved by NEAT; adds complexity |
| Island model (parallel subpopulations) | Yes | Fits `worker_threads` naturally; prevents premature convergence |

Recommendation: start with simple GA, migrate to CMA-ES once the genome schema stabilizes.

---

## 4. Neural Network / Reinforcement Learning Path

### 4.1 Concept

RL trains a policy `π(observation) → action` via trial and error. The engine becomes a
gym environment. The NN generalizes across states rather than encoding explicit rules.

### 4.2 Observation Encoding

`GameSnapshot` is rich but not a flat tensor. A fixed-length `Float32Array` is required.

```typescript
// game/ml/ObservationEncoder.ts

/** Produces a fixed-length Float32Array from a snapshot for a given side's perspective. */
export function encodeObservation(snapshot: GameSnapshot, side: Side): Float32Array

// Suggested feature groups (~200–300 floats total):
//   Own task groups: position (q,r normalized), speed, order (one-hot), fuel, course  [~50]
//   Own squadrons:   per-TG counts by role, readiness fraction                        [~40]
//   Enemy contacts:  up to N contacts, hex position, contact type (one-hot), staleness [~60]
//   Active flights:  mission type, progress, target hex                               [~40]
//   Global:          time remaining (normalized), weather zones, fuel pools           [~20]
//   Victory deltas:  current points for each side                                     [~10]
```

The encoder must be deterministic and produce the same dimensionality regardless of how many
task groups or contacts exist (use fixed-size slots with masking, not variable-length arrays).

### 4.3 Action Space Encoding

`OrderPayload` is a discriminated union of 7 action types. For NN there are two options:

**Option A — Flat discrete multi-head**
```
(action_type ∈ {0..6}) × (target_tg ∈ {0..N}) × (target_hex_q, target_hex_r) × (squadron_mask)
```
Tractable for PPO. Hard part: variable-length squadron selection → use a bitmask of fixed length.

**Option B — Auto-regressive decomposition (recommended)**
```
step 1: choose action_type (categorical, 7 classes)
step 2: conditioned on type, choose target task group (categorical)
step 3: conditioned on TG, choose target hex or squadron mask
```
Better handles the combinatorial structure of the action space. Each sub-head is a small network
conditioned on previous choices.

### 4.4 Gym Environment Interface

```typescript
// game/ml/KarriersEnv.ts  (TypeScript side of the bridge)
export class KarriersEnv {
  constructor(scenario: Scenario, side: Side, seed?: number)

  reset(): Float32Array                             // returns initial observation
  step(action: EncodedAction): {
    obs: Float32Array
    reward: number
    done: boolean
    info: Record<string, number>
  }
}
```

### 4.5 TypeScript vs. Python Training

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **TensorFlow.js in Node.js** | No language boundary; engine in same process | Slower training; thin ecosystem vs. PyTorch | Prototyping only |
| **ONNX Runtime (inference)** | Import Python-trained model into TS; fast inference | Training must be external; no online learning | Good for deployment |
| **Python gym bridge via stdio JSON** | Full PyTorch/SB3/RLlib ecosystem; no engine rewrite | IPC overhead (~0.5 ms/step); two codebases | **Recommended for training** |
| **Compile engine to WASM, call from Python** | Best performance from Python | High setup cost (Emscripten/WASI toolchain) | Future option |

#### Recommended Python bridge sketch

```typescript
// train/rl/bridge.ts — Node.js process that wraps KarriersEnv
import { createInterface } from 'node:readline'
const env = new KarriersEnv(midwayScenario, 'japanese')
const rl = createInterface({ input: process.stdin })

rl.on('line', (line) => {
  const msg = JSON.parse(line)
  if (msg.cmd === 'reset') {
    process.stdout.write(JSON.stringify({ obs: Array.from(env.reset()) }) + '\n')
  } else if (msg.cmd === 'step') {
    const result = env.step(msg.action)
    process.stdout.write(JSON.stringify({
      obs: Array.from(result.obs),
      reward: result.reward,
      done: result.done
    }) + '\n')
  }
})
```

```python
# train/rl/karriers_gym.py
import gymnasium as gym
import subprocess, json, numpy as np

class KarriersEnv(gym.Env):
    def __init__(self):
        self.proc = subprocess.Popen(['node', 'train/rl/bridge.js'],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.observation_space = gym.spaces.Box(-1, 1, shape=(256,), dtype=np.float32)
        self.action_space = gym.spaces.Discrete(N_ACTIONS)

    def reset(self, **kwargs):
        self._send({'cmd': 'reset'})
        return np.array(self._recv()['obs'], dtype=np.float32), {}

    def step(self, action):
        self._send({'cmd': 'step', 'action': int(action)})
        r = self._recv()
        return np.array(r['obs'], dtype=np.float32), r['reward'], r['done'], False, {}
```

Then train with **Stable Baselines 3**:

```python
from stable_baselines3 import PPO
model = PPO("MlpPolicy", KarriersEnv(), verbose=1)
model.learn(total_timesteps=5_000_000)
model.save("japanese_ai_ppo")
```

For **self-play** (Allied AI vs. Japanese AI), use RLlib's `self-play` callbacks or the
[OpenSpiel](https://github.com/google-deepmind/openspiel) framework which has
MCTS, CFR, and PPO built in and maps cleanly to a two-player zero-sum game.

---

## 5. Comparison: EA vs. RL for This Game

| Concern | EA (Parameterized rules) | NN / RL (Learned policy) |
|---|---|---|
| Training environment | `HeadlessRunner` × N workers | `HeadlessRunner` as gym env |
| Observation format | Raw `GameSnapshot` fine | Requires `ObservationEncoder` |
| Action interface | `OrderPayload` directly | Requires discrete/continuous encoding |
| Reward signal | Terminal fitness (EpisodeResult) | Per-step delta + terminal |
| Training language | Pure TypeScript | TS engine + Python trainer |
| Compute | CPU-parallelizable, cheap, fast | GPU beneficial; more expensive |
| Emergent behavior | Moderate (tune existing rules) | High (can discover novel strategies) |
| Interpretability | High (genome = readable weights) | Low (black box) |
| Time to first working AI | Low (days) | High (weeks) |
| Long-term ceiling | Limited by rule architecture | Limited by observation/action design |
| Self-play support | Co-evolution (island model) | Native (PPO + SB3 self-play) |

**For Karriers specifically**: EA is the right first step. The game has a small, structured action
space and strong prior knowledge about good heuristics (the existing `JapaneseAI`). Evolving
weights on top of proven rule logic is fast, interpretable, and requires zero new dependencies.
RL becomes worth the complexity once the EA ceiling is hit or if you want truly emergent tactics.

---

## 6. Recommended External Frameworks

| Framework | Use case | Why relevant |
|---|---|---|
| **OpenSpiel (DeepMind)** | Both EA and RL | Explicit multi-agent adversarial game framework. Has CFR, MCTS, PPO built in. `SimultaneousGame` interface maps directly to this engine's tick model. |
| **PettingZoo** | RL self-play | Python multi-agent gym standard. Use `AECEnv` (alternating execution) — one side acts per step, matching how `issueOrder` queues work. |
| **Stable Baselines 3** | RL training | Best production PPO/A2C/SAC implementation; pairs with PettingZoo out of the box. |
| **RLlib (Ray)** | RL at scale | Best for large-scale self-play and population-based training (PBT). Use if SB3 is too slow. |
| **CMA-ES (cmaes npm / pycma)** | EA | Drop-in replacement for GA once genome schema stabilizes; much better convergence. |

---

## 7. Recommended Implementation Order

All steps build on each other. Steps 1–4 are shared infrastructure; steps 5 and 6 branch.

| Step | File(s) | Who needs it |
|---|---|---|
| 1. `AIController` interface | `game/engine/AIController.ts` | Both |
| 2. `HeadlessRunner` | `game/engine/HeadlessRunner.ts` | Both |
| 3. `cloneGameState()` | `game/engine/stateClone.ts` | EA (parallel population) |
| 4. `computeReward()` | `game/engine/rewardFn.ts` | Both |
| 5a. `ParameterizedAI` + simple GA | `game/engine/ParameterizedAI.ts`, `train/ea/` | EA path |
| 5b. `ObservationEncoder` | `game/ml/ObservationEncoder.ts` | RL path |
| 6a. CMA-ES upgrade | `train/ea/cmaes.ts` | EA (after baseline) |
| 6b. Python gym bridge + PPO | `train/rl/bridge.ts`, `train/rl/karriers_gym.py` | RL path |

Steps 1 and 2 are ~200 lines of straightforward TypeScript and unblock everything else.
Steps 3 and 4 are ~120 lines combined. The EA path (5a) adds ~300 lines with no new npm
dependencies. The RL path (5b+6b) adds a Python project and requires `stable-baselines3`
and `gymnasium`.
