# Sprint Log

Most recent sprint always on top.

---

## Sprint 6 — Vue HUD, Modals & Keyboard Shortcuts (completed 2026-04-04)

**Goal:** Full interactive HUD layer — extracted components, order/air-ops modals, keyboard shortcuts, command palette, and engine event toasts.

### Delivered
- **`app/components/game/TimeControls.vue`** — extracted top bar: game time, play/pause, 1×/2×/4×/8× time scale, Menu button; aria-labels include shortcut hints
- **`app/components/game/TaskGroupPanel.vue`** — enhanced TG panel extracted from GameHUD:
  - Ship table with hull% (color-coded green→red), fire count, fuel%, status badge per row
  - 3-column stats row: order, speed, fuel state
  - "Order" button (opens OrderModal) and "Air Ops" button (opens AirOpModal) for allied TGs only
- **`app/components/game/MiniLog.vue`** — scrollable intel log (last 10 sighting reports), auto-shows on new entries, dismissable via ×
- **`app/components/menus/OrderModal.vue`** — `UModal` with 8 order buttons (standby/patrol/search/strike/intercept/escort/refuel/retire) + speed selector (15/20/25/30 kt); highlights current order
- **`app/components/menus/AirOpModal.vue`** — `UModal` + `UTabs`: Deck Status (squadron list with deckStatus badges) / Airborne Missions (flight plans with Recall button) / CAP (assigned fighters)
- **`app/composables/useGameEvents.ts`** — subscribes to engine events on mount, cleans up on unmount:
  - `StrikeInbound` → red toast 8s
  - `ShipSunk` → red/green toast 8s (by side)
  - `ShipDamaged` → warning toast 5s
  - `SightingDetected` (confidence ≥60, allied, not false) → info toast 6s
- **`app/components/game/GameHUD.vue`** — refactored to use new components; adds:
  - `defineShortcuts`: `Space`=pause, `1/2/4/8`=time scale, `K`=command palette, `N/P`=cycle allied TGs, `Escape`=dismiss modals/deselect
  - `UCommandPalette` modal (K): order commands for selected TG + speed group + TF navigation group
- **`app/app.vue`** — fixed: removed Nuxt Starter Template boilerplate (UHeader/UFooter); now minimal `<UApp><NuxtPage /></UApp>`
- **`app/pages/index.vue`** — fixed: `<ScenarioSelectScreen>` → `<MenusScenarioSelectScreen>` (Nuxt subdirectory auto-import naming)
- Build: zero TypeScript errors, clean production build

### Architecture notes
- `useGameEvents` uses `watch(() => gameStore.engine, ...)` to re-attach event subscriptions on scenario reload; unsubscribes stored as the array of functions returned by `engine.events.on()`
- Command palette groups are computed: when a TG is selected, order and speed groups appear above the global TF navigation group
- `TaskGroupPanel` imports `SHIP_CLASSES` statically for hull% calculation (`hullDamage / maxHP`) — no runtime fetch needed

---

## Sprint 5 — PixiJS Rendering & Game Canvas (completed 2026-04-04)

**Goal:** First visual milestone — render the hex map, unit tokens, and flight paths via PixiJS; wire up the scenario selection screen; make the game playable in the browser.

### Delivered
- **`app/stores/map.ts`** — viewport state (x/y/zoom), selected TG, hovered hex
- **`app/composables/useHexMap.ts`** — Vue-side wrapper around `@game/utils/hexMath`; calls `initGrid()` once on first use
- **`app/composables/usePixiRenderer.ts`** — Full PixiJS v8 renderer:
  - 7-layer stage: terrain → grid → fog → contacts → units → flight paths → selection → annotations
  - `drawTerrain()`: atoll hexes (Midway) in green, annotation label placed on world container
  - `drawGrid()`: 72×84 hex outlines in single batched `Graphics` object
  - `rebuildUnitTokens()`: allied circles (blue), IJN circles (red), enemy contacts as orange diamonds with `?`; carrier-dot indicator; TG name label
  - `onTick()` (Pixi ticker): lerp all token positions between `prevPos` / `currPos` using `gameStore.stepFraction` for smooth animation
  - `drawFlightPaths()`: quadratic bezier arcs + arrowheads for airborne strike plans
  - `drawSelection()`: gold ring around selected TG
  - Pan (drag) + zoom (wheel-toward-cursor) with viewport clamped to 0.3×–4.0×
  - `centreViewport()`: auto-fits map to window on load
  - Pointer events: token tap → select TG, drag → pan, hover → `mapStore.hoveredHex`
- **`app/composables/useMapLibre.ts`** — no-op stub; MapLibre deferred until tile key is available
- **`app/components/game/GameCanvas.vue`** — mounts PixiJS app into a `<div>` container; calls `usePixiRenderer` + `useGameLoop`
- **`app/components/game/GameHUD.vue`** — absolute overlay (pointer-events: none globally, re-enabled per control):
  - Top bar: game time (formatted day + HH:MM), play/pause, time-scale buttons (1×/2×/4×/8×), menu button
  - Selected-TG side panel: name, side badge, order, speed, position, ship status list
  - Victory fade overlay when `phase === 'ended'`
- **`app/components/menus/ScenarioSelectScreen.vue`** — scenario card grid; Midway playable, Coral Sea marked "coming soon"
- **`app/pages/index.vue`** — phase switch: `menu` → `ScenarioSelectScreen`; playing/paused/ended → `GameCanvas` + `GameHUD`
- **`game/data/scenarios/midway.ts`** — added `fuelState` to all four task groups (required field)
- Build: zero TypeScript errors, clean production build

### Architecture notes
- `usePixiRenderer` installs a Pixi ticker listener for frame-rate interpolation — the game engine and Pixi ticker run independently; the ticker just reads `gameStore.stepFraction`
- `unitTokens` map (TG id → Container) is incrementally updated on store change; tokens are never rebuilt unless the TG disappears
- The world container handles all pan/zoom via `x/y/scale` — no individual layer translation needed

---

## Sprint 4 — Air Operations, Combat & Victory (completed 2026-04-04)

**Goal:** Implement all combat systems and wire them into the engine so the simulation can fully resolve carrier battles and declare a winner.

### Delivered
- **`game/engine/AirOpsSystem.ts`** — Launch queue, ETA/returnETA computation, recovery pipeline, CAP & spotted-squadron queries; `recallMission()` forces early return.
- **`game/engine/CombatSystem.ts`** — Strike resolution pipeline: CAP intercept (quality-weighted air combat, penetration if survivors > 30% of defenders) → flak (aaStrength/400 kill rate) → hit scoring by weapon type (torpedo 18hp+20 flooding, dive-bomb 12hp+1 fire, level 8hp). Prioritises carriers as targets.
- **`game/engine/DamageSystem.ts`** — Per-step damage: fire spread (22%), damage control (dcRate×0.55), fire hull damage (4hp/fire/step), flooding (8%×risk/step). `applyStrikeHits()` multiplies fires ×2.5 when spotted aircraft are on deck (Kido Butai scenario).
- **`game/engine/SurfaceCombatSystem.ts`** — Up to 4 surface rounds per step, 8% hit chance, armor mitigation, carriers auto-retreat at 90% probability. `combatStrength` determines disengagement at <40% ratio.
- **`game/engine/VictorySystem.ts`** — Evaluates sink-carrier, sink-ship-class, control-hex, survive-until, sink-total-tonnage conditions. Awards winner by condition sweep or points-at-time-expiry.
- **`game/engine/GameEngine.ts`** — Fully wired:
  - `MutableGameState` now includes `victoryConditions: VictoryCondition[]`
  - `OrderPayload` extended with `launch-strike`, `launch-cap`, `launch-search`, `recall-mission`
  - `runStep()` sequence: Movement → Search → FogOfWar → AirOps → Combat → Damage → SurfaceCombat → Victory
  - `emitShipSunk()` helper fires `ShipSunk` event and pushes `CombatEvent`
  - `ScenarioEnded` emitted (once) when VictorySystem returns a winner; engine auto-pauses
- **`game/engine/TimeSystem.ts`** — added `get endTime()` accessor (needed by VictorySystem via GameEngine)
- **`app/composables/useScenarioLoader.ts`** — now passes `scenario.victoryConditions` into state
- Build: zero TypeScript errors, clean production build

### Architecture notes
- `DamageSystem` is constructed before `CombatSystem` and injected — shared instance ensures strike hits and per-step fire/flooding use the same RNG stream.
- `scenarioEnded` guard prevents duplicate `ScenarioEnded` events across multiple calls to `runStep()` in the same tick.

---

## Sprint 3 — Search, Fog of War & Midway Scenario (completed 2026-04-04)

**Goal:** Implement search & sighting with fog of war; write the first full playable scenario (Battle of Midway).

### Delivered
- **`game/engine/SearchSystem.ts`** — Per-step search resolution:
  - Finds all TGs on 'search' order, selects best scout aircraft by effective range
  - Per-enemy-TG probability: `distFactor × visFactor × experienceModifier × 0.85 max`
  - False report chance by experience: ace 3%, veteran 8%, trained 18%, green 28%
  - Contact type misidentification by experience (ID accuracy: ace 97% → green 40%)
  - False reports placed at random hex within radius 4 of true position
  - Speed/course estimates with experience-scaled noise
- **`game/engine/FogOfWarSystem.ts`** — Contact tracking per side:
  - `processStep()`: decays stale contacts (>4h = inactive), integrates new SightingReports, matches reports to existing contacts by hex or confirmed TG ID
  - `isVisible(taskGroupId, forSide, ...)` — own forces always visible; enemies only if active contact
  - `getActiveContacts(side, ...)` — sorted most-recent first
- **`game/engine/EventEmitter.ts`** — now emits `SightingDetected` per sighting in addition to `StepComplete`
- **`game/engine/GameEngine.ts`** — updated:
  - `MutableGameState` now includes `weatherZones`, `aircraftTypes`, `shipClasses`
  - `runStep()` wires SearchSystem then FogOfWarSystem in sequence
  - `GameSnapshot` includes `sightingReports[]` from latest step
  - Constructor accepts optional `seed` for deterministic RNG
- **`game/data/scenarios/midway.ts`** — Full Battle of Midway (June 4–7, 1942):
  - 4 task groups: TF-16, TF-17, Kido Butai, Invasion Force
  - 35 ships with historical names, class IDs, taskGroup assignments
  - 25 squadrons: VF/VB/VS/VT for Enterprise, Hornet, Yorktown; Zero/Val/Kate/Jake for all 4 IJN carriers + Tone/Chikuma scouts
  - 2 weather zones (NW squall concealing Kido Butai; clear near US carriers)
  - 4 victory conditions (sink carriers, defend/capture Midway)
  - Historical hex positions at 20 NM/hex (Midway q=35 r=55, KB q=23 r=43, TF-16 q=51 r=39)
- **`game/types/scenario.ts`** — `ScenarioForce` now includes `ships: Ship[]`
- **`game/data/scenarios/index.ts`** — exports `MIDWAY` and scenario manifest
- **`app/stores/intelligence.ts`** — fully implemented: contacts by side, sighting log, `isVisible()`, `syncFromSnapshot()`
- **`app/composables/useScenarioLoader.ts`** — converts `Scenario` → `MutableGameState`, calls `gameStore.initEngine()`, seeds stores with initial snapshot
- **`app/composables/useGameLoop.ts`** — now syncs `intelStore` on each `StepComplete`

### Key decisions made
- SearchSystem uses the TG's 'search' order as proxy for "scouts are airborne" — AirOpsSystem (Sprint 4) will take over detailed deck cycle management
- False reports and misidentification are computed at sighting time and stored in the report — FogOfWarSystem never "corrects" them during decay
- Terrain atoll hexes (Midway) are registered in `hexCells` at load time — SearchSystem and pathfinding treat them as impassable

### Up next (Sprint 4)
`AirOpsSystem` (deck cycle state machine), `CombatSystem` (per-plane strike resolution, flak, CAP), `DamageSystem` (fire spread, flooding, damage control), `SurfaceCombatSystem`.

---

## Sprint 2 — Core Engine Headless (completed 2026-04-04)

**Goal:** Implement the pure TypeScript game engine: hex math, pathfinding, time system, movement, and the central GameEngine orchestrator with event bus.

### Delivered
- **`game/utils/dice.ts`** — Mulberry32 seeded RNG (`createRng`, `rollD100`, `chance`)
- **`game/utils/hexMath.ts`** — Full honeycomb-grid v4 wrappers:
  - `initGrid(hexSize)` / `getHexSize()` — lazy grid singleton (72×84, flat-top)
  - `hexToPixel`, `pixelToHex` — coordinate conversion
  - `hexCorners` — 6 corner points for rendering
  - `hexDistance` — cube coordinate distance
  - `hexNeighbors` — 6 valid in-bounds flat-top neighbors
  - `hexLine` — straight-line traversal via cube interpolation
  - `hexesInRange` — all hexes within radius N
  - `speedToHexesPerStep` — knots → hexes per 30-min step (at 20 NM/hex)
  - `bearingBetween` — degrees from one hex center to another
  - `coordKey` / `keyToCoord` — stable string keys for Map/Set usage
- **`game/utils/pathfinding.ts`** — Hex A* with terrain awareness:
  - `findPath(from, to, terrain, passable)` — returns ordered `HexCoord[]` or `null`
  - `isSurfacePassable`, `isSubmarinePassable` — terrain predicates
  - `advanceAlongPath(path, hexes)` — advance N hexes along path with remainder carry
- **`game/engine/EventEmitter.ts`** — Typed event emitter (no Vue/Node dependencies)
- **`game/engine/TimeSystem.ts`** — 30-min step accumulation:
  - Wall-clock ms → simulated ms via `timeScale` (1×/2×/4×/8×)
  - `tick(deltaMs)` → `TimeTickResult` (stepFired, stepsCompleted, stepFraction)
  - `forceStep()` for debugging
  - Auto-pauses at `endTime`
- **`game/engine/MovementSystem.ts`** — Per-step task group movement:
  - Hex accumulator pattern (fractional hexes carry between steps)
  - Auto-replan path when destination changes
  - Returns `MovementResult[]` consumed by GameEngine
- **`game/engine/GameEngine.ts`** — Central orchestrator:
  - `MutableGameState` (internal, never exposed to Vue)
  - `GameSnapshot` (immutable copy emitted after each step)
  - `TickResult` (returned from `tick()` to the RAF loop)
  - `EngineEvents` typed bus: `StepComplete`, `ShipDamaged`, `ShipSunk`, `StrikeInbound`, `ScenarioEnded`
  - `issueOrder(payload)` — handles `set-order`, `set-speed`, `set-destination`
  - `createEmptyState()` factory for dev/testing
- **`app/stores/game.ts`** — Master Pinia store: engine `shallowRef`, pause/resume, time scale, scenario lifecycle
- **`app/stores/forces.ts`** — Task groups, ships, squadrons, movement paths; `syncFromSnapshot()`
- **`app/composables/useGameLoop.ts`** — RAF loop calling `engine.tick()`, syncing stores on `StepComplete`

### Key decisions made
- `@game` Vite/Nuxt alias (absolute path via `fileURLToPath`) replaces `~/game` — the `~` alias in Nuxt 4 points to `app/`, not root
- `TypedEventEmitter` constrains `Events extends Record<string, any>` (not `unknown`) to support complex event payload types
- Engine holds `shallowRef` in Pinia — prevents Vue deep-watching internal Maps/class instances
- Between steps, `stepFraction` (0–1) available for smooth token interpolation in the renderer

### Up next (Sprint 3)
`SearchSystem`, `FogOfWarSystem`, first full scenario data (Midway): initial task group positions, ship assignments, squadron deployments.

---

## Sprint 1 — Foundation (completed 2026-04-04)

**Goal:** Scaffold the project, install dependencies, define all TypeScript types, write historical static data.

### Delivered
- Nuxt 3 initialized from the official Nuxt UI template (`--template ui`)
- Dependencies installed: `@nuxt/ui`, `@pinia/nuxt`, `pinia`, `pixi.js@8`, `honeycomb-grid`, `maplibre-gl`
- `nuxt.config.ts` configured: `ssr: false`, `@pinia/nuxt` module, `~/game` alias, Vite `optimizeDeps` for game libs
- Full folder skeleton created: `game/`, `app/stores/`, `app/composables/`, `app/components/game/`, `app/components/menus/`
- All TypeScript interfaces written in `game/types/`:
  - `map.ts` — `HexCoord`, `HexCell`, `TerrainType`, `GridConfig`, `WeatherCondition`, `WeatherZone`
  - `ships.ts` — `ShipClass`, `Ship`, `TaskGroup`, `TaskGroupOrder`, `Side`, `ShipType`, `ShipStatus`
  - `aircraft.ts` — `AircraftType`, `Squadron`, `FlightPlan`, `PilotExperience`, `DeckStatus`, `MissionType`
  - `scenario.ts` — `Scenario`, `GameTime`, `ScenarioForce`, `VictoryCondition`, time utility functions
  - `combat.ts` — `StrikeResult`, `HitResult`, `SurfaceCombatResult`, `CombatEvent`, `DamageType`
  - `intel.ts` — `SightingReport`, `ContactRecord`, `ContactType`, `GameEvent`
- Static data written in `game/data/`:
  - `shipClasses.ts` — 33 ship classes (Allied + IJN carriers, battleships, cruisers, destroyers, submarines, support)
  - `aircraftTypes.ts` — 17 aircraft types (Allied + IJN fighters, dive bombers, torpedo bombers, patrol/scout)
- Scenario manifest stub in `game/data/scenarios/index.ts` (Midway, Coral Sea)
- All engine, utils, store, and composable files stubbed for future sprints
- `pnpm build` passes clean ✓

### Key decisions made
- `ssr: false` (SPA mode) — PixiJS cannot run server-side
- `~/game` alias — keeps pure TypeScript engine code outside the Nuxt `app/` tree
- Ship classes and aircraft types are statically bundled TypeScript (no network fetch, no JSON, fully type-safe)
- `pnpm` version pinned to `9.12.2` (system version); template's `10.x` requirement removed due to corepack signature issue

### Up next (Sprint 2)
Core engine headless: `dice.ts` RNG, `hexMath.ts` wrappers, `TimeSystem`, `MovementSystem`, `GameEngine` skeleton with step loop.
