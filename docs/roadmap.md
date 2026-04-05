# Karriers — Upcoming Work

Architecture reference, folder structure, engine internals, and order types live in `AGENTS.md`.
Completed sprint history lives in `docs/done/sprints.md`.

---

## Current State (end of Sprint 9)

- ✅ Full engine: movement, search, fog of war, air ops, combat, damage, victory
- ✅ PixiJS renderer: hex grid, unit tokens, flight path arcs, selection ring, FOW contacts at lastKnownHex
- ✅ HUD: time controls, task group panel, order modal, air ops modal + strike launch tab, keyboard shortcuts, command palette, toasts
- ✅ Scenario: Battle of Midway (4 TFs, 35 ships, 25 squadrons, 4 victory conditions)
- ✅ Hex-click destination with `×` marker
- ✅ Strike launch UI (squadron checklist, contact picker, range warning)
- ✅ Fog-of-war rendering (confirmed contacts at lastKnownHex; uncontacted IJN TGs hidden)
- ✅ CAP intercept bug fixed: flightPlans now threaded into resolveStrike → getCAPSquadrons
- ✅ ShipDamaged event emitted from engine → toast handler fires on hits
- ✅ Intel Log shows strike results, ship-damaged, and ship-sunk entries alongside sightings
- ✅ Scenario end screen: winner label, Allied/Japanese points, result line, Return to Menu
- ✅ Vitest setup: 72 tests across 9 files — engine (25), stores (17), component behaviour (30); all green in < 1 s
- ❌ MapTiler basemap

---

## Sprint 8 — Combat Bug Fixes + Feedback UI

_Goal: make the existing engine observable. All combat systems (`CombatSystem`, `DamageSystem`, `VictorySystem`) are already implemented and wired up — this sprint fixes the bugs preventing them from working and adds the UI to surface results._

### Fix CAP intercept bug

- File: `game/engine/CombatSystem.ts`
- `resolveStrike()` calls `this.airOpsSystem.getCAPSquadrons(targetTG.id, squadrons, new Map())` — passing an empty map means CAP fighters are never found
- Fix: thread `flightPlans` from `processStep` into `resolveStrike` and pass it to `getCAPSquadrons`

### Emit ShipDamaged event

- File: `game/engine/GameEngine.ts`
- In `runStep()`, after pushing `ship-damaged` to `pendingCombatEvents`, also call `this.events.emit('ShipDamaged', event)` so the toast handler in `useGameEvents.ts` fires

### Wire combat events to Intel Log

- `MiniLog.vue` and `intelligence.ts` currently only handle `SightingReport[]`; `snapshot.combatEvents` are never displayed
- Add a `combatLog` ref to `useIntelligenceStore` (or new `useCombatStore`) populated from `snapshot.combatEvents` in `syncFromSnapshot`
- Extend `MiniLog.vue` to render combat entries alongside sighting entries:
  - Strike resolved: "D1 14:30 — Strike vs Kido Butai: 3 hits, 2 aircraft lost"
  - Ship damaged: "D1 14:30 — Akagi hit (bomb), fires started"
  - Ship sunk: "D1 15:00 — Akagi sunk"
- Cap log at 100 entries, prepend newest

### Improve scenario end screen

- File: `app/components/game/GameHUD.vue` (overlay at line 32–44)
- `ScenarioEnded` payload includes `{ winner, time }` but `useGameStore.onScenarioEnded` discards the winner — add `winner` and points breakdown to store state
- Update end overlay to show: winner name, allied/japanese points, brief result line, "Return to Menu" button

### Vitest setup

- Add devDependencies: `vitest`, `@nuxt/test-utils`, `@vue/test-utils`
- Add `test` script to `package.json`
- Write smoke test for `CombatSystem`: strike resolves, CAP fires when `flightPlans` is populated (confirms the CAP bug fix)

---

## Sprint 9 — Automated Test Suite

_Goal: full regression net so future sprints don't require manual playability checks._

### Vitest unit tests (engine)

- `CombatSystem`: strike with/without CAP, flak losses, zero-survivor path, narrative output ✅ (done in Sprint 8)
- `DamageSystem`: fire spread, flooding, status transitions (`operational → damaged → on-fire → sunk`), DC efficiency
- `VictorySystem`: `sink-carrier`, `survive-until`, `control-hex`, `sink-total-tonnage`, points tiebreak on time expiry

### Vitest store tests

- `useForcesStore`: `syncFromSnapshot` populates all maps correctly
- `useGameStore`: `onScenarioEnded` sets `phase = 'ended'` and stores winner/points
- `useIntelligenceStore`: `syncFromSnapshot` prepends sighting and combat entries

### Vitest component behaviour tests

Note: store auto-imports are polyfilled via `tests/setup.ts`; Nuxt UI components are stubbed. Tests verify computed/reactive logic driving the UI without full DOM mount overhead.

- `MiniLog`: sighting entries formatted correctly; combat entries (strike, damage, sunk) format + colour class
- `TaskGroupPanel`: `shipStatusColor` maps all statuses; `hullColor` thresholds correct
- `TimeControls`: `formattedTime` formats correctly; store action calls are wired

### Playwright E2E (headless, CI-ready)

- Scenario loads, time controls work, TF selection opens panel, strike can be launched, Intel Log shows combat entry when strike resolves

---

## Sprint 10 — MapTiler Basemap Integration

### MapLibre (MapTiler) Pacific Ocean Basemap

- Fully implement `useMapLibre.ts` to render MapLibre GL with MapTiler Ocean tiles under the PixiJS canvas.
- Make PixiJS ocean layer transparent ("see-through").
- Sync viewport: wheel/drag/zoom pans both Pixi and MapLibre; anchor, scale, and lat/lon correspondence at hex `(35, 55)` ↔ `(28.21°N, 177.37°W)`.
- Fallback: PixiJS grid+terrain rendering if no MapTiler key is configured.
- Refactor remaining terrain-drawing logic out of Pixi except for overlays (range ring, target markers, etc).

#### Tactical Overlay (PixiJS):

- Continue rendering tactical overlays: hex grid lines, flight path arcs, selection ring, unit tokens, fog of war markers.
- Ensure tactical overlays sync visually on top of the geospatial basemap.

---

## Sprint 11 — Custom Unit Tokens (Visual Identity v1)

**Goal:** Use the new `public/assets/game/` art set for unit tokens, then layer faction badges/chips so shared base art can represent both Allied and Japanese forces.

- Refactor unit rendering:
  - Replace procedural circles with PixiJS Sprites/icons sourced from `public/assets/game/`:
    - `fleet-carrier`, `battleship`, `heavy-cruiser`, `light-cruiser`, `destroyer`, `submarine`, plus `plane` for air/squadron iconography
    - Use the same `fleet-carrier` base icon for Allied and Japanese carriers, with a small faction badge or colored chip for side distinction
    - Use generic cruiser/destroyer/submarine art with overlay chips if needed for side or damage state
  - Add an asset lookup layer so art can be swapped in per ship type/class later.
- Asset naming pattern:
  - Each primary asset folder is a canonical key, and the main icon file inside is named to match the folder: `fleet-carrier/fleet-carrier.png`, `battleship/battleship.png`, etc.
- Current coverage in `public/assets/game/`:
  - Covered: `fleet-carrier`, `battleship`, `heavy-cruiser`, `light-cruiser`, `destroyer`, `submarine`, `plane`
  - Extra/not canonical: `PatrolBoat`, `Rescue Ship`
- Missing canonical asset types for Sprint 11:
  - `light-carrier`, `escort-carrier`, `transport`, `oiler`
- Naming alignment guidance:
  - Game model uses canonical ship types: `fleet-carrier`, `light-carrier`, `escort-carrier`, `battleship`, `heavy-cruiser`, `light-cruiser`, `destroyer`, `submarine`, plus support types like `transport` and `oiler`.
  - Keep asset folders aligned to those canonical names where possible, and reserve non-core folders for support/extras.
- Nice to have, add simple status overlays and side indicators:
  - `?` for contacts, damage/fuel badges, small overlay icons
  - A small colored chip or badge lets shared base art serve both sides cleanly.

---

## Sprint 12 — Visual Polish and Advanced Features

- Implement range ring overlays (search/strike range)
- Add destination and selection markers (UX clarity)
- Hover/selection glow
- Animate flight path arcs if time allows
- Review performance (profile unit/overlay layers with hundreds of tokens active)
- Prepare guideline for future artists to update assets without code changes

---

## (Optional/Future) Sprint — Surface Combat

- `SurfaceCombatSystem.ts` is already implemented; surface engagements are rare at Midway and do not block the core carrier-strike loop
- Activate and tune when the core gameplay loop is proven stable

## (Optional/Future) Sprint — Scenario 2: Coral Sea

- As already described
