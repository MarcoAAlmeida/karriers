# Karriers — Agent Instructions

Browser SPA remake of the 1984 SSG wargame "Carriers at War". Pacific WW2 carrier operations strategy game on a 72×84 hex grid at 20 NM/hex.

---

## Project docs

| File | Purpose |
|---|---|
| `docs/done/sprints.md` | Completed sprint log (most recent on top) |
| `docs/roadmap.md` | Upcoming work — sprints 7, 8, 9 |
| `docs/vision/karriers_at_war_inspiration.md` | Original game reference |

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Nuxt 4, `ssr: false` (SPA) |
| UI | Nuxt UI v4 (`@nuxt/ui`) |
| State | Pinia (`@pinia/nuxt`) |
| Hex math | `honeycomb-grid` |
| Map renderer | PixiJS v8 (canvas, layered stage) |
| Geo basemap | MapLibre GL JS + MapTiler Ocean tiles (`NUXT_PUBLIC_MAPTILER_KEY`) |
| Language | TypeScript throughout |
| Package manager | pnpm |

---

## Folder structure

```
karriers/
├── app/                              # Nuxt app — Vue components, stores, composables
│   ├── pages/index.vue               # Phase switch: menu / playing / ended
│   ├── components/
│   │   ├── game/
│   │   │   ├── GameCanvas.vue        # Mounts PixiJS + MapLibre; owns game loop
│   │   │   ├── GameHUD.vue           # Overlay: shortcuts, command palette, victory screen
│   │   │   ├── TimeControls.vue      # Top bar: clock, play/pause, time scale buttons
│   │   │   ├── TaskGroupPanel.vue    # Selected TG: ship table, order/air-ops buttons
│   │   │   └── MiniLog.vue           # Scrollable intel/sighting log
│   │   └── menus/
│   │       ├── ScenarioSelectScreen.vue
│   │       ├── OrderModal.vue        # Issue order + speed to selected TG
│   │       └── AirOpModal.vue        # Deck status / airborne / CAP / launch strike
│   ├── composables/
│   │   ├── useGameLoop.ts            # rAF driver → engine.tick() → store sync
│   │   ├── usePixiRenderer.ts        # PixiJS app, 8 layers, token interpolation
│   │   ├── useMapLibre.ts            # MapLibre init + Pixi viewport sync
│   │   ├── useHexMap.ts              # honeycomb-grid singleton
│   │   ├── useScenarioLoader.ts      # Scenario → MutableGameState → GameEngine
│   │   └── useGameEvents.ts          # Engine event → useToast notifications
│   └── stores/
│       ├── game.ts                   # Phase, time, pause, engine shallowRef
│       ├── forces.ts                 # Task groups, ships, squadrons, flight plans
│       ├── intelligence.ts           # Contacts, sighting log, isVisible()
│       └── map.ts                    # Selected TG/hex, viewport state
└── game/                             # Pure TypeScript — ZERO Vue/Nuxt imports
    ├── engine/
    │   ├── GameEngine.ts             # Orchestrator: tick(), issueOrder(), events bus
    │   ├── TimeSystem.ts             # 30-min step accumulation, time scale
    │   ├── MovementSystem.ts         # Hex pathfinding, speed → hexes/step
    │   ├── SearchSystem.ts           # Search probability, false reports
    │   ├── AirOpsSystem.ts           # Deck cycle state machine, launch queue
    │   ├── CombatSystem.ts           # CAP intercept, flak, hit scoring
    │   ├── DamageSystem.ts           # Fire spread, flooding, damage control
    │   ├── SurfaceCombatSystem.ts    # Triggered when opposing TGs share a hex
    │   ├── FogOfWarSystem.ts         # Contact tracking, 4h decay, visibility
    │   ├── VictorySystem.ts          # Win/loss condition evaluation each step
    │   └── EventEmitter.ts           # Typed event emitter (no Vue/Node deps)
    ├── types/                        # Source-of-truth TypeScript interfaces
    │   ├── map.ts                    # HexCoord, HexCell, TerrainType, WeatherZone
    │   ├── ships.ts                  # ShipClass, Ship, TaskGroup, TaskGroupOrder, Side
    │   ├── aircraft.ts               # AircraftType, Squadron, FlightPlan, DeckStatus
    │   ├── scenario.ts               # Scenario, GameTime, VictoryCondition
    │   ├── combat.ts                 # StrikeResult, CombatEvent, DamageType
    │   └── intel.ts                  # SightingReport, ContactRecord, GameEvent
    ├── data/
    │   ├── shipClasses.ts            # 33 ship classes (Allied + IJN)
    │   ├── aircraftTypes.ts          # 17 aircraft types
    │   └── scenarios/
    │       ├── index.ts              # Scenario manifest + metadata
    │       └── midway.ts             # Battle of Midway (June 4–7 1942)
    └── utils/
        ├── dice.ts                   # Seeded deterministic RNG (Mulberry32)
        ├── hexMath.ts                # honeycomb-grid wrappers, coord utilities
        └── pathfinding.ts            # Hex A* with terrain awareness
```

---

## Engine architecture

### Engine ↔ Vue boundary
- `GameEngine` is a plain TypeScript class stored as `shallowRef<GameEngine>` in `stores/game.ts`
- Engine emits typed events via `TypedEventEmitter<EngineEvents>`
- Vue reads from `GameSnapshot` — an immutable copy emitted after each step via `StepComplete`
- Pinia stores subscribe in setup: `engine.events.on('StepComplete', syncFromSnapshot)`
- PixiJS never imports Vue; Vue never imports PixiJS — communicate via Pinia + DOM events

### Engine events
```typescript
StepComplete:      GameSnapshot
SightingDetected:  SightingReport
ShipDamaged:       CombatEvent
ShipSunk:          { shipId; taskGroupId; side: Side; time: GameTime }
StrikeInbound:     { flightPlanId; targetTaskGroupId; time: GameTime }
ScenarioEnded:     { winner: Side | 'draw'; time: GameTime }
```

### Step sequence (every 30 simulated minutes)
1. `TimeSystem` — advance `GameTime` by 30 min
2. `MovementSystem` — reposition all task groups
3. `SearchSystem` — resolve sector searches → `SightingReport[]`
4. `AirOpsSystem` — process deck cycles, launch queued missions
5. `FogOfWarSystem` — decay old contacts, integrate new sightings
6. `CombatSystem` — resolve strikes reaching target this step
7. `DamageSystem` — fire spread, damage control, sinking checks
8. `SurfaceCombatSystem` — trigger if opposing TGs share a hex
9. `VictorySystem` — check win/loss conditions
10. Engine emits `StepComplete` → stores pull `getSnapshot()`

### Order types (GameEngine.issueOrder)
```typescript
| { type: 'set-order';       taskGroupId: string; order: TaskGroupOrder; destination?: HexCoord }
| { type: 'set-speed';       taskGroupId: string; speedKnots: number }
| { type: 'set-destination'; taskGroupId: string; destination: HexCoord }
| { type: 'launch-strike';   taskGroupId: string; squadronIds: string[]; targetHex: HexCoord }
| { type: 'launch-cap';      taskGroupId: string; squadronIds: string[] }
| { type: 'launch-search';   taskGroupId: string; squadronIds: string[]; searchSector: number }
| { type: 'recall-mission';  flightPlanId: string }
```

### Time model
- 1 step = 30 simulated minutes
- `MS_PER_SIM_MINUTE_AT_1X = 100` → 1× fires a step every **3 real seconds**
- 2× = 1.5 s/step · 4× = 0.75 s/step · 8× = 0.375 s/step
- `stepFraction` (0→1) available every frame for smooth token interpolation and HUD clock

### PixiJS layer stack (bottom → top)
`TerrainLayer` → `GridLayer` → `FogLayer` → `ContactLayer` → `UnitLayer` → `FlightPathLayer` → `SelectionLayer` → `UIAnnotationLayer`

### Hex grid
- 72 × 84, flat-top orientation, `hexSize = 40` px (circumradius)
- Horizontal pitch between centers: 60 px; vertical pitch: ≈ 69.3 px
- `@game` alias points to `game/` directory (Vite + Nuxt alias)
- `honeycomb-grid` Grid singleton initialised once via `useHexMap()`

### Coordinate transform (Pixi ↔ geographic)
Needed for MapLibre sync and future features:
- Anchor: Midway Atoll hex `(35, 55)` ↔ `(28.21°N, 177.37°W)`
- Scale: 20 NM/hex; 1 NM ≈ 1/60° latitude
- `hexToLatLon(coord)`: compute NM offset from anchor → lat/lon delta accounting for `cos(lat)` for longitude

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Pause / Resume |
| `1` `2` `4` `8` | Time scale |
| `K` | Command palette (orders + TF navigation) |
| `N` / `P` | Cycle next / previous allied TF |
| `Esc` | Dismiss modal / deselect TF |
| Click token | Select task force |
| Click empty hex | Set destination for selected TF |

---

## Rules

- `game/` must **never** import from `app/`, Vue, or Nuxt. Headless TypeScript only.
- `app/stores/` are the only bridge between engine and Vue.
- PixiJS owns the canvas. Nuxt UI owns everything else (HUD, modals, panels).
- All ship classes and aircraft types are statically bundled TypeScript — no JSON, no fetch.
- `pnpm dev` must always start cleanly. `pnpm build` must always produce zero TypeScript errors.
- When completing a sprint, prepend it to `docs/done/sprints.md` (most recent on top).

---

## Local dev

```bash
pnpm dev      # http://localhost:3000
pnpm build    # production build — must pass clean before any deploy
pnpm preview  # preview production build locally
```

Optional: add `NUXT_PUBLIC_MAPTILER_KEY=<key>` to `.env` to enable the MapTiler Ocean basemap.
Without the key the game falls back to PixiJS-drawn terrain tiles.
