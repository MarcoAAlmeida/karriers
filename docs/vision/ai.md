# Karriers at War — AI & Simulation Vision

> **Scope:** Long-term design intent for adversarial AI, simulation modes, scenario parameterization, persistence, and training infrastructure. This document drives sprint planning from Sprint 24 onward.

---

## Design Principles

1. **Engine-first portability.** The TypeScript implementation is a proof-of-concept. The engine's public contracts (types, interfaces, step sequence) are written as if they will be ported to Go or C++. Avoid TypeScript-specific idioms in `game/` layer contracts.

2. **ML-amenability.** Game state is a flat, fully serializable snapshot. Agent actions are a typed, finite set of orders. This maps cleanly to neural network inputs and outputs without engine changes.

3. **Separation of concerns.** AI policy is external to the engine. The engine is a pure simulator: given state + orders, it produces the next state. It has no opinion on who issued the orders.

4. **Both sides get AI.** The human player is a special case of an AI agent that defers to UI input. Every simulation mode — including human play — runs through the same `AIAgent` interface.

---

## Simulation Modes

| Mode | Description | Primary Use |
|---|---|---|
| **Human vs AI** | Player controls one side; AI controls the other | Normal gameplay |
| **AI vs AI — Watch** | Both sides AI-controlled; player observes in the browser at any speed | Demo, analysis, AI evaluation |
| **Headless Batch** | No renderer; engine steps as fast as the CPU allows | Training, parameter sweeps |

All three modes share the same engine step sequence and `AIAgent` interface. Only the loop driver differs.

---

## The AIAgent Interface

```typescript
// game/ai/AIAgent.ts

export interface AIAgent {
  readonly side: Side;

  /**
   * Called once per engine step, before the engine processes it.
   * Returns zero or more orders to issue for this side.
   *
   * Contract:
   * - Pure function — no I/O, no mutable external state, no async.
   * - The same snapshot must always be able to produce a valid (possibly empty) order list.
   * - The engine calls issueOrder() for each returned order after this call returns.
   */
  decideTurn(snapshot: GameSnapshot): EngineOrder[];
}
```

**Key properties:**

- **Stateless.** The agent receives the full `GameSnapshot` each step; it carries no internal mutable memory between calls. This makes agents serializable, reproducible, and directly mappable to a neural network forward pass.
- **`GameSnapshot`** is already defined and emitted by the engine on `StepComplete`. No new state surface is needed.
- **`EngineOrder`** is the existing `issueOrder` union type — the same orders a human issues through the UI.
- **`HumanAgent`** implements `AIAgent` and returns orders from a UI input queue. From the engine's perspective, human and AI are identical.

---

## Scenario Parameterization

All variable scenario inputs are collected into a single `ScenarioParams` object passed at engine initialization. This replaces hardcoded constants throughout the engine.

```typescript
// game/types/scenario.ts (addition)

export interface ScenarioParams {
  seed?: number;                           // RNG seed; undefined = random each run
  boardSize?: { width: number; height: number };  // default: 72 × 84
  spawnMode: 'fixed' | 'random' | 'seeded';
  detectionRangeMultiplier: number;        // 1.0 = historical baseline
  fuelConsumptionMultiplier: number;       // 1.0 = historical baseline
  fleetTemplate?: {
    allied: ForceTemplate;
    japanese: ForceTemplate;
  };
  durationSteps?: number;                  // default: 144 (72 h at 30 min/step)
}
```

**Spawn modes:**

| Mode | Behavior |
|---|---|
| `fixed` | Historical positions (current Midway behavior) |
| `random` | Forces spawned within defined zone boundaries with random hex offsets |
| `seeded` | Reproducible random spawn — same seed, same opening positions every time |

`seeded` mode is essential for fair AI training: every genome in a generation plays the same opening.

---

## Persistence & Replay

### What Is Stored

Every completed game produces two records:

**Game record** — metadata about the run:
```
id, scenario_name, params_json, allied_agent_id, japanese_agent_id,
winner, duration_steps, created_at
```

**Step log** — full audit trail:
```
game_id, step_number, snapshot_json, orders_allied_json, orders_japanese_json
```

`GameSnapshot` is already a plain serializable object. No additional mapping is needed.

### Cloudflare Storage (schema TBD)

- **D1**: `games` and `steps` tables. Query by scenario, agent, winner, date range.
- **R2**: trained weight files (`*.weights.json`), parameter sweep results (`*.sweep.json`).

Data model detail is deferred to a separate design session.

### Browser Replay

A `ReplayDriver` reads the step log from D1 and feeds each snapshot into the existing Pinia stores on a timer, exactly as the live engine's `StepComplete` event does. The PixiJS renderer receives the same events; pause/resume/speed controls work identically to live play.

### Training Data Export

```
GET /api/games/{id}/export
→ NDJSON stream: { step, snapshot, orders_allied, orders_japanese } per line
```

Python notebooks and training pipelines consume this format directly for reward modeling and imitation learning.

---

## Training Infrastructure

### Phase 1 — Evolutionary (Genome-Based)

The genome encodes either:
- **Balance parameters** (`ScenarioParams` values) — used to tune the game itself
- **Policy weights** (`AIWeights`) — used to train a smarter agent

```typescript
// Fitness function skeleton
function calculateFitness(result: ScenarioResult, genome: AIWeights): number {
  const V  = result.victoryPointDelta;           // positive = Japanese win margin
  const TR = result.enemyTonnageSunk / (result.friendlyTonnageSunk + 1);
  const S  = result.durationSteps;               // penalize slow wins
  const E  = calculateExploitPenalty(result);    // see below
  return W_V * V + W_TR * TR - W_S * S - W_E * E;
}
```

**Exploit penalties** (`E` accumulates for):
1. Carrier enters surface combat range of enemy surface units (90% retreat is not a free scout)
2. Launching single-aircraft search waves (minimum squadron size enforced in fitness, not engine)
3. Strikes arriving with insufficient fuel to return (suicide scouting)

**Training loop:**
1. Generate population of N genomes
2. For each genome: instantiate headless engine with `seed = generationSeed`, run to `ScenarioEnded`, score
3. Select top performers, crossover + mutate
4. Repeat for G generations
5. Export top genome to `public/ai-weights.json`

The engine's zero-Vue, zero-Nuxt `game/` layer runs in plain Node.js via `tsx` with no modification.

### Phase 2 — Neural Network (Future)

The `decideTurn(snapshot: GameSnapshot) => EngineOrder[]` interface maps directly to a neural network:

- **Input:** `snapshot` serialized to a fixed-size feature vector (task group positions, fuel levels, squadron states, contact list, step count)
- **Output:** probability distribution over the `EngineOrder` action space; sample to get orders
- **Reward:** delta in fitness score after each step

TensorFlow.js or an ONNX runtime can implement `AIAgent` directly. The headless batch runner and Cloudflare persistence are shared infrastructure.

---

## Parameter Exploration Workflow

Goal: answer balance questions quantitatively.

> *"What happens to win rates if we double the board size?"*
> *"Does reducing detection range make the outcome more or less decisive?"*

**ParamSweep definition:**
```typescript
interface ParamSweep {
  param: keyof ScenarioParams;
  values: number[];
  gamesPerValue: number;      // e.g. 20 games per data point
  agentId: string;            // both sides use this trained agent
}
```

**Execution:**
1. For each `value` in `values`, run `gamesPerValue` headless games with varied seeds
2. Both sides use the same trained agent (symmetric — any asymmetry is scenario-driven, not agent-driven)
3. Collect: win rate per side, average steps to first contact, average fuel remaining at end, tonnage exchange ratio
4. Output: `public/sweeps/{sweep-id}.json` → CSV for analysis

**Workflow evolves to asymmetric** once per-side specialization is warranted (e.g. IJN agent trained on carrier-centric doctrine vs Allied agent trained on attrition).

---

## Evolution of the Existing Japanese AI

The current `JapaneseAI` (scouts → strikes → re-arms, moves to close range) becomes:

```typescript
class RuleBasedAgent implements AIAgent {
  readonly side: Side;
  decideTurn(snapshot: GameSnapshot): EngineOrder[] { /* existing logic */ }
}
```

It is **not discarded** — it becomes the baseline benchmark:
- Human players compete against `RuleBasedAgent` until a trained agent is available
- Training fitness is measured against `RuleBasedAgent` performance as a floor
- A symmetric `RuleBasedAlliedAgent` is created for initial watch mode and balance testing

---

## Implementation Roadmap

| Sprint | Goal | Key Deliverable |
|---|---|---|
| **24** | SimParams extraction + headless runner | `ScenarioParams` type; `scripts/headless.ts` runner; `public/params.json` output |
| **25** | AIAgent interface + watch mode | `AIAgent` + `HumanAgent`; both sides wired; AI vs AI watchable in browser |
| **26** | Persistence layer | Cloudflare D1 schema; game log write on scenario end; replay driver in browser |
| **27** | Evolutionary trainer (both sides) | GA loop in `scripts/train.ts`; fitness function; `public/ai-weights.json` |
| **28** | Parameter sweep tooling | `ParamSweep` runner; JSON/CSV export; balance report for Midway |
| **29+** | NN-ready reward signal | Feature vector serializer; per-step reward delta; ONNX `AIAgent` stub |

---

## Open Questions (Deferred)

- Cloudflare D1 data model detail (table schema, indexes, query patterns)
- Feature vector encoding for neural network input (dimension, normalization)
- Multi-scenario support beyond Midway (Coral Sea, Philippine Sea) — not blocking Sprint 24–28
- Asymmetric AI specialization criteria — when does per-side training diverge?
