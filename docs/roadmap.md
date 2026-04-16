# Karriers — Upcoming Work

Architecture reference, folder structure, engine internals, and order types live in `AGENTS.md`.
Completed sprint history lives in `docs/done/sprints.md`.

---

## Current State (end of Sprint 23)

- ✅ Full engine: movement, search, fog of war, air ops, combat, damage, victory
- ✅ PixiJS renderer: hex grid, unit tokens, animated strike dots (outbound + return), flight path arcs always originating from the strike group's live in-flight position, sunk-ship markers (red ✕ diamond), FOW contacts at lastKnownHex, selection ring
- ✅ HUD: time controls, task group panel, order modal, air ops modal (Select All), keyboard shortcuts, command palette, toasts
- ✅ Scenario: Battle of Midway (4 TFs, 35 ships, 25 squadrons, 4 victory conditions)
- ✅ Sunk markers: permanent red ✕ diamond drawn at the hex where each ship went down
- ✅ Scenario end screen: winner label, Allied/Japanese points, result line, Return to Menu
- ✅ `window.__GAME_STATE__` + `window.__GAME_ACTIONS__` dev bridge
- ✅ Game shell: TopStatusBar, NavSidebar (collapsible), EngagementEventsPanel (collapsible); sea-blue palette
- ✅ Modal pause UX: all player-input modals (AirOps, Order, command palette, StrikeDetailModal) auto-pause the simulation on open and resume on close
- ✅ `strike-launched` engine events: flow through combatLog into the events panel
- ✅ Strike event log: EngagementEventsPanel shows launches, resolutions, hits, sightings — clickable strike entries
- ✅ Per-strike detail popup: StrikeDetailModal shows squadron, carrier, target, times, aircraft losses, hit breakdown, narrative
- ✅ Japanese AI: launches scouts, then strikes; re-arms between waves; moves to close range
- ✅ CAP missions: fighter orbit, intercept resolution, AI assigns CAP on inbound strikes, orbit rings rendered
- ✅ Scout missions: player and AI send scouts; contacts fed into fog-of-war; scout triangles on map
- ✅ Clickable in-flight squadrons: click any moving dot to open strike detail; disambiguation for overlapping dots
- ✅ Range rings: search and strike range drawn around selected task groups; color-coded by side
- ✅ Damage consequences: carrier-sunk gates launches; deck squadrons destroyed on sink; airborne squadrons reroute or ditch; over-capacity deck penalties; `aircraftCount` attrition disbands squadrons; one-way strikes
- ✅ Side fuel pool: `alliedFuelPool` / `japaneseFuelPool` in `MutableGameState`; initialised from JSON scenario; `oiler` ship type with `fuelPayload`; pool decrements on launch and oiler sinking; fuel-exhaustion gates launches; both-sides-zero ends game
- ✅ CAP endurance: 90-min orbit timer fires automatically; per-mission rearm cycle (30–60 min) gates next launch; strike hits on carrier extend recovering-squadron downtime; `Ship.fuelLevel` / `TaskGroup.fuelState` decrement each step proportional to speed
- ✅ Dynamic strike targeting: `targetHex` chases moving TG via live contacts (or holds last known hex under FOW); `currentHex` lerped each step for smooth arc origin; `returnEta` re-anchored to carrier's current position on each return-leg step; bezier arcs redraw from in-flight position
- ✅ Fuel gauge HUD: `TopStatusBar` shows US (blue) and IJN (red) fuel bars via `<GameFuelGauges />`; amber warning pulse at ≤ 20%; GROUNDED label at zero; hidden in menu; `alliedFuelPct`/`japaneseFuelPct` exposed in `__GAME_STATE__`
- ✅ Vitest: 131 tests across 13 files — all green in < 1 s
- ✅ Playwright E2E: 25/25 tests passing; `pnpm test:e2e` fully self-contained
- ❌ Scramble alert (incoming strike warning + one-click CAP launch for player)
- ❌ MapTiler basemap
- ❌ Custom sprite art for unit tokens

---

## Design Principles

**Prioritize complete gameplay over cosmetics.** A fully playable experience with colored dots is preferable to an incomplete experience with artwork and real map tiles. Cosmetic sprints (basemap, custom tokens) are deferred until the core gameplay loop — including enemy AI, CAP, scouting, and event feedback — is solid.

**Each sprint must be independently testable.** When a sprint ends, `pnpm test` and `pnpm test:e2e` must pass in full. Every new behaviour introduced in the sprint must have at least one Vitest unit test covering the happy path and one covering the primary failure/edge case. Playwright E2E tests cover any new UI surface. A sprint is not done until its tests are green on a clean checkout with no manual setup.

---

# Upcoming Sprints

> **Chosen path: B — NuxtHub persistence from the start.**
> Full rationale in `docs/vision/sprint-paths.md`.
> AI/ML API design decisions in `docs/vision/ai.md` and `docs/vision/ml-api-assessment.md`.

---

## Sprint 24 — ScenarioParams + Headless Runner

**Goal:** Parameterise the engine and run it without a renderer. Foundation for all training work.

- Extract hardcoded constants into `ScenarioParams` (`game/types/scenario.ts`): fuel rates, damage multipliers, CAP effectiveness, detection range, board size, spawn mode, RNG seed, duration steps.
- All engine subsystems read from `ScenarioParams` instead of local magic numbers.
- `scripts/headless.ts`: instantiate `GameEngine` with a fixed seed, step to `ScenarioEnded`, print result — no Vue, no Nuxt, runs via `npx tsx`.
- `spawnMode: 'fixed' | 'random' | 'seeded'` — `seeded` produces reproducible random starting positions for fair training comparisons.
- **Tests:** Headless runner completes a full Midway game without throwing; `ScenarioParams` overrides are applied correctly (e.g. 2× fuel consumption changes game length); seeded random spawn produces identical positions on repeated runs.

---

## Sprint 25 — NuxtHub Persistence + FOW-Filtered Snapshot

**Goal:** Log every completed game to NuxtHub D1. Fix the one engine gap that would poison training data.

*See `docs/vision/ml-api-assessment.md` for full analysis. The FOW fix is blocking — all logged data depends on it.*

- **`engine.getObservation(side: Side): SidedSnapshot`** — filters `getSnapshot()` through `FogOfWarSystem.getActiveContacts(side)` so each side sees only what its own scouts have found. `SidedSnapshot` replaces `GameSnapshot` as the type passed to AI agents and logged to the database.
- **NuxtHub D1 schema** (Drizzle ORM, `server/database/schema.ts`):
  - `games`: id, scenario, params\_json, allied\_agent, japanese\_agent, winner, duration\_steps, created\_at
  - `steps`: game\_id, step\_number, snapshot\_json (per-side, not ground truth), orders\_json
- **`game/utils/featureVector.ts`** — `toFeatureVector(obs: SidedSnapshot, side: Side): Float32Array` with fixed-size slots (4 TGs, 8 contacts, 16 squadrons, 8 flight plans, scalar globals). Schema frozen here — changing it later invalidates stored data.
- NuxtHub local dev emulates D1 with SQLite in-process; no Docker required. Reference: https://hub.nuxt.com/llms.txt
- On `ScenarioEnded`: write game record + full step log to D1 via `hubDatabase()`.
- **Tests:** Game log written after headless run; `getObservation('allied')` never exposes Japanese task group positions not present in allied contacts; feature vector has correct fixed length; NuxtHub schema migrates cleanly.

---

## Sprint 26 — AIAgent Interface + AI vs AI Watch Mode

**Goal:** Formalise the agent contract. Both sides get AI. Human play and watch mode run through the same interface.

- **`game/ai/AIAgent.ts`**: `interface AIAgent { side: Side; decideTurn(obs: SidedSnapshot): EngineOrder[]; }`
- **`HumanAgent`**: implements `AIAgent`; returns orders from the UI input queue. From the engine's perspective, human and AI are identical.
- **`RuleBasedAlliedAgent`**: symmetric counterpart to the existing `JapaneseAI` (renamed `RuleBasedJapaneseAgent`). Both implement `AIAgent`.
- **Watch mode** in the browser: new simulation mode where both agents are AI-controlled; player observes at any time scale; game still logs to D1.
- Engine step loop calls `agent.decideTurn(engine.getObservation(side))` for each side before processing orders.
- All games (human vs AI, AI vs AI watch) logged automatically via Sprint 25 infrastructure.
- **Tests:** Watch mode completes a full game; `HumanAgent` with an empty queue issues no orders; both agents receive only their side's observation; logged snapshot is `SidedSnapshot` not ground truth.

---

## Sprint 27 — Evolutionary Trainer (Both Sides)

**Goal:** Co-evolve Allied and Japanese policies through self-play. Produce trained weight JSON for in-game use.

- **`scripts/train.ts`**: GA loop — generate population, run K headless games per genome (seeded), score fitness, select + crossover + mutate, repeat for G generations.
- **Fitness function**: `w_V × victoryPointDelta + w_TR × tonnageRatio − w_S × durationSteps − w_E × exploitPenalty`
  - Exploit penalties: carrier entering surface combat range; single-aircraft scout spam; one-way strikes (fuel suicide).
- Both sides trained symmetrically first — any win-rate asymmetry reflects scenario balance, not agent asymmetry.
- Weights stored to NuxtHub R2 via `hubBlob()`: `weights/allied-{generation}.json`, `weights/japanese-{generation}.json`.
- `public/ai-weights.json` updated with the top-scoring genome; loaded by in-game agents at startup.
- **Tests:** Training loop runs 3 generations of population-5 without throwing; fitness scores are deterministic given the same seed; weight JSON is valid and loadable by the agent.

---

## Sprint 28 — Browser Replay

**Goal:** Load any stored game from D1 and replay it in the existing PixiJS UI.

- **`ReplayDriver`**: reads step log from D1, feeds each `SidedSnapshot` into Pinia stores on a timer — same path as the live `StepComplete` event.
- Replay controls: pause/resume/speed (reuses `TimeControls.vue`); scrub to any step.
- New UI entry point: "Replay" section in the scenario select screen showing recent stored games with metadata (scenario, agents, winner, date).
- Export: `GET /api/games/{id}/export` → NDJSON stream of `{step, snapshot, orders}` for Python/notebook consumers.
- **Tests:** Replay driver produces identical visual state to a live run with the same seed; export endpoint returns valid NDJSON; scrubbing to step N produces correct snapshot state.

---

## Sprint 29 — Parameter Sweep Tooling + RewardShaper

**Goal:** Complete all ML infrastructure before cosmetics. Two deliverables: balance sweep tooling and the per-step reward signal needed for future NN training.

### Parameter Sweep Tooling
- **`scripts/sweep.ts`**: define a `ParamSweep` (param key, value range, games per value); run all combinations headless; both sides use the same trained agent from Sprint 27.
- Aggregate per value: win rate per side, average steps to first contact, average fuel remaining at end, tonnage exchange ratio.
- Output: `public/sweeps/{sweep-id}.json` and CSV for analysis.
- Example sweep: `detectionRangeMultiplier` in `[0.5, 0.75, 1.0, 1.25, 1.5]` × 20 games each = 100 simulations, answers "does longer detection range change who wins?"

### RewardShaper
Evolutionary training (Sprint 27) only needs end-of-game fitness. NN training needs dense per-step rewards. Building `RewardShaper` now — before cosmetics — keeps all ML infrastructure in one phase and avoids revisiting engine-adjacent code after visual work begins.

- **`game/ai/RewardShaper.ts`**: wraps `StepComplete` events into a per-step reward delta per side.

| Engine event | Reward signal |
|---|---|
| `ShipDamaged` | +damage dealt to enemy, −damage taken (proportional to hull %) |
| `ShipSunk` | +large bonus (enemy) / −large penalty (own), weighted by ship tonnage |
| `SightingDetected` | +small bonus for first sighting of a new contact (information value) |
| `StrikeInbound` | −small penalty (enemy strike reached our carrier airspace) |
| Step with no sightings | −tiny penalty (encourages active scouting over hiding) |

- `RewardShaper` is a pure function over `(prevObs: SidedSnapshot, currentObs: SidedSnapshot, events: EngineEvent[]) => number` — no engine changes required.
- Not wired into the live game; used only by training scripts and headless runners.

- **Tests:** Sweep completes with 2 values × 2 games; output JSON has correct structure; varying `detectionRangeMultiplier` produces measurably different first-contact step counts. `RewardShaper` returns positive reward on enemy ship damage and negative on own ship damage; reward is zero for a no-event step.

---

# Cosmetic Sprints (deferred — begin after Sprint 29)

## Sprint A — MapTiler Basemap Integration

- Fully implement `useMapLibre.ts` to render MapLibre GL with MapTiler Ocean tiles under the PixiJS canvas.
- Make PixiJS ocean layer transparent ("see-through").
- Sync viewport: wheel/drag/zoom pans both Pixi and MapLibre; anchor, scale, and lat/lon correspondence at hex `(35, 55)` ↔ `(28.21°N, 177.37°W)`.
- Fallback: PixiJS grid+terrain rendering if no MapTiler key is configured.
- Continue rendering tactical overlays: hex grid lines, flight path arcs, selection ring, unit tokens, fog of war markers.

---

## Sprint B — Custom Unit Tokens (Visual Identity v1)

**Goal:** Use the `public/assets/game/` art set for unit tokens with faction badges.

- Replace procedural squares/circles with PixiJS Sprites; shared base art per type, faction badge distinguishes sides.
- Asset naming: `fleet-carrier/fleet-carrier.png` etc. Missing: `light-carrier`, `escort-carrier`, `transport`, `oiler`.
- Status overlays: `?` for contacts, damage/fuel badges, side indicators.

---

## Sprint C — Visual Polish

- Hover/selection glow on task group tokens.
- Performance profiling (unit/overlay layers with many tokens).
- Artist handoff guide: update assets without code changes.

---

# Long-Horizon Research (Sprint 30+)

## Neural Network Agent

All prerequisites are in place by Sprint 29:
- Fixed-size feature vectors (`featureVector.ts`, Sprint 25)
- Stored training episodes with per-side observations (Sprint 25–26)
- `AIAgent` interface and headless runner (Sprint 26)
- `RewardShaper` for dense per-step reward (Sprint 29)
- Training data NDJSON export (Sprint 28)

Remaining work:
- Agent implements `AIAgent` using TensorFlow.js or ONNX runtime; same `decideTurn(obs)` contract as rule-based and evolutionary agents.
- Imitation learning bootstrap: pre-train on stored human vs AI game logs before RL fine-tuning.
- RL fine-tuning: policy-gradient or actor-critic using `RewardShaper` dense rewards.
- Asymmetric per-side specialisation (IJN carrier-centric doctrine vs Allied attrition) introduced once symmetric baseline is proven.
