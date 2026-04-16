# Week 2 Backlog

---

## Item 1 — JSON Scenario Files

**Goal:** Move scenario data out of TypeScript modules and into plain JSON files under `public/`.
Edit a file, refresh the browser — no rebuild. New scenarios or unit tweaks require zero code changes.

---

### Why

Scenarios are currently hardcoded in `game/data/scenarios/midway.ts`. Adding a ship, adjusting
a squadron count, or bootstrapping a new scenario requires a code edit and a Vite rebuild.
The JSON file approach lets the designer (or a future scenario editor) work purely in data.

---

### New types — `game/types/scenario.ts`

Add a compact nested schema that lives on disk. The loader expands it to the existing `Scenario`
type — the engine consumes `Scenario` unchanged.

```
ShipDefinition
  id, classId, name
  fuelLevel?      (default 85)
  ammoLevel?      (default 90)

SquadronDefinition
  id, name, aircraftTypeId
  aircraftCount, maxAircraftCount
  pilotExperience  (ace | veteran | trained | green)

TaskGroupDefinition
  id, name, flagshipId
  position, course, speed, currentOrder, fuelState
  destination?, strikeTargetHex?
  ships[]        ← ShipDefinition[]
  squadrons[]    ← SquadronDefinition[]

ScenarioForceDefinition
  side            ← 'allied' | 'japanese'
  taskGroups[]    ← TaskGroupDefinition[]

ScenarioDefinition   (= ScenarioMetadata + the rest, without shipClasses/aircraftTypes)
  startTime, endTime, mapBounds
  weatherZones[]
  forces[]           ← ScenarioForceDefinition[]
  victoryConditions[]
```

`side` and `taskGroupId` on each `Ship`/`Squadron` are **derived** by the loader from their
position in the tree — never written in the JSON.

---

### New files

#### `public/scenarios/manifest.json`
Array of `ScenarioMetadata`. Loaded by the scenario select screen on mount.
```json
[
  {
    "id": "midway",
    "name": "Battle of Midway",
    "date": "June 4–7, 1942",
    "description": "...",
    "difficulty": "medium",
    "durationHours": 72
  }
]
```

#### `public/scenarios/midway.json`
Full Midway scenario in `ScenarioDefinition` format. All data ported from `midway.ts`.
Example fragment:
```json
{
  "forces": [{
    "side": "allied",
    "taskGroups": [{
      "id": "tf-16",
      "name": "Task Force 16",
      "flagshipId": "cv-enterprise",
      "position": { "q": 43, "r": 49 },
      "course": 220, "speed": 15,
      "currentOrder": "search", "fuelState": 85,
      "ships": [
        { "id": "cv-enterprise", "classId": 1, "name": "USS Enterprise (CV-6)" }
      ],
      "squadrons": [
        { "id": "vf-6", "name": "VF-6 (Fighting Six)",
          "aircraftTypeId": 1, "aircraftCount": 27,
          "maxAircraftCount": 27, "pilotExperience": "veteran" }
      ]
    }]
  }]
}
```

#### `game/data/scenarioRepository.ts`  *(new)*
```ts
fetchManifest(): Promise<ScenarioMetadata[]>
  → GET /scenarios/manifest.json

fetchScenario(id: string): Promise<Scenario>
  → GET /scenarios/{id}.json
  → basic runtime validation
  → denormalize: stamp side + taskGroupId onto every Ship/Squadron;
    apply Ship defaults (hullDamage:0, fires:0, floodingRisk:0,
    fuelLevel:85, ammoLevel:90, damageControlEfficiency:100, status:'operational');
    apply Squadron defaults (deckStatus:'hangared', fuelLoad:100, ordnanceLoaded:'none')
  → append shipClasses: SHIP_CLASSES, aircraftTypes: AIRCRAFT_TYPES
  → return full Scenario
```

---

### Modified files

| File | Change |
|---|---|
| `game/types/scenario.ts` | Add `ShipDefinition`, `SquadronDefinition`, `TaskGroupDefinition`, `ScenarioForceDefinition`, `ScenarioDefinition` |
| `app/components/menus/ScenarioSelectScreen.vue` | Replace static `SCENARIO_MANIFEST` import with `fetchManifest()` on mount; call `fetchScenario(id)` on selection |
| `app/composables/useScenarioLoader.ts` | Add optional `loadScenarioById(id)` helper (async wrapper) |
| `game/data/scenarios/midway.ts` | Keep as reference — no functional changes |

---

### Verification

1. `pnpm dev` → open entry screen → Midway appears (loaded from JSON, not TS).
2. Edit `public/scenarios/midway.json`, change a squadron `aircraftCount`, refresh browser,
   start Midway, open forces panel — new count shows.
3. Add a stub entry to `manifest.json` → appears in scenario list.
4. Full Midway run — all 4 task groups, 35 ships, 25 squadrons load with correct names,
   positions, and experience levels.
5. `pnpm test` — existing 72 Vitest tests still green.

---

## Item 2 — Bug Fixes

*Engine-only bugs first, then engine+renderer, then UI.*

### Bug 1 — Sunk carriers remain fully operational  *(engine: DamageSystem, AirOpsSystem)*

A carrier whose `status` is `'sunk'` currently continues to launch strikes, CAP, and scouts
as if undamaged. Losses must have consequences.

**Sunk carrier — immediate effects:**
- All pending launch orders cancelled; no new missions can be issued from a sunk ship.
- Squadrons currently on deck are lost (aircraft and pilots).
- Airborne squadrons assigned to that carrier receive no valid recovery destination.

**Airborne squadrons with no home:**
- When a strike or CAP returns and its assigned carrier is sunk, the flight searches for
  an alternative carrier in the same task force (or a friendly TF within range).
- If a suitable carrier is found with available deck space, aircraft recover there.
- Aircraft recovered on an over-capacity carrier (see below) are parked but at a penalty.
- If no recovery is possible before fuel runs out, the aircraft are lost at sea.

**Over-capacity operations (hard cap: carrier nominal + 20%):**
- A carrier holding aircraft above nominal capacity suffers:
  - Reduced sortie rate (longer rearm/refuel times for all squadrons).
  - Higher fuel burn per step (deck congestion, extra handling).
  - Increased accident risk on launch/recovery (optional: small probability of aircraft loss).
- Above the hard cap (nominal + 20%) no further recovery is permitted — incoming aircraft
  ditch at sea.

**Aircraft attrition:**
- Aircraft lost to flak or air combat are removed from their squadron's `aircraftCount`
  permanently.
- A squadron at zero aircraft is disbanded; its slot is freed on the carrier.
- Fuel exhaustion mid-flight: if a flight plan's fuel budget cannot cover the return leg,
  aircraft are lost at sea on the return (not recovered). The player can knowingly launch
  a one-way strike — a suicide mission — accepting the aircraft loss.

---

### Bug 2 — Side-level fuel pool not modeled; fuel transports not enforced  *(engine: AirOpsSystem, VictorySystem, ScenarioDefinition)*

**Fuel pool per side:**
Each side has a total aviation-fuel reserve defined in the scenario. All missions draw from
this shared pool. Current code has per-ship `fuelLevel` fields that do not decrease and are
not aggregated into a side total.

**Fuel transports / oilers:**
If not yet present, add an `oiler` ship type to `ShipType`. An oiler carries a fuel payload
defined on its `ShipClass`. When an oiler is sunk, its payload is immediately deducted from
its side's fuel pool. Partial damage reduces payload proportionally.

**Mission fuel cost (per launch, by aircraft role):**
- `scout` / `patrol-bomber` — lowest burn (long range, light load)
- `fighter` (CAP sortie) — moderate burn
- `dive-bomber` / `torpedo-bomber` (strike) — highest burn per aircraft

Cost formula: `aircraftCount × roleRate × missionRange`. Deducted from the side pool at
launch. If a mission's aircraft are lost (to flak, air combat, or fuel exhaustion), that
fuel is spent — it does not return to the pool.

**Fuel-exhaustion end condition:**
If a side's fuel pool reaches zero it can no longer launch any missions. All airborne
flights that cannot make it home on remaining personal fuel are lost at sea (see Bug 3).
If **both** sides reach zero fuel the game ends immediately — neither navy can act; the
scenario is scored on points accumulated to that point.
As long as at least one side has fuel, normal engagement and scenario-conclusion rules apply.

**Scenario coupling:** `ScenarioDefinition` must gain `alliedFuelPool` and `japaneseFuelPool`
fields. Initial values in `midway.json` will be set by the evolutionary tuner (Item 3).

---

### Bug 3 — CAP has no fuel limit; per-mission consumption not enforced  *(engine: AirOpsSystem)*

**CAP endurance:** CAP missions currently orbit indefinitely. In reality each CAP rotation has
a fixed airborne window (~90 min) before fuel forces recall. Once landed, the fighters must
refuel and rearm before the next rotation can launch (deck crew time + fuel transfer).

**Incoming strike during refuel:** If an enemy strike arrives while CAP fighters are on deck
being refueled/rearmed, the recovery/rearm cycle is severely disrupted — the deck is occupied
receiving aircraft, delaying all subsequent launch operations. Next CAP launch time should
increase significantly in that case.

**Fuel consumption — not enforced per mission:**
- Carrier task group steaming consumes bunker fuel each step (speed-dependent).
- Strike missions consume aviation fuel on launch (proportional to range + aircraft count).
- CAP rotations consume aviation fuel for each orbit window.
- Scout missions consume aviation fuel (long-range, high cost per sortie).
- `fuelLevel` / `fuelState` fields exist on `Ship` and `TaskGroup` but do not decrease
  during play, making resupply and range constraints irrelevant.

**Strategic implication to preserve:** A carrier group running heavy CAP burns aviation fuel
fast, limiting strike capacity. A TF low on bunker fuel must slow down or divert. This
tension is central to the Pacific campaign and must be felt by the player.

---

### Bug 4 — Strikes fly to launch-time hex, not current target position  *(engine + renderer: FlightPlan, usePixiRenderer)*

**Outbound:** When a strike is launched, `FlightPlan.targetHex` is fixed to the target's
position at launch time. If the target task group moves while the strike is airborne, the
planes continue toward the stale hex — they miss entirely.
Expected: the engine resolves the target's current hex each step; the renderer re-draws the
bezier arc each frame to aim at the target's current position. Course corrections are smooth.

**Inbound (return leg):** Returning planes fly back to the carrier's position at the moment
the strike resolved, not where the carrier is now.
Expected: same dynamic tracking — return arc re-anchors to the home carrier's current hex
each frame until recovery.

---

### Bug 5 — No fuel gauge in the HUD  *(UI: TopStatusBar or NavSidebar)*

Each side needs a persistent fuel indicator showing remaining fuel as a percentage of its
starting pool (relative, never absolute — absolute values are scenario-internal).

Use the Nuxt UI slider component (`https://ui.nuxt.com/docs/components/slider`) in read-only
mode, one per navy, clearly color-coded (blue Allied, red IJN). Place them in a visible HUD
area — top status bar or the nav sidebar are candidates.

The gauge must update reactively as missions are launched and aircraft are lost. When fuel
drops below a warning threshold (e.g. 20%) the indicator should signal urgency visually
(color shift or pulse). At zero the bar is empty and the side is grounded.

---

## Item 3 — Evolutionary Parameter Tuner

**Goal:** Find simulation parameter values (engine constants + scenario initial values) that
produce good gameplay automatically, rather than hand-tuning magic numbers.

**Why parameters and scenario are coupled:** Every change to engine mechanics (fuel burn rates,
damage multipliers, CAP effectiveness) requires corresponding adjustments to the scenario's
initial conditions (starting fuel pools, unit counts, opening positions). Tuning one without
the other produces unbalanced play. The tuner must treat both as a unified parameter space.

**Genome — `SimParams`:**
Extract hardcoded constants from the engine into a flat `SimParams` object:
- Fuel burn rates per role (scout, fighter, strike)
- Damage multipliers (bomb, torpedo, flak)
- CAP intercept effectiveness
- Rearm/refuel durations
- Scenario initial values: `alliedFuelPool`, `japaneseFuelPool`

**Fitness function (priorities: outcome balance + fuel tension):**
Run K headless simulations per genome and score on:
1. **Outcome balance** — neither side wins more than ~65% of runs; target near 50/50
2. **Fuel tension** — at least one side dips below 30% fuel before the game ends; fuel
   should not be trivially abundant
3. **Game duration** — secondary; games should not end in the first few hours

**Implementation:**
```
scripts/
  tune-params.ts     ← Node.js script, run with: pnpm tune
  fitness.ts         ← headless runner + scoring logic

game/
  engine/SimParams.ts ← genome type + current defaults

public/
  params.json         ← output; loaded by engine at startup
```

The evolutionary loop (simple `(μ + λ)` or CMA-ES for continuous params):
1. Generate population of `SimParams` genomes (start from current defaults ± noise)
2. For each genome: run K headless `GameEngine` simulations to completion
3. Score each genome; rank by fitness
4. Select top performers; mutate to produce next generation
5. Repeat until fitness plateaus; write winner to `public/params.json`

**Foundation note:** the headless runner and genome infrastructure built here is the same
foundation needed later for the evolutionary AI opponent (see Long-horizon in roadmap). Build
it once, reuse it.

---

## Nice-to-Have — Pending Roadmap Items

Truly unimplemented as of Sprint 17. Not scheduled for week 2 but should inform roadmap
decisions once bugs are cleared.

### Music
- **Strudel soundtrack engine** — embed `@strudel/web` as a programmatic music engine;
  compose patterns in the Strudel REPL, save to `public/music/*.strudel`, play in-game via
  `evaluate()` on scenario start and key events. Zero rebuild on pattern edits.
  Full integration plan: [`docs/reference/strudel_integration.md`](../reference/strudel_integration.md)

### Gameplay
- **Scramble alert** — player receives a warning when an enemy strike is inbound; one-click CAP
  launch shortcut. (AI side already handles this; player side has no alert.)

### Cosmetic (deferred until gameplay complete)
- **MapTiler basemap** — `useMapLibre.ts` is a stub; MapLibre GL under PixiJS canvas with
  viewport sync (Sprint A)
- **Custom unit tokens** — sprite assets exist in `public/assets/game/` but renderer still uses
  procedural squares/circles; faction badges (Sprint B)
- **Hover glow** — hover state is tracked in the map store but no visual glow is rendered on
  task group tokens (Sprint C)

### Long-horizon
- **Evolutionary AI** — genome-based Japanese policy trained via self-play; see roadmap for architecture notes
