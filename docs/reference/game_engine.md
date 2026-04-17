# Karriers — Game Engine Reference

Software-development view of the simulation engine (`game/`). No Vue/Nuxt concepts here — this is pure TypeScript running headlessly.

> **Quick orientation** is in `AGENTS.md § Engine architecture`.
> This document is the authoritative detail reference.

---

## 0. ScenarioParams

**Files:** `game/types/scenario.ts`, `game/utils/scenarioState.ts`

All tuneable engine constants live in a flat, serialisable `ScenarioParams` object. This is the genome for the evolutionary trainer (Sprint 27). Pass any subset to `GameEngine` (and to `buildStateFromScenario`) to override defaults.

```typescript
import { GameEngine } from './game/engine/GameEngine'
import { buildStateFromScenario } from './game/utils/scenarioState'
import { MIDWAY } from './game/data/scenarios/midway'

const state = buildStateFromScenario(MIDWAY, { seed: 42, spawnMode: 'seeded' })
const engine = new GameEngine(state, MIDWAY.startTime, MIDWAY.endTime, {
  seed: 42,
  bombDamageMultiplier: 1.5,
  capEffectivenessMultiplier: 0.7,
  durationSteps: 96,
})
```

### ScenarioParams fields

| Field | Default | Category |
|---|---|---|
| `seed` | 0 | RNG — 0 = use `Date.now()` |
| `spawnMode` | `'fixed'` | Spawn — `'fixed'` / `'seeded'` / `'random'` |
| `durationSteps` | 0 | Duration — 0 = use scenario `endTime` |
| `shipFuelPerStepFull` | 0.5 | Ship fuel — % per step at full speed |
| `strikeFuelRate` | 2 | Aviation fuel — units/aircraft/hex |
| `capFuelRate` | 2 | Aviation fuel — units/aircraft/hex |
| `scoutFuelRate` | 1 | Aviation fuel — units/aircraft/hex |
| `searchFuelRate` | 1 | Aviation fuel — units/aircraft/hex |
| `escortFuelRate` | 1 | Aviation fuel — units/aircraft/hex |
| `aswFuelRate` | 1 | Aviation fuel — units/aircraft/hex |
| `fuelReserve` | 0.15 | Aviation fuel — minimum reserve fraction |
| `capOrbitRangeHexes` | 5 | CAP — fuel cost proxy distance |
| `capOrbitMinutes` | 90 | CAP — orbit duration before auto-return |
| `overcapHardLimit` | 1.2 | Deck — occupancy fraction above which aircraft ditch |
| `overcapPenaltyMinutes` | 60 | Deck — extra readyTime on over-capacity recovery |
| `capRearmMinutes` | 30 | Rearm — cap/intercept |
| `strikeRearmMinutes` | 60 | Rearm — strike/escort |
| `scoutRearmMinutes` | 30 | Rearm — scout/search/asw |
| `strikeRearmPenaltyMinutes` | 60 | Rearm — extra delay when carrier takes a hit |
| `bombDamageMultiplier` | 1.0 | Damage — dive/level bomb hull damage |
| `torpedoDamageMultiplier` | 1.0 | Damage — torpedo hull damage |
| `fireDamageMultiplier` | 1.0 | Damage — fires started on hit |
| `floodingMultiplier` | 1.0 | Damage — flooding risk on torpedo hit |
| `capEffectivenessMultiplier` | 1.0 | Combat — CAP shots per defender |
| `fireDamagePerStep` | 4 | Damage — hull HP lost per active fire per step |
| `fireSpreadChance` | 0.22 | Damage — probability a fire spreads each step |
| `floodDamageRate` | 0.08 | Damage — hull % lost per flooding risk per step |
| `detectionRangeMultiplier` | 1.0 | Search — effective detection range scalar |

### Spawn modes

| Mode | Behaviour |
|---|---|
| `'fixed'` | TG positions taken directly from the scenario definition |
| `'seeded'` | Deterministic ±10-hex random offset per TG using `params.seed` |
| `'random'` | Non-deterministic ±10-hex offset using `Date.now()` as seed |

### buildStateFromScenario

`buildStateFromScenario(scenario, params?)` in `game/utils/scenarioState.ts` is the single entry point for constructing `MutableGameState`. Both `useScenarioLoader` (browser) and `scripts/headless.ts` (Node.js CLI) call it, guaranteeing identical initial state.

### Headless runner

`scripts/headless.ts` runs a full game from the command line with no Vue or Nuxt:

```bash
pnpm headless                        # fixed seed 42, default params
pnpm headless -- --seed 99           # reproducible run with seed 99
pnpm headless -- --durationSteps 48  # cap at 48 steps (24 sim-hours)
```

---

## 1. Engine ↔ Vue Boundary

- `GameEngine` is a plain TypeScript class stored as `shallowRef<GameEngine>` in `stores/game.ts`
- Engine emits typed events via `TypedEventEmitter<EngineEvents>`
- Vue reads from `GameSnapshot` / `SidedSnapshot` — immutable copies emitted after each step via `StepComplete`
- Pinia stores subscribe in setup: `engine.events.on('StepComplete', syncFromSnapshot)`
- PixiJS never imports Vue; Vue never imports PixiJS — communicate via Pinia + DOM events
- `game/` must **never** import from `app/`, Vue, or Nuxt

---

## 2. Ticking System

### Wall clock → simulated time

The engine is driven by a `requestAnimationFrame` loop in `useGameLoop.ts`. Each frame passes the raw wall-clock delta (milliseconds) into `GameEngine.tick(wallClockDeltaMs)`, which forwards it to `TimeSystem`.

```
wall ms  ──×timeScale──▶  sim ms  ──accumulate──▶  steps
```

**Constants (`TimeSystem.ts`)**

| Constant | Value | Meaning |
|---|---|---|
| `STEP_MINUTES` | 30 | Each simulation step = 30 game-minutes |
| `MS_PER_SIM_MINUTE_AT_1X` | 100 | 1 real ms = 1/100th of a sim minute at 1× |

**Derived step periods**

| Scale | Real seconds per step |
|---|---|
| 1× | 3.0 s |
| 2× | 1.5 s |
| 4× | 0.75 s |
| 8× | 0.375 s |

### Accumulator

`TimeSystem` maintains `_accumMs`. Each tick:

```
_accumMs += wallClockDeltaMs × timeScale
while _accumMs >= stepMs:
    _accumMs -= stepMs
    advance currentTime by 30 minutes
    stepsCompleted++
```

If the scenario `endTime` is reached, `_isPaused` is set to `true` automatically.

### stepFraction

Between steps, `stepFraction = _accumMs / stepMs` (0→1). The renderer uses this to interpolate unit token positions and the HUD clock uses it to show a continuously advancing time display without waiting for the next step to fire.

### Pause semantics

`TimeSystem._isPaused` starts `true`. `resume()` is a no-op if `isExpired`. `togglePause()` calls either. The engine exposes `isPaused`, `pause()`, `resume()`, `togglePause()` as pass-throughs to `TimeSystem`.

---

## 3. Event Bus

`TypedEventEmitter<Events>` (`game/engine/EventEmitter.ts`) — a minimal typed pub/sub with no Vue or Node.js dependencies.

```typescript
on<K>(event: K, handler): Unsubscribe   // returns cleanup fn
off<K>(event: K, handler): void
emit<K>(event: K, data: Events[K]): void
clear(): void
```

### Engine events

| Event | Payload | When emitted |
|---|---|---|
| `StepComplete` | `GameSnapshot` | After every completed step; primary sync signal for all Pinia stores |
| `SightingDetected` | `SightingReport` | Once per sighting within a `StepComplete` batch |
| `ShipDamaged` | `CombatEvent` | When a ship takes a hit during combat resolution |
| `ShipSunk` | `{ shipId, taskGroupId, side, time }` | When a ship's status transitions to `'sunk'` |
| `StrikeInbound` | `{ flightPlanId, targetTaskGroupId, time }` | When an airborne strike reaches its target ETA |
| `EnemyStrikeDetected` | `{ flightPlanId, targetHex, estimatedArrivalTime }` | When a Japanese strike is launched — warns the Allied player |
| `ScoutContactRevealed` | `{ flightPlanId, targetHex, contactFound, side, time }` | When a scout mission resolves at its target hex |
| `ScenarioEnded` | `{ winner: Side \| 'draw', time, alliedPoints, japanesePoints }` | Once, when VictorySystem finds a decisive result; engine auto-pauses |

`ScenarioEnded` is guarded by a `scenarioEnded` boolean so it fires exactly once even if `runStep()` is called multiple times in the same tick.

### GameSnapshot

Immutable view of **full engine state** (both sides, ground truth) emitted with `StepComplete`. Pinia stores consume this and never touch `MutableGameState` directly.

```typescript
interface GameSnapshot {
  time: GameTime
  stepFraction: number
  taskGroups:       ReadonlyMap<string, TaskGroup>
  ships:            ReadonlyMap<string, Ship>
  squadrons:        ReadonlyMap<string, Squadron>
  flightPlans:      ReadonlyMap<string, FlightPlan>
  alliedContacts:   ReadonlyMap<string, ContactRecord>
  japaneseContacts: ReadonlyMap<string, ContactRecord>
  combatEvents:     CombatEvent[]
  gameEvents:       GameEvent[]
  sightingReports:  SightingReport[]
  movementPaths:    ReadonlyMap<string, readonly HexCoord[]>
  alliedFuelPool:   number     // current aviation fuel pool — for HUD gauges
  japaneseFuelPool: number
}
```

### SidedSnapshot

Fog-of-war-filtered observation for a single side. Used by `AIAgent.decideTurn()` and logged to NuxtHub D1.
AI agents and training pipelines must **never** receive `GameSnapshot` directly — only `SidedSnapshot`.

```typescript
// engine.getObservation(side: Side): SidedSnapshot
interface SidedSnapshot {
  side:           Side
  time:           GameTime
  stepFraction:   number
  ownTaskGroups:  ReadonlyMap<string, TaskGroup>     // own forces, full ground truth
  ownShips:       ReadonlyMap<string, Ship>
  ownSquadrons:   ReadonlyMap<string, Squadron>
  ownFlightPlans: ReadonlyMap<string, FlightPlan>
  enemyContacts:  ReadonlyMap<string, ContactRecord> // FOW-filtered: only what own scouts found
  combatEvents:   CombatEvent[]
  gameEvents:     GameEvent[]
  sightingReports: SightingReport[]
  alliedFuelPool:  number
  japaneseFuelPool: number
  // No enemy taskGroups — real positions never exposed
}
```

`getObservation('allied')` filters `buildSnapshot()` by side: own maps include only same-side entities; `enemyContacts` is the `alliedContacts` map (what Allied scouts have found), not the Japanese `taskGroups` map.

---

## 4. Step Sequence

`GameEngine.runStep()` executes these subsystems in order every 30 simulated minutes.
`TimeSystem.tick()` advances `currentTime` before `runStep()` is called; it is not a step inside `runStep()`.

```
1.   MovementSystem     reposition all task groups
1b.  Ship fuel          decrement fuelLevel per ship proportional to speed; sync TG fuelState
2.   SearchSystem       resolve sector searches → SightingReport[]
3.   FogOfWarSystem     decay old contacts; integrate new sightings
4.   AirOpsSystem       orbit expiry → position update → recoveries → spots → queued launches
4b.  Scout arrivals     resolve scout missions that reached their target hex → ContactRecord
5.   CombatSystem       resolve strikes whose ETA ≤ currentTime
6.   DamageSystem       fire spread, flooding, damage control per ship
7.   SurfaceCombatSystem trigger if opposing TGs share a hex
8.   VictorySystem      evaluate all victory conditions
9.   Fuel-exhaustion    grounded fleet check → opponent wins (or draw if both)
```

After all steps in the tick complete, the engine builds a `GameSnapshot`, emits `StepComplete`, then emits individual `SightingDetected` events, and clears `pendingCombatEvents` / `pendingGameEvents`.

---

## 5. Order System

Issued via `GameEngine.issueOrder(payload)`. Orders are applied immediately to `MutableGameState` (no queuing except for launch orders which go through `AirOpsSystem.queueLaunch`).

```typescript
set-order       // change TG's currentOrder + optional destination; resets movement path
set-speed       // change TG's speed (capped at ship class maxSpeed)
set-destination // set TG.destination; replans movement path
launch-strike   // queue launch of squadronIds toward targetHex
launch-cap      // queue CAP assignment for squadronIds
launch-search   // queue search mission for squadronIds in searchSector
launch-scout    // queue point-scout mission for squadronIds toward a specific targetHex
recall-mission  // force a FlightPlan to begin returning
```

### TaskGroupOrder values
`standby | patrol | search | strike | intercept | escort | refuel | retire`

`search` is the trigger for SearchSystem. `strike` is intent — actual launches require explicit `launch-strike` orders. `retire` causes the TG to pathfind toward the map edge.

---

## 6. Movement System

**File:** `game/engine/MovementSystem.ts`

### Speed → hexes per step

```
hexesPerStep = speedKnots × (30 / 60) / NM_PER_HEX
             = speedKnots × 0.5 / 20
```

| Speed | Hexes/step | NM/step |
|---|---|---|
| 15 kt | 0.375 | 7.5 NM |
| 20 kt | 0.5 | 10 NM |
| 25 kt | 0.625 | 12.5 NM |
| 30 kt | 0.75 | 15 NM |

### Accumulator pattern

Fractional hexes carry between steps. A TG moving at 20 kt advances 0.5 hex per step — it moves one hex every two steps.

```
hexAccumulator += hexesPerStep
while hexAccumulator >= 1.0:
    advance one hex along A* path
    hexAccumulator -= 1.0
```

### Pathfinding

Hex A* (`game/utils/pathfinding.ts`) with terrain awareness. Atoll/land hexes are impassable for surface units. Path is replanned automatically when `destination` changes or when `resetState(tgId)` is called (e.g. after issuing a new order).

### Arrival

When a TG reaches its `destination`, the destination is cleared and the order transitions to `'standby'` if no further instructions.

---

## 7. Search System

**File:** `game/engine/SearchSystem.ts`

Runs for every TG whose `currentOrder === 'search'`. Selects the best scout aircraft by effective range, then for each enemy TG computes a detection probability:

```
P = distFactor × visFactor × experienceModifier   (max 0.85)
```

- **distFactor** — falls off with hex distance from searching TG
- **visFactor** — weather zone visibility modifier
- **experienceModifier** — scales with pilot experience

### Experience modifiers

| Experience | False report % | Contact type accuracy |
|---|---|---|
| ace | 3% | 97% |
| veteran | 8% | ~75% |
| trained | 18% | ~55% |
| green | 28% | 40% |

False reports are placed at a random hex within radius 4 of the true position.
Speed/course estimates carry experience-scaled noise.

### Output

Each detection produces a `SightingReport` stored in `lastStepSightings`. False reports are flagged `isFalseReport: true` and are never corrected by later steps.

---

## 8. Fog of War System

**File:** `game/engine/FogOfWarSystem.ts`

Maintains `ContactRecord` maps per side (allied contacts, japanese contacts).

### Per-step processing
1. **Decay** — contacts not updated in >4 simulated hours → `isActive = false`
2. **Integrate** — new `SightingReport[]` from SearchSystem are matched to existing contacts by hex proximity or confirmed TG ID; unmatched reports create new contact records

### Visibility
```typescript
isVisible(taskGroupId, forSide): boolean
```
- Own forces → always `true`
- Enemy → `true` only if there is an `isActive` contact with `confirmedTaskGroupId === taskGroupId`

`getActiveContacts(side)` returns contacts sorted most-recent first. This method is used by `engine.getObservation(side)` to build `SidedSnapshot`.

### Contact types
Enemy TGs appear as one of: `'carrier-force' | 'battleship-force' | 'surface-force' | 'submarine' | 'transport-convoy' | 'unknown-warships' | 'unknown'`. The reported type may differ from reality based on pilot experience.

---

## 9. Air Operations System

**File:** `game/engine/AirOpsSystem.ts`

Manages the carrier deck cycle and flight plan lifecycle.

### Deck status transitions
```
hangared → spotted (SPOT_STEPS=1) → airborne → recovering (RECOVERY_STEPS=1) → rearming → hangared
```

### Hardcoded constants
| Constant | Value | Meaning |
|---|---|---|
| `SPOT_STEPS` | 1 | Steps to spot aircraft before launch |
| `RECOVERY_STEPS` | 1 | Steps to recover after landing |

### ScenarioParams-driven values (Sprint 24+)
All other AirOps constants are now tuneable via `ScenarioParams` (see §0). Default values match the previously hardcoded originals.

| ScenarioParams field | Default | Meaning |
|---|---|---|
| `fuelReserve` | 0.15 | Minimum fuel fraction; launches beyond range are rejected |
| `capOrbitRangeHexes` | 5 | Virtual range (hexes) used to compute fuel cost for CAP (no fixed destination) |
| `overcapHardLimit` | 1.2 | Deck occupancy fraction above which recovering aircraft ditch |
| `overcapPenaltyMinutes` | 60 | Extra readyTime added when recovering to an over-capacity deck |
| `strikeRearmPenaltyMinutes` | 60 | Extra readyTime added to recovering squadrons when their carrier takes a strike hit |
| `capOrbitMinutes` | 90 | CAP orbit duration before auto-return |
| `capRearmMinutes` | 30 | Rearm time for cap/intercept missions |
| `strikeRearmMinutes` | 60 | Rearm time for strike/escort missions |
| `scoutRearmMinutes` | 30 | Rearm time for scout/search/asw missions |
| `capFuelRate` | 2 | Fuel units per aircraft per hex (cap/strike/intercept) |
| `strikeFuelRate` | 2 | Fuel units per aircraft per hex (strike) |
| `scoutFuelRate` | 1 | Fuel units per aircraft per hex (scout/search/escort/asw) |

### Aviation fuel cost
Each launch deducts `aircraftCount × hexesTravelled × fuelRate` from the side's fuel pool. CAP uses `capOrbitRangeHexes` as its distance proxy. Launches are rejected when `fuelPool ≤ 0`.

### Per-mission rearm times
After recovery, a squadron's `readyTime` is gated by the mission-specific rearm param. A strike hit on the carrier extends all recovering squadrons' `readyTime` by `strikeRearmPenaltyMinutes`.

| Mission | ScenarioParams field | Default |
|---|---|---|
| cap, intercept | `capRearmMinutes` | 30 min |
| strike, escort | `strikeRearmMinutes` | 60 min |
| scout, search, asw | `scoutRearmMinutes` | 30 min |

### processStep() sub-steps
Each call to `processStep()` runs these stages in order:
1. **Orbit expiry** — CAP and search plans with `eta ≤ currentTime` transition to `'returning'`
2. **Live position update** — airborne plans chase their target TG (via active contact) and lerp `currentHex`; returning plans re-anchor `returnEta` to the carrier's current position
3. **Recoveries** — plans whose `returnEta` has passed land squadrons and set `readyTime`
4. **Spot advance** — spotted squadrons advance to `'airborne'`
5. **Launch queue** — pending `LaunchOrder`s are executed; new `FlightPlan`s returned

### Launch queue
Orders arrive via `queueLaunch(LaunchOrder)` (called by `GameEngine.issueOrder` for `launch-strike`, `launch-cap`, `launch-search`, `launch-scout`). Each step, `processStep()` attempts to process queued launches:
- Computes ETA and returnETA from hex distance + aircraft speed
- Creates a `FlightPlan` with status `'planned'` → `'airborne'` once squadrons are spotted
- Stores `launchHex`, `currentHex`, `currentHexTime`, and `targetTaskGroupId` for live tracking
- Squadrons with insufficient fuel for the round trip (plus reserve) are rejected

### Scout missions
Scout plans (`mission === 'scout'`) fly to a specific `targetHex`. When `eta` is reached, `processScoutArrivals()` transitions the plan to `'returning'` and `GameEngine` calls `resolveScoutMission()` to check for enemy TGs within 3 hexes of `targetHex`. A `ContactRecord` is created or updated in the owning side's contacts map, and a `ScoutContactRevealed` event is emitted.

### Recall
`recallMission(flightPlanId, flightPlans, currentTime)` forces returning squadrons early; they arrive at `currentTime + travelTime` with reduced fuel.

### Strike rearm penalty
`applyStrikeRearmPenalty(carrierShipId, ...)` is called by `GameEngine` for every ship hit during a strike resolution. If the hit ship is a carrier, all `'recovering'` squadrons in that carrier's TG have their `readyTime` extended by `STRIKE_REARM_PENALTY_MINUTES`.

---

## 10. Combat System

**File:** `game/engine/CombatSystem.ts`

Resolves air strikes whose `ETA ≤ currentTime`.

### Target resolution
At strike resolution time the engine first looks up the TG by `plan.targetTaskGroupId` (set at launch time via `resolveTargetTG`). This allows the strike to chase a moving target. If the TG has moved off the original launch hex the strike hits it at its current position. If no `targetTaskGroupId` is set (e.g. land targets), it falls back to a hex-based lookup. On resolution `plan.targetHex` is snapped to the TG's actual position so the return flight arc originates from the correct point.

### Strike resolution pipeline

```
1. CAP intercept
2. Flak (AA fire)
3. Hit scoring
```

**CAP intercept**
- Quality-weighted air combat between attacking squadrons and defending CAP
- Attack penetrates if surviving attackers > 30% of initial defenders

**Flak**
```
losses = ceil(aircraftCount × aaStrength / 400)
```

**Hit scoring by weapon type**

| Weapon | Hull damage | Fire | Flooding |
|---|---|---|---|
| Torpedo | 18 hp | 0 | +20 risk |
| Dive bomb | 12 hp | +1 | 0 |
| Level bomb | 8 hp | 0 | 0 |

Carriers are prioritised as targets within a TG. `emitShipSunk()` fires a `ShipSunk` engine event and pushes a `CombatEvent` when a ship reaches `hullDamage ≥ maxHP`.

---

## 11. Damage System

**File:** `game/engine/DamageSystem.ts`

Applied every step to every ship, independent of combat.

| Mechanic | Rate |
|---|---|
| Fire spread chance | 22% per fire per step |
| Damage control (fire suppression) | `dcRate × 0.55` per step |
| Hull damage from fire | 4 hp per active fire per step |
| Flooding hull damage | `8% × floodingRisk` per step |
| Kido Butai spotted-deck multiplier | fires ×2.5 when enemy aircraft are on deck |

`applyStrikeHits(ship, hits[])` applies `HitResult` arrays from CombatSystem and triggers the Kido Butai multiplier when relevant.

---

## 12. Surface Combat System

**File:** `game/engine/SurfaceCombatSystem.ts`

Triggered automatically when an allied and a Japanese TG occupy the same hex after movement.

- Up to **4 rounds** per step
- **8% hit chance** per round per participating ship
- Armor mitigation applied to each hit
- Carriers have **90% probability** to auto-retreat rather than engage
- TG with combat strength ratio `< 40%` of opponent disengages

---

## 13. Victory System

**File:** `game/engine/VictorySystem.ts`

Evaluated every step. Checks all `VictoryCondition[]` from the scenario.

### Condition types

| Type | Description |
|---|---|
| `sink-carrier` | Specified carrier class sunk |
| `sink-ship-class` | Any ship of given class sunk |
| `control-hex` | TG of specified side occupies a hex (e.g. Midway) |
| `survive-until` | Force survives until deadline |
| `sink-total-tonnage` | Cumulative tonnage sunk exceeds threshold |

### Winner determination
1. Sweep all conditions — first side to satisfy all its conditions wins immediately
2. If `currentTime ≥ endTime`, winner is the side with higher accumulated points

### Fuel-exhaustion victory (`GameEngine.runStep` step 9)

Evaluated after the VictorySystem check, before emitting `StepComplete`. Only applies when fuel pools are finite (i.e. not `Infinity`).

| Condition | Result |
|---|---|
| Allied fuel ≤ 0, Japanese fuel > 0 | Japanese wins (Allied fleet grounded) |
| Japanese fuel ≤ 0, Allied fuel > 0 | Allied wins (Japanese fleet grounded) |
| Both fuel ≤ 0 simultaneously | Draw |

A grounded fleet cannot launch any further aircraft (`AirOpsSystem` rejects launches when `fuelPool ≤ 0`), so the side that still has fuel wins by default.

---

## 14. RNG

**File:** `game/utils/dice.ts` — Mulberry32 seeded PRNG.

```typescript
createRng(seed: number): Rng     // seed defaults to Date.now()
rollD100(rng): number            // 1–100
chance(rng, pct): boolean        // true with probability pct/100
```

The engine seed is supplied via `ScenarioParams.seed`. When `seed > 0`, `GameEngine` uses it for deterministic replays; when `seed === 0` (default), it falls back to `Date.now()`. The same seed field is used by `buildStateFromScenario` for `spawnMode: 'seeded'` position offsets.

Zero `Math.random()` calls exist anywhere in `game/` — all randomness flows through this RNG.

---

## 15. Renderer (app layer)

These are Vue/PixiJS concerns — not part of the headless engine, documented here for cross-layer reference.

### PixiJS layer stack (bottom → top)
`TerrainLayer` → `GridLayer` → `FogLayer` → `ContactLayer` → `UnitLayer` → `FlightPathLayer` → `SelectionLayer` → `UIAnnotationLayer`

### Hex grid
- 72 × 84, flat-top orientation, `hexSize = 40` px (circumradius)
- Horizontal pitch between centers: 60 px; vertical pitch: ≈ 69.3 px
- `@game` alias points to `game/` directory (Vite + Nuxt alias)
- `honeycomb-grid` Grid singleton initialised once via `useHexMap()`

### Coordinate transform (Pixi ↔ geographic)
Needed for MapLibre sync:
- Anchor: Midway Atoll hex `(35, 55)` ↔ `(28.21°N, 177.37°W)`
- Scale: 20 NM/hex; 1 NM ≈ 1/60° latitude
- `hexToLatLon(coord)`: compute NM offset from anchor → lat/lon delta accounting for `cos(lat)` for longitude

---

## 16. Feature Vector

**File:** `game/utils/featureVector.ts`

Converts a `SidedSnapshot` into a fixed-size `Float32Array` for ML use. The schema is **frozen** — changing it invalidates stored training data.

```typescript
import { toFeatureVector, FEATURE_VECTOR_SIZE } from '@game/utils/featureVector'

const vec = toFeatureVector(engine.getObservation('allied'), 'allied')
// vec.length === FEATURE_VECTOR_SIZE === 264
```

### Layout (264 floats total)

| Segment | Slots | Features | Total | Contents |
|---|---|---|---|---|
| Own task groups | 4 | 8 | 32 | active, q, r, speed, fuelState, shipCount, order, carrier-proxy |
| Enemy contacts | 8 | 6 | 48 | active, q, r, contactType, ageMinutes, estimatedCourse |
| Own squadrons | 16 | 8 | 128 | present, aircraftCount, fuelLoad, deckStatus, missionType, experience, role, isAirborne |
| Own flight plans | 8 | 6 | 48 | active, targetQ, targetR, mission, status, elapsed fraction |
| Scalar globals | — | 8 | 8 | alliedFuelPct, japaneseFuelPct, ownFuelPct, enemyFuelPct, combatEventCount, sightingCount, planCount, reserved |

All values are clamped to `[0, 1]`. Empty slots (fewer than max entities) are zero-padded. Sparse sequences are front-packed — the first present entity always occupies slot 0.

---

## 17. NuxtHub D1 Persistence

**Files:** `server/database/schema.ts`, `server/utils/drizzle.ts`, `server/api/games/index.post.ts`, `server/plugins/database.ts`

Every completed game is logged to a NuxtHub D1 (SQLite) database. Data is logged via the `useGameLogger` composable, which accumulates `SidedSnapshot`s per step and POSTs them to `/api/games` on `ScenarioEnded`.

### Schema

```
games
  id             TEXT PRIMARY KEY
  scenario_id    TEXT
  params_json    TEXT        -- serialised ScenarioParams
  allied_agent   TEXT        -- 'human' | 'rule-based' | 'evolutionary' | …
  japanese_agent TEXT
  winner         TEXT        -- 'allied' | 'japanese' | 'draw'
  duration_steps INTEGER
  allied_points  INTEGER
  japanese_points INTEGER
  created_at     INTEGER     -- Unix ms

steps
  id                     INTEGER PRIMARY KEY AUTOINCREMENT
  game_id                TEXT → games.id
  step_number            INTEGER
  allied_snapshot_json   TEXT   -- serialised SidedSnapshot (not ground truth)
  japanese_snapshot_json TEXT
```

`snapshot_json` stores the per-side observations, never the raw `GameSnapshot` ground truth, so stored data matches what AI agents see.

### Local dev

`@nuxthub/core` emulates D1 with SQLite in-process. No Docker required. Tables are created via `server/plugins/database.ts` on Nitro startup using `CREATE TABLE IF NOT EXISTS`.

Drizzle ORM is used for type-safe inserts via `server/utils/drizzle.ts`:

```typescript
export function useDrizzle() {
  return drizzle(hubDatabase(), { schema })
}
```

---

## 18. Key Data Relationships

```
Scenario
  └── ScenarioForce[]
        └── TaskGroup[]
              ├── Ship[]        (shipIds → Ship map)
              └── Squadron[]    (taskGroupId back-reference)
                    └── FlightPlan (currentMission, optional)

ContactRecord  (per side)
  └── sightingIds[] → SightingReport[]

VictoryCondition[]  (evaluated each step by VictorySystem)
```

All Maps are keyed by string ID. `coordKey(hex)` produces stable `"q,r"` string keys for hex-indexed Maps.
