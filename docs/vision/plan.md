# Karriers — Modern Web Remake of Carriers at War (1984)

## Context

Rebuild the 1984 SSG wargame "Carriers at War" as a self-contained browser SPA. The original was a Pacific WW2 carrier operations simulation with a 72×84 hex grid, quasi-real-time pauseable gameplay, high-level task group orders, search & sighting with fog of war, and a full air operations deck-cycle model. The goal is a faithful reimagination using modern web tooling, deployable to NuxtHub (Cloudflare Pages) or Vercel.

---

## Tech Stack

| Layer | Choice |
|---|---|
| App framework | Nuxt 3, `ssr: false` (SPA — PixiJS is DOM-only) |
| UI components | Nuxt UI v3 (`@nuxt/ui`) |
| State | Pinia (`@pinia/nuxt`) |
| Hex math | `honeycomb-grid` |
| Map renderer | PixiJS v8 (canvas, layered stage) |
| Geo basemap | MapLibre GL JS (optional Pacific tiles behind PixiJS canvas) |
| Language | TypeScript throughout |
| Deployment | `pnpm dev` locally first; NuxtHub / Vercel deferred until the game is playable |

---

## Folder Structure

```
karriers/
├── nuxt.config.ts
├── app.vue
├── pages/
│   └── index.vue                  # Mounts GameCanvas + GameHUD
├── components/
│   ├── game/
│   │   ├── GameCanvas.vue         # Owns PixiJS Application, full-screen canvas
│   │   ├── GameHUD.vue            # Vue overlay (pointer-events: none), z-index above canvas
│   │   ├── TimeControls.vue       # Play/pause, time scale, current game time
│   │   ├── TaskGroupPanel.vue     # Selected TG: ships table, order buttons
│   │   └── MiniLog.vue            # Scrolling event log (sightings, damage, strikes)
│   └── menus/
│       ├── ScenarioSelectModal.vue
│       ├── OrderModal.vue         # Issue order to selected task group
│       ├── AirOpModal.vue         # Deck cycle: spot/arm/fuel/launch/recover tabs
│       ├── SightingReportModal.vue
│       └── VictoryModal.vue
├── composables/
│   ├── useGameLoop.ts             # requestAnimationFrame driver, calls engine.tick()
│   ├── useHexMap.ts               # honeycomb-grid setup, coordinate utilities
│   ├── usePixiRenderer.ts         # PixiJS app init, layered stage, destroy on unmount
│   ├── useMapLibre.ts             # MapLibre GL init, sync with PixiJS camera
│   └── useScenarioLoader.ts       # Load scenario → build GameEngine instance
├── stores/
│   ├── game.ts                    # Phase, time, pause state, engine shallowRef
│   ├── forces.ts                  # Task groups, ships, squadrons (synced from engine)
│   ├── intelligence.ts            # Contacts, sighting log, fog-of-war visibility
│   ├── map.ts                     # Selected hex/TG, viewport center, zoom
│   └── scenario.ts                # Loaded scenario metadata, victory conditions
├── game/                          # Pure TypeScript — ZERO Vue/Nuxt imports
│   ├── types/
│   │   ├── map.ts                 # HexCoord, HexCell, TerrainType, GridConfig
│   │   ├── ships.ts               # ShipClass, Ship, TaskGroup, TaskGroupOrder, Side
│   │   ├── aircraft.ts            # AircraftType, Squadron, FlightPlan, DeckStatus
│   │   ├── scenario.ts            # Scenario, GameTime, ScenarioForce, VictoryCondition
│   │   ├── combat.ts              # StrikeResult, DamageReport, CombatEvent
│   │   └── intel.ts               # SightingReport, ContactRecord, ContactType
│   ├── data/
│   │   ├── shipClasses.ts         # All ship class definitions (up to 63)
│   │   ├── aircraftTypes.ts       # All aircraft type definitions (up to 63)
│   │   └── scenarios/
│   │       ├── index.ts           # Manifest array for scenario select screen
│   │       ├── midway.ts          # Battle of Midway
│   │       └── coralSea.ts        # Coral Sea
│   ├── engine/
│   │   ├── GameEngine.ts          # Orchestrator: owns all subsystems, tick(), issueOrder()
│   │   ├── TimeSystem.ts          # 30-min step accumulation, event queue
│   │   ├── MovementSystem.ts      # Hex pathfinding, speed → hexes-per-step
│   │   ├── SearchSystem.ts        # Search probability, false reports, misidentification
│   │   ├── AirOpsSystem.ts        # Deck cycle state machine per squadron
│   │   ├── CombatSystem.ts        # Per-plane strike resolution, flak, CAP interference
│   │   ├── DamageSystem.ts        # Fire spread, flooding, damage control efficiency
│   │   ├── SurfaceCombatSystem.ts # Triggered when opposing TGs share a hex
│   │   ├── FogOfWarSystem.ts      # Contact tracking, 4-hour decay, visibility checks
│   │   └── VictorySystem.ts       # Win/loss condition evaluation each step
│   └── utils/
│       ├── dice.ts                # Seeded deterministic RNG
│       ├── hexMath.ts             # honeycomb-grid wrappers (neighbors, distance, LOS)
│       └── pathfinding.ts         # Hex A* for movement planning
└── public/
    └── assets/                    # Kenney hex tiles, ship/aircraft icons
```

---

## Core TypeScript Interfaces (game/types/)

### ships.ts
```typescript
type Side = 'allied' | 'japanese'
type ShipType = 'fleet-carrier' | 'light-carrier' | 'escort-carrier' | 'battleship' | 'cruiser' | 'destroyer' | 'submarine' | 'transport'
type ShipStatus = 'operational' | 'damaged' | 'on-fire' | 'sinking' | 'sunk'
type TaskGroupOrder = 'patrol' | 'strike' | 'search' | 'escort' | 'retire' | 'intercept' | 'refuel' | 'standby'

interface ShipClass { id: number; name: string; type: ShipType; maxSpeed: number; aaStrength: number; hullPoints: number; flightDeckCapacity?: number }
interface Ship { id: string; classId: number; name: string; side: Side; taskGroupId: string; hullDamage: number; fires: number; fuelLevel: number; damageControlEfficiency: number; status: ShipStatus }
interface TaskGroup { id: string; name: string; side: Side; shipIds: string[]; position: HexCoord; destination?: HexCoord; course: number; speed: number; currentOrder: TaskGroupOrder }
```

### aircraft.ts
```typescript
type AircraftRole = 'fighter' | 'dive-bomber' | 'torpedo-bomber' | 'scout' | 'patrol'
type PilotExperience = 'ace' | 'veteran' | 'trained' | 'green'
type DeckStatus = 'hangared' | 'spotted' | 'airborne' | 'recovering' | 'rearming'
type MissionType = 'strike' | 'search' | 'cap' | 'asw' | 'intercept'

interface AircraftType { id: number; name: string; role: AircraftRole; maxRange: number; speed: number; torpedoCapable: boolean; aaRating: number }
interface Squadron { id: string; aircraftTypeId: number; name: string; side: Side; taskGroupId: string; aircraftCount: number; pilotExperience: PilotExperience; deckStatus: DeckStatus; currentMission?: FlightPlan }
interface FlightPlan { id: string; squadronIds: string[]; mission: MissionType; targetHex?: HexCoord; searchSector?: number; launchTime: GameTime; status: 'planned' | 'airborne' | 'returning' | 'recovered' | 'lost' }
```

### scenario.ts
```typescript
interface GameTime { day: number; hour: number; minute: 0 | 30 }
interface Scenario { id: string; name: string; startTime: GameTime; endTime: GameTime; forces: ScenarioForce[]; victoryConditions: VictoryCondition[]; weatherZones: WeatherZone[] }
interface VictoryCondition { type: 'sink-carrier' | 'sink-ship-class' | 'survive-until'; side: Side; targetShipClass?: number; deadline?: GameTime; points: number }
```

---

## Game Engine Architecture

### Step Sequence (every 30 simulated minutes)
1. `TimeSystem` — advance `GameTime` by 30 min
2. `MovementSystem` — reposition all task groups
3. `SearchSystem` — resolve sector searches → emit `SightingReport` events
4. `AirOpsSystem` — process deck cycles (recovery, rearming, respotting)
5. `FogOfWarSystem` — decay old contacts, process new sightings
6. `CombatSystem` — resolve strikes reaching target this step
7. `DamageSystem` — fire spread, damage control, sinking checks
8. `SurfaceCombatSystem` — trigger if opposing TGs share a hex
9. `VictorySystem` — check win/loss conditions
10. Engine emits `StepComplete` → Pinia stores pull `getSnapshot()`

### Engine ↔ Vue Boundary
- `GameEngine` is a plain TypeScript class, stored in `game.ts` Pinia store as `shallowRef<GameEngine>`
- Engine emits typed events via an internal `GameEventEmitter`
- Pinia stores subscribe in their `setup()`: `engine.on('StepComplete', syncFromSnapshot)`
- Vue never imports PixiJS; PixiJS never imports Vue — they communicate via Pinia stores and custom DOM events

### Fog of War
- `SearchSystem`: probability of contact based on visibility, aircraft range, experience. False report chance 10–25%. Misidentification roll on contact type.
- `FogOfWarSystem`: contacts decay after 4 hours without resighting → `isActive: false`. `isVisible(taskGroupId, forSide)` used by PixiJS renderer to show/hide enemy tokens.

---

## PixiJS Rendering Layers (bottom to top)

```
Stage
├── TerrainLayer      — hex terrain tiles (static, redraws on zoom only)
├── GridLayer         — hex border lines (static)
├── FogLayer          — per-hex fog overlay (updates each step)
├── ContactLayer      — enemy contact markers
├── UnitLayer         — task group tokens with faction icons
├── FlightPathLayer   — arced lines for active flight plans
├── SelectionLayer    — hex highlight, TG selection ring
└── UIAnnotationLayer — range rings, search sector wedges
```

MapLibre GL renders in a `<div>` absolutely positioned behind the PixiJS canvas. Pan/zoom synced via `useMapSync.ts`. Falls back to PixiJS terrain tiles if no tile key is configured.

### honeycomb-grid Setup
```typescript
const Hex = defineHex({ dimensions: hexSize, orientation: 'flat', origin: { x: 0, y: 0 } })
const grid = new Grid(Hex, rectangle({ width: 72, height: 84 }))
```
Used for: axial↔pixel conversion (token placement), neighbor lookup (movement), distance (range rings), LOS traversal.

---

## Nuxt UI v3 Usage

| Component | Where used |
|---|---|
| `UCommandPalette` | Order issuance — press `K`, type TG name, select order |
| `UModal` via `useOverlay` | All game modals (scenario select, strike planning, damage reports) |
| `UToast` via `useToast` | Sighting detected, ship damaged, strike inbound |
| `UTable` | Ships list in TaskGroupPanel (hull %, fires, fuel columns) |
| `UTabs` | AirOpModal: Deck Status / Airborne Missions / CAP Assignment |
| `UBadge` | Pilot experience labels; ship status indicators |
| `defineShortcuts` | `space`=pause, `1-4`=time scale, `K`=command palette, `N/P`=next/prev TG |

---

## Game Loop

```typescript
// useGameLoop.ts
function loop(timestamp: number) {
  if (!isPaused && lastTimestamp !== null) {
    const deltaMs = timestamp - lastTimestamp
    const simDeltaMs = deltaMs * timeScale * 60   // wall ms → simulated ms
    const result = engine.tick(simDeltaMs)
    if (result.stepFired) {
      forcesStore.syncFromSnapshot(result.snapshot)
      intelStore.syncFromSnapshot(result.snapshot)
      pixiRenderer.onStepComplete(result.snapshot)
    }
  }
  lastTimestamp = timestamp
  rafHandle = requestAnimationFrame(loop)
}
```

Between steps, task group tokens interpolate smoothly using `accumulatedFraction` (0→1 across a 30-min step window).

---

## Implementation Sequence

| Sprint | Focus |
|---|---|
| 1 | Project init, all TypeScript types, static data (ship classes, aircraft types) |
| 2 | Core engine headless: `dice.ts`, `hexMath.ts`, `TimeSystem`, `MovementSystem`, `GameEngine` skeleton |
| 3 | `SearchSystem`, `FogOfWarSystem`, first scenario (Midway) |
| 4 | `AirOpsSystem`, `CombatSystem`, `DamageSystem` |
| 5 | PixiJS rendering: terrain+grid, unit tokens, fog layer, MapLibre basemap |
| 6 | Vue HUD: `TimeControls`, `TaskGroupPanel`, all modals, keyboard shortcuts |
| 7 | Remaining scenarios, balance tuning, deployment (NuxtHub / Vercel) |

---

## Deployment

**Local development (primary)**
```bash
pnpm dev   # http://localhost:3000
```
No external accounts or API keys needed to run. MapLibre tile layer is optional — if `NUXT_PUBLIC_MAPTILER_KEY` is absent it falls back to PixiJS-drawn terrain tiles.

**NuxtHub / Vercel** — deferred until the game is playable locally. Will be addressed in a later sprint.

---

## Verification

1. `pnpm dev` — scenario select screen loads, click Midway, game canvas renders hex grid
2. Click Play — time advances, task group tokens move across map
3. Assign search order to a TG — after 1–2 steps, sighting toast appears for enemy contact
4. Issue strike order — flight path arc renders, after ETA step combat resolves, damage toast fires
5. Pause/resume with `space`, change time scale with `1-4`
6. `pnpm build && pnpm preview` — production build runs correctly before any deployment step
