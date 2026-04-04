# Karriers — Agent Instructions

A browser SPA remake of the 1984 SSG wargame "Carriers at War". Pacific WW2 carrier operations strategy game.

## Project state

See `docs/done/sprints.md` for completed sprint log (most recent on top).
See `docs/vision/plan.md` for the full architecture and implementation plan.
See `docs/vision/karriers_at_war_inspiration.md` for the original game reference.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Nuxt 3, `ssr: false` (SPA) |
| UI | Nuxt UI v3 (`@nuxt/ui`) |
| State | Pinia (`@pinia/nuxt`) |
| Hex math | `honeycomb-grid` |
| Map renderer | PixiJS v8 |
| Geo basemap | MapLibre GL JS (optional) |
| Language | TypeScript throughout |
| Package manager | pnpm 9.12.2 |

## Repo layout

```
app/              # Nuxt app — Vue components, composables, stores, pages
game/             # Pure TypeScript engine — ZERO Vue/Nuxt imports allowed here
  types/          # All shared TypeScript interfaces (source of truth)
  data/           # Static historical data (ship classes, aircraft types, scenarios)
  engine/         # Game simulation subsystems
  utils/          # Dice, hex math, pathfinding
docs/
  vision/         # Architecture plan, original game reference
  done/           # Completed sprint logs
```

## Rules

- `game/` must never import from `app/`, Vue, or Nuxt. It is headless TypeScript only.
- `app/stores/` are the bridge between engine and Vue — they hold `shallowRef<GameEngine>` and sync state on `StepComplete` events.
- PixiJS owns the canvas. Vue/Nuxt UI owns everything else (HUD, modals, panels).
- All ship classes and aircraft types live in `game/data/` as typed TypeScript — no JSON files, no fetch calls.
- `pnpm dev` must always start cleanly. `pnpm build` must always produce a clean build.
- When adding a sprint, prepend it to `docs/done/sprints.md` (most recent on top).

## Local dev

```bash
pnpm dev      # http://localhost:3000
pnpm build    # production build
pnpm preview  # preview production build locally
```

No API keys or external accounts needed for local development.
MapLibre tile layer is optional — omit `NUXT_PUBLIC_MAPTILER_KEY` and it falls back to PixiJS terrain tiles.
