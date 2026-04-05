# Karriers — Upcoming Work

Architecture reference, folder structure, engine internals, and order types live in `AGENTS.md`.
Completed sprint history lives in `docs/done/sprints.md`.

---

## Current State (end of Sprint 10)

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
- ✅ Playwright E2E: 13/13 tests passing (~19 s); `pnpm test:e2e` fully self-contained
- ✅ `window.__GAME_STATE__` dev plugin exposes Pinia state to Playwright
- ❌ MapTiler basemap

---

## Sprint 11 — The "Golden Flow" E2E Test + Engine Stress Checks

_Goal: Prove the absolute core loop of command and execution using automated E2E tests, strictly targeting currently implemented features (ignoring ⚠️ Planned items)._

### Playwright E2E "Golden Flow"
Implement a single, bulletproof test scenario that executes the following chain:
1. **Scenario Load:** Game loads on pause at Mon 06:00.
2. **Resume Time:** Click Play and wait for a sighting to hit the Intel Log.
3. **Task Force Selection:** Use `window.__GAME_STATE__` to find TF-16 on the canvas, select it, and open the panel.
4. **Mission Prep:** Open the Air Ops modal, go to the Strike tab, and check appropriate squadrons.
5. **Launch:** Pick the target contact from the drop-down and click Launch.
6. **Verify:** Confirm that the flight plan immediately transitions to the Airborne tab with an outbound status.

### Vitest Engine Stress Tests (Non-E2E)
Add lightweight, isolated tests to verify core loop physics don't break when pushed:
- **Maximum Range Strike:** Validate that the engine accurately tracks extreme distance and successfully stops a strike launch if fuel calculations would make returning impossible.
- **Deck Jam Stressor:** Simulate high deck traffic in the engine to confirm states correctly cycle through `hangared` → `spotted` → `airborne` without skipping or double-booking squadrons.

---

# Future Sprints — UI Polish, MapTiler Basemap, and Scenario 2: Coral Sea

## Sprint A — MapTiler Basemap Integration

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

## Sprint B — Custom Unit Tokens (Visual Identity v1)

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
- Missing canonical asset types for Sprint B:
  - `light-carrier`, `escort-carrier`, `transport`, `oiler`
- Naming alignment guidance:
  - Game model uses canonical ship types: `fleet-carrier`, `light-carrier`, `escort-carrier`, `battleship`, `heavy-cruiser`, `light-cruiser`, `destroyer`, `submarine`, plus support types like `transport` and `oiler`.
  - Keep asset folders aligned to those canonical names where possible, and reserve non-core folders for support/extras.
- Nice to have, add simple status overlays and side indicators:
  - `?` for contacts, damage/fuel badges, small overlay icons
  - A small colored chip or badge lets shared base art serve both sides cleanly.

---

## Sprint C — Visual Polish and Advanced Features

- Implement range ring overlays (search/strike range)
- Add destination and selection markers (UX clarity)
- Hover/selection glow
- Animate flight path arcs if time allows
- Review performance (profile unit/overlay layers with hundreds of tokens active)
- Prepare guideline for future artists to update assets without code changes

---
