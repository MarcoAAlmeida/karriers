# Karriers — Upcoming Work

Architecture reference, folder structure, engine internals, and order types live in `AGENTS.md`.
Completed sprint history lives in `docs/done/sprints.md`.

---

## Current State (end of Sprint 22)

- ✅ Full engine: movement, search, fog of war, air ops, combat, damage, victory
- ✅ PixiJS renderer: hex grid, unit tokens, animated strike dots (outbound + return), flight path arcs always originating from the strike group's live in-flight position, sunk-ship markers (red ✕ diamond), FOW contacts at lastKnownHex, selection ring
- ✅ HUD: time controls, task group panel, order modal, air ops modal (Select All), keyboard shortcuts, command palette, toasts
- ✅ Scenario: Battle of Midway (4 TFs, 35 ships, 25 squadrons, 4 victory conditions)
- ✅ Sunk markers: permanent red ✕ diamond drawn at the hex where each ship went down
- ✅ Scenario end screen: winner label, Allied/Japanese points, result line, Return to Menu
- ✅ `window.__GAME_STATE__` + `window.__GAME_ACTIONS__` dev bridge
- ✅ Game shell: TopStatusBar, NavSidebar (collapsible), EngagementEventsPanel (collapsible); sea-blue palette
- ✅ Modal pause UX: all player-input modals (AirOps, Order, command palette, StrikeDetailModal) auto-pause the simulation on open and resume on close
- ✅ `strike-launched` engine events: flow through combatLog into the events panel
- ✅ Strike event log: EngagementEventsPanel shows launches, resolutions, hits, sightings — clickable strike entries
- ✅ Per-strike detail popup: StrikeDetailModal shows squadron, carrier, target, times, aircraft losses, hit breakdown, narrative
- ✅ Japanese AI: launches scouts, then strikes; re-arms between waves; moves to close range
- ✅ CAP missions: fighter orbit, intercept resolution, AI assigns CAP on inbound strikes, orbit rings rendered
- ✅ Scout missions: player and AI send scouts; contacts fed into fog-of-war; scout triangles on map
- ✅ Clickable in-flight squadrons: click any moving dot to open strike detail; disambiguation for overlapping dots
- ✅ Range rings: search and strike range drawn around selected task groups; color-coded by side
- ✅ Damage consequences: carrier-sunk gates launches; deck squadrons destroyed on sink; airborne squadrons reroute or ditch; over-capacity deck penalties; `aircraftCount` attrition disbands squadrons; one-way strikes
- ✅ Side fuel pool: `alliedFuelPool` / `japaneseFuelPool` in `MutableGameState`; initialised from JSON scenario; `oiler` ship type with `fuelPayload`; pool decrements on launch and oiler sinking; fuel-exhaustion gates launches; both-sides-zero ends game
- ✅ CAP endurance: 90-min orbit timer fires automatically; per-mission rearm cycle (30–60 min) gates next launch; strike hits on carrier extend recovering-squadron downtime; `Ship.fuelLevel` / `TaskGroup.fuelState` decrement each step proportional to speed
- ✅ Dynamic strike targeting: `targetHex` chases moving TG via live contacts (or holds last known hex under FOW); `currentHex` lerped each step for smooth arc origin; `returnEta` re-anchored to carrier's current position on each return-leg step; bezier arcs redraw from in-flight position
- ✅ Vitest: 127 tests across 12 files — all green in < 1 s
- ✅ Playwright E2E: 25/25 tests passing; `pnpm test:e2e` fully self-contained
- ❌ Scramble alert (incoming strike warning + one-click CAP launch for player)
- ❌ MapTiler basemap
- ❌ Custom sprite art for unit tokens

---

## Design Principles

**Prioritize complete gameplay over cosmetics.** A fully playable experience with colored dots is preferable to an incomplete experience with artwork and real map tiles. Cosmetic sprints (basemap, custom tokens) are deferred until the core gameplay loop — including enemy AI, CAP, scouting, and event feedback — is solid.

**Each sprint must be independently testable.** When a sprint ends, `pnpm test` and `pnpm test:e2e` must pass in full. Every new behaviour introduced in the sprint must have at least one Vitest unit test covering the happy path and one covering the primary failure/edge case. Playwright E2E tests cover any new UI surface. A sprint is not done until its tests are green on a clean checkout with no manual setup.

---

# Upcoming Sprints

## Sprint 23 — Fuel Gauge HUD *(Bug 5)*

**Goal:** Both sides' fuel states are always visible.

- Add Allied and IJN fuel gauges to `TopStatusBar` (or `NavSidebar`) using Nuxt UI slider in read-only mode.
- Color-coded: blue Allied, red IJN; relative percentage only (absolute values are scenario-internal).
- Pulse / color-shift warning at ≤ 20% remaining.
- Gauge goes dark/empty at zero; side label shows "GROUNDED".
- **Tests:** Gauge updates reactively on mission launch; gauge updates on aircraft loss; warning state activates at ≤ 20%; gauge shows GROUNDED at zero.

---

## Sprint 24 — Evolutionary Parameter Tuner *(Item 3)*

**Goal:** Find engine constants + scenario initial values that produce balanced, tense gameplay automatically.

*Detailed plan to be written after Sprint 23 gameplay assessment.*

High-level:
- Extract magic numbers into `SimParams` (fuel rates, damage multipliers, CAP effectiveness, scenario fuel pools).
- `scripts/tune-params.ts` runs K headless `GameEngine` simulations per genome; scores on outcome balance (≈50/50 win rate) and fuel tension (≥1 side below 30% before end).
- Evolutionary loop outputs `public/params.json`; engine loads it at startup.
- Infrastructure reused later for AI opponent policy evolution.
- **Tests:** Headless runner completes a full game without throwing; `SimParams` override is applied correctly; tuner outputs valid JSON.

---

# Cosmetic Sprints (deferred until gameplay is solid)

## Sprint A — MapTiler Basemap Integration

- Fully implement `useMapLibre.ts` to render MapLibre GL with MapTiler Ocean tiles under the PixiJS canvas.
- Make PixiJS ocean layer transparent ("see-through").
- Sync viewport: wheel/drag/zoom pans both Pixi and MapLibre; anchor, scale, and lat/lon correspondence at hex `(35, 55)` ↔ `(28.21°N, 177.37°W)`.
- Fallback: PixiJS grid+terrain rendering if no MapTiler key is configured.
- Continue rendering tactical overlays: hex grid lines, flight path arcs, selection ring, unit tokens, fog of war markers.

---

## Sprint B — Custom Unit Tokens (Visual Identity v1)

**Goal:** Use the `public/assets/game/` art set for unit tokens with faction badges.

- Replace procedural squares/circles with PixiJS Sprites; shared base art per type, faction badge distinguishes sides.
- Asset naming: `fleet-carrier/fleet-carrier.png` etc. Missing: `light-carrier`, `escort-carrier`, `transport`, `oiler`.
- Status overlays: `?` for contacts, damage/fuel badges, side indicators.

---

## Sprint C — Visual Polish

- Hover/selection glow on task group tokens.
- Performance profiling (unit/overlay layers with many tokens).
- Artist handoff guide: update assets without code changes.

---

# Long-Horizon Research

## Evolutionary AI — Opponent Policy

**Goal:** Train a Japanese AI that discovers optimal tactics through self-play.

Depends on Sprint 24 infrastructure (headless runner, genome encoding, fitness scoring).
The AI policy genome replaces `JapaneseAI`'s hard-coded heuristics with evolved weight vectors.
Self-play loop co-evolves Allied and Japanese policies; fitter strategies survive across generations.
Runs entirely offline; exports a policy JSON loaded by the in-game AI at startup.
