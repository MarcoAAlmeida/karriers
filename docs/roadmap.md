# Karriers — Upcoming Work

Architecture reference, folder structure, engine internals, and order types live in `AGENTS.md`.
Completed sprint history lives in `docs/done/sprints.md`.

---

## Current State (end of Sprint 13)

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
- ❌ MapTiler basemap
- ❌ Custom sprite art for unit tokens
- ❌ Japanese AI (no enemy strikes yet)
- ❌ CAP missions
- ❌ Scout/reconnaissance missions
- ❌ Clickable in-flight squadrons

---

## Design Principle

**Prioritize complete gameplay over cosmetics.** A fully playable experience with colored dots is preferable to an incomplete experience with artwork and real map tiles. Cosmetic sprints (basemap, custom tokens) are deferred until the core gameplay loop — including enemy AI, CAP, scouting, and event feedback — is solid.

---

# Gameplay Sprints

## Sprint 14 — Clickable In-Flight Squadrons

**Goal:** Players can inspect any moving squadron, not just carrier groups.

- In-flight squadron dots are currently display-only. Make them interactive.
- Click on any moving strike or scout dot on the map → opens the per-strike detail popup (from Sprint 16).
- Hover tooltip: squadron name, mission, target, ETA.
- Selection highlight: clicked squadron dot pulses or changes color while popup is open.
- Ensure hit-testing works correctly when multiple dots overlap (z-order picker or small disambiguation menu).
- Tests: click on a strike dot opens correct popup, hover shows tooltip, disambiguation works with overlapping dots.

## Sprint 15 — Ranges & Icons

**Goal:** represent detection and engagement ranges for each unit, and normalize icons

a bit of polish to make further sprints more intuitive and visually clear:

- make it easier to click on a squadron, as it´s hard to click on a small dot when its moving across the screen
- Add range rings around each unit: search range for carriers, strike range for planes, detection range for scouts. Color-code by team (red for IJN, blue for US).
- teams are red and blue, incidentally IJN and US
- use red squares for IJN carrier groups, and blue squares for US
- use red circles for IJN squadrons, and blue circles for US
- use red triangles for IJN scouts, and blue triangles for US
- sunk carriers are red ✕ diamonds, for both sides
- just one icon per map position, if multiple units occupy the same hex, here is the order sunk > group > contact (meaning if sunk, all I see is the red X))
- use red dot for IJN squadrons, and blue dots for US

## Sprint 16 — Enemy AI (Japanese Strike Operations)

**Goal:** Japan plays back. The game has no tension until the enemy acts.

- Implement a `JapaneseAI` controller that issues orders each game step on behalf of all Japanese task forces.
- Initial AI behavior (rule-based heuristic):
  - Detects Allied TFs within search range using existing `SearchSystem`.
  - Launches strike waves toward the nearest detected Allied carrier/TF.
  - Returns planes and re-arms before launching follow-up strikes.
  - Moves TFs to close distance when no target is in range.
- Wire AI controller into the game loop (runs after player orders, before simulation step).
- Tune aggression so Midway feels historically plausible but beatable.
- Add tests: AI launches at least one strike per scenario, AI does not crash when no targets are visible.

---

## Sprint 17 — Scout / Reconnaissance Missions

**Goal:** Both sides can send scouts. Detection creates tension and drives decisions.

- Add `MissionType.Scout` alongside existing strike missions.
- Scout squadrons fly a search pattern over a target hex area; if an enemy TF is within their search radius, it becomes a confirmed contact.
- Player UI: scout assignment in the Air Ops modal (select squadron → Scout → target hex).
- Japanese AI schedules scout missions before committing to strikes (mirrors historical doctrine).
- Contacts discovered by scouts are time-stamped and fade if not re-confirmed (existing FoW rules apply).
- Distinguish scout contact markers visually from unconfirmed radar contacts (different icon or color dot).
- Tests: scout mission completes, contact revealed, FoW updated correctly.

---

## Sprint 18 — CAP (Combat Air Patrol) Missions

**Goal:** Defending carriers can intercept incoming strikes. Defense matters.

- Add `MissionType.CAP` to the air ops system.
- CAP fighters orbit their assigned TF hex; when an incoming enemy strike enters intercept range, an engagement is triggered before the strike reaches its target.
- Engagement reduces strike effectiveness proportional to CAP strength vs. strike size (simple formula first, tunable later).
- Player UI: CAP assignment in the Air Ops modal (select fighter squadron → CAP → assigned TF).
- Japanese AI assigns CAP to its carriers based on perceived threat level.
- Visual: CAP fighters shown as a small rotating dot ring around their assigned TF (distinct from strike dots).
- Tests: CAP intercepts a strike, reduces damage, CAP fighters land and re-arm correctly.

---

## Sprint 19 — Scramble on Incoming Strike Detection

**Goal:** Warning → decision → action. Creates the "scramble" moment that defines carrier warfare.

- When a scout or search contact reveals an incoming enemy strike wave (enemy planes in flight toward a friendly TF), fire a `INCOMING_STRIKE_WARNING` event.
- Trigger a non-blocking alert toast with target TF name, estimated time to arrival, and a one-click "Launch CAP" shortcut.
- If the player has idle fighters and no CAP assigned, the alert prompts with a suggested CAP assignment.
- Japanese AI responds symmetrically: scrambles CAP if Allied strike is detected inbound.
- Tests: warning fires correctly, CAP can be assigned from the alert, no double-alerts per wave.

---



---

# Cosmetic Sprints (deferred until gameplay is complete)

## Sprint A — MapTiler Basemap Integration

- Fully implement `useMapLibre.ts` to render MapLibre GL with MapTiler Ocean tiles under the PixiJS canvas.
- Make PixiJS ocean layer transparent ("see-through").
- Sync viewport: wheel/drag/zoom pans both Pixi and MapLibre; anchor, scale, and lat/lon correspondence at hex `(35, 55)` ↔ `(28.21°N, 177.37°W)`.
- Fallback: PixiJS grid+terrain rendering if no MapTiler key is configured.
- Refactor remaining terrain-drawing logic out of Pixi except for overlays (range ring, target markers, etc).
- Continue rendering tactical overlays: hex grid lines, flight path arcs, selection ring, unit tokens, fog of war markers.

---

## Sprint B — Custom Unit Tokens (Visual Identity v1)

**Goal:** Use the new `public/assets/game/` art set for unit tokens, then layer faction badges/chips so shared base art can represent both Allied and Japanese forces.

- Replace procedural circles with PixiJS Sprites sourced from `public/assets/game/`:
  - `fleet-carrier`, `battleship`, `heavy-cruiser`, `light-cruiser`, `destroyer`, `submarine`, `plane`
  - Shared base art per type; small faction badge or colored chip distinguishes Allied vs. Japanese.
- Asset naming pattern: each folder is a canonical key; main icon named to match (`fleet-carrier/fleet-carrier.png`).
- Missing canonical assets for this sprint: `light-carrier`, `escort-carrier`, `transport`, `oiler`.
- Status overlays: `?` for contacts, damage/fuel badges, side indicators.

---

## Sprint C — Visual Polish and Advanced Features

- Range ring overlays (search/strike range).
- Destination and selection markers.
- Hover/selection glow.
- Animated flight path arcs.
- Performance profiling (unit/overlay layers with hundreds of tokens).
- Artist handoff guide: update assets without code changes.

---

# Long-Horizon Research

## Evolutionary AI — Machine Learning Opponent

**Goal:** Train a Japanese AI that discovers optimal tactics through self-play rather than hand-coded rules.

This is a far-future initiative, noted here to shape architecture decisions made sooner.

- **Approach:** Evolutionary / genetic algorithm where each "genome" encodes a Japanese tactical policy (weighting functions over game state: target priority, scout timing, CAP allocation, strike timing, TF routing).
- **Fitness function:** score achieved by Japan across N simulated Midway runs against a fixed Allied player or a co-evolving Allied policy.
- **Self-play loop:** populations of policies play against each other; fitter policies survive and mutate; over generations, dominant strategies emerge.
- **Why evolutionary over deep RL:** the game state is small and turn-based; evolutionary methods are interpretable, require no GPU, and produce strategies that can be inspected and tuned by hand.
- **Integration path:** the rule-based `JapaneseAI` from Sprint 12 provides the first genome template; the evolutionary trainer runs offline (Node script) and exports a trained policy weight set that the in-game AI loads at runtime.
- **Long-term possibility:** Allied policy co-evolves alongside Japanese policy, producing historically interesting arms-race dynamics within the scenario constraints.

This should be kept in mind when designing the AI interface in Sprint 12: prefer a data-driven policy object (weights/parameters) over hard-coded logic, so the evolutionary trainer can swap in trained genomes later.
