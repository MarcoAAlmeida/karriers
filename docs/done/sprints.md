# Sprint Log

Most recent sprint always on top.

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
