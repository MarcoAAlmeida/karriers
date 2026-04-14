# Karriers — Upcoming Work

Architecture reference, folder structure, engine internals, and order types live in `AGENTS.md`.
Completed sprint history lives in `docs/done/sprints.md`.

---

## Current State (end of Sprint 17)

- ✅ Full engine: movement, search, fog of war, air ops, combat, damage, victory
- ✅ PixiJS renderer: hex grid, unit tokens, animated strike dots (outbound + return), flight path arcs anchored to launch position, sunk-ship markers (red ✕ diamond), FOW contacts at lastKnownHex, selection ring
- ✅ HUD: time controls, task group panel, order modal, air ops modal (Select All), keyboard shortcuts, command palette, toasts
- ✅ Scenario: Battle of Midway (4 TFs, 35 ships, 25 squadrons, 4 victory conditions)
- ✅ Sunk markers: permanent red ✕ diamond drawn at the hex where each ship went down
- ✅ Scenario end screen: winner label, Allied/Japanese points, result line, Return to Menu
- ✅ Vitest: 72 tests across 9 files — all green in < 1 s
- ✅ Playwright E2E: 21/21 tests passing; `pnpm test:e2e` fully self-contained
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
- ❌ Scramble alert (incoming strike warning + one-click CAP launch for player)
- ❌ MapTiler basemap
- ❌ Custom sprite art for unit tokens

---

## Design Principles

**Prioritize complete gameplay over cosmetics.** A fully playable experience with colored dots is preferable to an incomplete experience with artwork and real map tiles. Cosmetic sprints (basemap, custom tokens) are deferred until the core gameplay loop — including enemy AI, CAP, scouting, and event feedback — is solid.

**Each sprint must be independently testable.** When a sprint ends, `pnpm test` and `pnpm test:e2e` must pass in full. Every new behaviour introduced in the sprint must have at least one Vitest unit test covering the happy path and one covering the primary failure/edge case. Playwright E2E tests cover any new UI surface. A sprint is not done until its tests are green on a clean checkout with no manual setup.

---

# Upcoming Sprints

## Sprint 18 — JSON Scenario Files *(Item 1)*

**Goal:** Scenarios live in `public/scenarios/` as plain JSON. Edit a file, refresh — no rebuild. This is the data foundation all subsequent sprints build on.

- New types in `game/types/scenario.ts`: `ScenarioDefinition`, `TaskGroupDefinition`, `ShipDefinition`, `SquadronDefinition`.
- Each `SquadronDefinition` carries `aircraftType` and `aircraftCount` (the finite starting inventory — the authoritative headcount for attrition in Sprint 19).
- `public/scenarios/manifest.json` lists available scenarios; `public/scenarios/midway.json` nests ships and squadrons under their task group (side and `taskGroupId` derived by loader).
- `midway.json` also declares `alliedFuelPool` and `japaneseFuelPool` (initial placeholder values; tuned in Sprint 24).
- New `game/data/scenarioRepository.ts`: `fetchManifest()` + `fetchScenario(id)` — fetches JSON, denormalises, appends `SHIP_CLASSES` + `AIRCRAFT_TYPES`, returns full `Scenario`.
- `ScenarioSelectScreen.vue`: async manifest fetch on mount; `fetchScenario(id)` on selection.
- `midway.ts` retained as a reference/fallback only; engine switches to JSON loader.
- **Tests:** Midway JSON round-trips to identical engine state as the TS reference; editing `aircraftCount` in JSON changes the in-game squadron size; manifest fetch returns at least one entry; missing scenario ID rejects gracefully.

---

## Sprint 19 — Damage Consequences *(Bug 1)*

**Goal:** Sinking a carrier matters. Losses cascade through aircraft and deck operations. Builds on `ScenarioDefinition` and per-squadron `aircraftCount` from Sprint 18.

- Gate all mission launches on carrier `status !== 'sunk'`; cancel pending orders on sink event.
- On sink: squadrons on deck are lost; airborne squadrons lose their home and search for an alternative carrier within range.
- Recovery rerouting: find nearest friendly carrier with deck space; recover there or ditch.
- Over-capacity cap (nominal + 20%): reduced sortie rate, higher fuel burn, hard recovery block above cap.
- Aircraft attrition: `aircraftCount` (loaded from scenario JSON) decrements permanently on combat/flak loss; squadron disbanded at zero.
- Fuel exhaustion mid-flight: aircraft lost at sea if return fuel insufficient; player can knowingly launch a one-way strike.
- **Tests:** Sunk carrier issues no orders; orphaned strike finds alternate carrier; orphaned strike ditches when no carrier is in range; over-cap penalties reduce sortie rate; `aircraftCount` reaches zero and squadron is removed; one-way strike resolves correctly.

---

## Sprint 20 — Side Fuel Pool + Oilers *(Bug 2)*

**Goal:** Fuel is a finite strategic resource. Sinking an oiler hurts. Reads `alliedFuelPool` / `japaneseFuelPool` from the JSON scenario loaded in Sprint 18.

- Add `alliedFuelPool` / `japaneseFuelPool` to `MutableGameState`; initialise from `ScenarioDefinition`.
- Add `oiler` to `ShipType`; `ShipClass` gains `fuelPayload`; sinking an oiler deducts payload from side pool.
- Deduct mission cost at launch: `aircraftCount × roleRate × missionRange`; lost aircraft = spent fuel.
- Fuel-exhaustion gate: side at zero pool cannot launch; both sides at zero ends the game.
- **Tests:** Pool decrements on launch; oiler sinking deducts correct payload; exhaustion gates launch attempts; game ends when both sides are exhausted; pool initialises correctly from JSON.

---

## Sprint 21 — CAP Endurance + Per-Mission Consumption *(Bug 3)*

**Goal:** CAP rotations are expensive. Running constant CAP drains aviation fuel and blocks the deck.

- CAP missions expire after ~90 min airborne; fighters are forced to return for refuel/rearm.
- Rearm cycle blocks deck operations; incoming strike during rearm extends downtime significantly.
- All missions deduct aviation fuel from side pool at rates: scout < fighter < strike (per aircraft per range unit).
- `fuelLevel` / `fuelState` on `Ship` / `TaskGroup` decrements each step proportional to speed.
- **Tests:** CAP recalled after endurance window; deck disruption blocks concurrent recovery; fuel pool decrements each step; strike launched during rearm cycle experiences extended downtime.

---

## Sprint 22 — Dynamic Strike Targeting *(Bug 4)*

**Goal:** Strikes chase moving targets. Planes come home to where the carrier is, not where it was.

- Engine: replace fixed `FlightPlan.targetHex` with a live lookup each step against the target task group's current position (or last known contact hex if target is lost to fog of war).
- Return leg: re-anchor recovery hex to home carrier's current position each step.
- Renderer: bezier arcs in `usePixiRenderer` re-computed each frame from current positions; course corrections are smooth.
- **Tests:** Target moves mid-flight and strike resolves at new position; carrier maneuvers during return and planes recover correctly; target lost to FOW — strike continues to last known hex.

---

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
