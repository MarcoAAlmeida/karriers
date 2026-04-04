# Karriers — Game Engine Mechanics Reference

Software-development view of the simulation engine (`game/`). No Vue/Nuxt concepts here — this is pure TypeScript running headlessly.

---

## 1. Ticking System

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

## 2. Event Bus

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
| `ScenarioEnded` | `{ winner: Side \| 'draw', time }` | Once, when VictorySystem finds a decisive result; engine auto-pauses |

`ScenarioEnded` is guarded by a `scenarioEnded` boolean so it fires exactly once even if `runStep()` is called multiple times in the same tick.

### GameSnapshot

Immutable view of engine state emitted with `StepComplete`. Pinia stores consume this and never touch `MutableGameState` directly.

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
}
```

---

## 3. Step Sequence

`GameEngine.runStep()` executes these subsystems in order every 30 simulated minutes:

```
1. TimeSystem        advance currentTime by 30 min
2. MovementSystem    reposition all task groups
3. SearchSystem      resolve sector searches → SightingReport[]
4. AirOpsSystem      process deck cycles; process pending launches
5. FogOfWarSystem    decay old contacts; integrate new sightings
6. CombatSystem      resolve strikes whose ETA ≤ currentTime
7. DamageSystem      fire spread, flooding, damage control per ship
8. SurfaceCombatSystem  trigger if opposing TGs share a hex
9. VictorySystem     evaluate all victory conditions
```

After all steps in the tick complete, the engine builds a `GameSnapshot`, emits `StepComplete`, then emits individual `SightingDetected` events, and clears `pendingCombatEvents` / `pendingGameEvents`.

---

## 4. Movement System

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

## 5. Search System

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

## 6. Fog of War System

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

`getActiveContacts(side)` returns contacts sorted most-recent first.

### Contact types
Enemy TGs appear as one of: `'carrier-force' | 'battleship-force' | 'surface-force' | 'submarine' | 'transport-convoy' | 'unknown-warships' | 'unknown'`. The reported type may differ from reality based on pilot experience.

---

## 7. Air Operations System

**File:** `game/engine/AirOpsSystem.ts`

Manages the carrier deck cycle and flight plan lifecycle.

### Deck status transitions
```
hangared → spotted (SPOT_STEPS=1) → airborne → recovering (RECOVERY_STEPS=1) → rearming → hangared
```

### Constants
| Constant | Value | Meaning |
|---|---|---|
| `SPOT_STEPS` | 1 | Steps to spot aircraft before launch |
| `RECOVERY_STEPS` | 1 | Steps to recover after landing |
| `FUEL_RESERVE` | 0.15 | Minimum fuel fraction; launches beyond range are rejected |

### Launch queue
Orders arrive via `queueLaunch(LaunchOrder)` (called by `GameEngine.issueOrder` for `launch-strike`, `launch-cap`, `launch-search`). Each step, `processStep()` attempts to process queued launches:
- Computes ETA and returnETA from hex distance + aircraft speed
- Creates a `FlightPlan` with status `'planned'` → `'airborne'` once squadrons are spotted
- Squadrons with insufficient fuel for the round trip (plus reserve) are rejected

### Recall
`recallMission(flightPlanId, flightPlans, currentTime)` forces returning squadrons early; they arrive at `currentTime + travelTime` with reduced fuel.

---

## 8. Combat System

**File:** `game/engine/CombatSystem.ts`

Resolves air strikes whose `ETA ≤ currentTime`.

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

## 9. Damage System

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

## 10. Surface Combat System

**File:** `game/engine/SurfaceCombatSystem.ts`

Triggered automatically when an allied and a Japanese TG occupy the same hex after movement.

- Up to **4 rounds** per step
- **8% hit chance** per round per participating ship
- Armor mitigation applied to each hit
- Carriers have **90% probability** to auto-retreat rather than engage
- TG with combat strength ratio `< 40%` of opponent disengages

---

## 11. Victory System

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

---

## 12. Order System

Issued via `GameEngine.issueOrder(payload)`. Orders are applied immediately to `MutableGameState` (no queuing except for launch orders which go through `AirOpsSystem.queueLaunch`).

```typescript
set-order       // change TG's currentOrder + optional destination; resets movement path
set-speed       // change TG's speed (capped at ship class maxSpeed)
set-destination // set TG.destination; replans movement path
launch-strike   // queue launch of squadronIds toward targetHex
launch-cap      // queue CAP assignment for squadronIds
launch-search   // queue search mission for squadronIds in searchSector
recall-mission  // force a FlightPlan to begin returning
```

### TaskGroupOrder values
`standby | patrol | search | strike | intercept | escort | refuel | retire`

`search` is the trigger for SearchSystem. `strike` is intent — actual launches require explicit `launch-strike` orders. `retire` causes the TG to pathfind toward the map edge.

---

## 13. RNG

**File:** `game/utils/dice.ts` — Mulberry32 seeded PRNG.

```typescript
createRng(seed: number): Rng     // seed defaults to Date.now()
rollD100(rng): number            // 1–100
chance(rng, pct): boolean        // true with probability pct/100
```

The engine constructor accepts an optional `seed` parameter for deterministic replays.

---

## 14. Key Data Relationships

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
