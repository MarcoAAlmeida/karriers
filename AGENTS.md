# Karriers — Agent Instructions

Browser SPA remake of the 1984 SSG wargame "Carriers at War". Pacific WW2 carrier operations strategy game on a 72×84 hex grid at 20 NM/hex.

---

## Project docs

| File | Purpose |
|---|---|
| `docs/done/sprints.md` | Completed sprint log (most recent on top) |
| `docs/roadmap.md` | Upcoming work |
| `docs/reference/game_engine.md` | Full engine mechanics reference (step sequence, subsystems, data model) |
| `docs/vision/karriers_at_war_inspiration.md` | Original game reference |
| `docs/vision/ai.md` | AI & simulation vision — agent interface, training, persistence |
| `docs/vision/sprint-paths.md` | Sprint path options (Path A vs B); chosen: Path B |
| `docs/vision/ml-api-assessment.md` | ML/RL API surface gaps and mitigations |

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
| Persistence | NuxtHub — `hubDatabase()` (D1/SQLite), `hubBlob()` (R2), `hubKV()` |
| ORM | Drizzle ORM (schema + migrations via Drizzle Kit CLI) |
| Language | TypeScript throughout |
| Package manager | pnpm |

### LLM-readable docs for libraries

When working with these libraries, fetch the llms.txt for up-to-date API surface:

| Library | llms.txt |
|---|---|
| NuxtHub | https://hub.nuxt.com/llms.txt |
| Nuxt UI v4 | https://ui.nuxt.com/llms.txt |

---

## Engine architecture

> Full mechanics reference: `docs/reference/game_engine.md`

### Engine ↔ Vue boundary
- `GameEngine` (plain TS class) stored as `shallowRef` in `stores/game.ts`
- Vue reads `GameSnapshot` (full state) via `StepComplete` event — Pinia stores only, never `MutableGameState`
- AI agents and training pipelines read `SidedSnapshot` via `engine.getObservation(side)` — FOW-filtered, never ground truth
- PixiJS ↔ Vue communicate only via Pinia + DOM events

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
10. Engine emits `StepComplete` → stores sync from `getSnapshot()`

### Order types (`GameEngine.issueOrder`)
```typescript
{ type: 'set-order';       taskGroupId: string; order: TaskGroupOrder; destination?: HexCoord }
{ type: 'set-speed';       taskGroupId: string; speedKnots: number }
{ type: 'set-destination'; taskGroupId: string; destination: HexCoord }
{ type: 'launch-strike';   taskGroupId: string; squadronIds: string[]; targetHex: HexCoord }
{ type: 'launch-cap';      taskGroupId: string; squadronIds: string[] }
{ type: 'launch-search';   taskGroupId: string; squadronIds: string[]; searchSector: number }
{ type: 'recall-mission';  flightPlanId: string }
```

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
