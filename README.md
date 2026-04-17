# Karriers

A browser-based remake of the 1984 SSG wargame *Carriers at War* — Pacific WW2 carrier operations, reimagined for the modern web.

Built for players who want the tension of fleet command and for researchers who want a fast, headless engine to train AI agents against.

---

## Highlights

**Sprint 25 — NuxtHub Persistence + FOW-Filtered Snapshots**

Every completed game is now logged to NuxtHub D1 (Cloudflare SQLite), with per-step observations that respect the fog of war — the data AI agents will train on.

```typescript
// Engine now exposes a FOW-filtered view per side:
const allied = engine.getObservation('allied')
// allied.ownTaskGroups  → full truth, your forces only
// allied.enemyContacts  → what your scouts found, nothing more

// Convert to a fixed-size feature vector for ML:
const vec = toFeatureVector(allied, 'allied')
// vec.length === 264 (frozen schema)
```

Play a game and it logs automatically — game metadata + per-step snapshots for both sides written to D1 on `ScenarioEnded`.

**Sprint 24 — Parameterised Engine + Headless Runner**

Run a full Midway battle in ~17 ms from the command line:

```bash
pnpm headless                        # fixed seed 42, default params
pnpm headless -- --seed 99           # reproducible run with seed 99
pnpm headless -- --durationSteps 48  # cap at 48 steps (24 sim-hours)
```

**What's already playable in the browser**
- Full Battle of Midway — 4 task forces, 35 ships, 25 squadrons
- Japanese AI launches scouts, then multi-wave carrier strikes
- CAP missions: fighter orbits, intercept resolution, orbit rings on map
- Scout missions: player and AI send scouts; contacts fed into fog-of-war
- Clickable in-flight squadrons with per-strike detail modal
- Strike event log with launch → resolution → hit breakdown
- Range rings around selected task groups (search + strike, color-coded by side)
- Fuel gauge HUD — Allied and IJN aviation fuel bars, amber warning at ≤20%
- Sunk-ship markers, scenario end screen, modal auto-pause

---

## Quick Start

```bash
pnpm install
pnpm dev          # open http://localhost:3000
```

Select **Battle of Midway**, press **▶ Resume**, and use the sidebar to issue orders.

---

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Development server on `http://localhost:3000` |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build locally |
| `pnpm test` | Vitest unit tests — 144 tests, ~2 s, no server needed |
| `pnpm test:e2e` | Playwright E2E tests (auto-starts dev server) |
| `pnpm headless` | Headless battle runner — prints JSON result to stdout |

---

## Tech Stack

| Layer | Technology |
|---|---|
| App framework | Nuxt 3 (`ssr: false` SPA) |
| UI components | Nuxt UI v3 |
| State | Pinia |
| Map renderer | PixiJS v8 |
| Hex math | `honeycomb-grid` |
| Language | TypeScript throughout |
| Deploy | NuxtHub (Cloudflare Pages) / Vercel fallback |

The `game/` directory is **pure TypeScript with zero Vue/Nuxt imports** — every subsystem can be instantiated and tested without a browser, and the headless runner exploits this directly.

---

## Architecture

```
game/
  engine/       GameEngine, subsystems (AirOps, Combat, Damage, Search, …)
  types/        ScenarioParams, Scenario, Ship, Squadron, FlightPlan, …
  data/         Scenario definitions (midway.ts + public/scenarios/midway.json)
  utils/        hexMath, dice, scenarioState (buildStateFromScenario)
app/
  components/   PixiJS renderer, HUD shell, modals
  stores/       Pinia stores (game, forces, intelligence, map)
  composables/  useScenarioLoader, usePixiRenderer, useGameEvents, …
scripts/
  headless.ts   CLI headless runner — no Vue, no Nuxt
tests/
  engine/       Unit tests for every subsystem
  e2e/          Playwright end-to-end tests
```

### ScenarioParams

All tuneable engine constants live in `game/types/scenario.ts` as a flat, serialisable `ScenarioParams` object. Pass any subset to `GameEngine` to override defaults:

```ts
import { GameEngine } from './game/engine/GameEngine'
import { buildStateFromScenario } from './game/utils/scenarioState'
import { MIDWAY } from './game/data/scenarios/midway'

const state = buildStateFromScenario(MIDWAY, { seed: 42, spawnMode: 'seeded' })
const engine = new GameEngine(state, MIDWAY.startTime, MIDWAY.endTime, {
  seed: 42,
  bombDamageMultiplier: 1.5,   // heavier bombs
  capEffectivenessMultiplier: 0.7, // weaker CAP
  durationSteps: 96,           // 48 sim-hours max
})
```

Spawn modes:
- `'fixed'` — scenario JSON positions (default)
- `'seeded'` — deterministic random offset, reproducible with the same seed
- `'random'` — fresh random offset each run

---

## Roadmap

| Sprint | Goal |
|---|---|
| ✅ 1–23 | Full playable Midway — AI, CAP, scouts, damage, fuel, HUD |
| ✅ **24** | **ScenarioParams + headless runner** |
| ✅ **25** | **NuxtHub D1 persistence + FOW-filtered snapshots** |
| 26 | AIAgent interface + AI vs AI watch mode |
| 27 | Evolutionary trainer — co-evolve Allied + Japanese policies |
| 28 | Browser replay from stored games |
| 29 | Parameter sweep tooling + RewardShaper |
| A–C | Cosmetic: MapTiler basemap, custom unit tokens, visual polish |
