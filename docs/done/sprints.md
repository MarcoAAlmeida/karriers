# Sprint Log

Most recent sprint always on top.

---

## Sprint 19 — Damage Consequences *(Bug 1)*

**Goal:** Sinking a carrier matters. Losses cascade through aircraft and deck operations. Builds on `ScenarioDefinition` and per-squadron `aircraftCount` from Sprint 18.

- Gate all mission launches on carrier `status !== 'sunk'`; cancel pending orders on sink event.
- On sink: squadrons on deck are lost; airborne squadrons lose their home and search for an alternative carrier within range.
- Recovery rerouting: find nearest friendly carrier with deck space; recover there or ditch.
- Over-capacity cap (nominal + 20%): reduced sortie rate, higher fuel burn, hard recovery block above cap.
- Aircraft attrition: `aircraftCount` (loaded from scenario JSON) decrements permanently on combat/flak loss; squadron disbanded at zero.
- Fuel exhaustion mid-flight: aircraft lost at sea if return fuel insufficient; player can knowingly launch a one-way strike.
- **Tests:** Sunk carrier issues no orders; orphaned strike finds alternate carrier; orphaned strike ditches when no carrier is in range; over-cap penalties reduce sortie rate; `aircraftCount` reaches zero and squadron is removed; one-way strike resolves correctly. 113/113 unit tests across 10 files — all green in < 1 s.

---

## Sprint 18 — JSON Scenario Files

**Goal:** Scenarios live in `public/scenarios/` as plain JSON. Edit a file, refresh — no rebuild.

- New definition types in `game/types/scenario.ts`: `ScenarioDefinition`, `ScenarioForceDefinition`, `TaskGroupDefinition`, `ShipDefinition`, `SquadronDefinition`. Each `SquadronDefinition` carries `aircraftTypeId` and `aircraftCount` (authoritative headcount for Sprint 19 attrition). `Scenario` gains optional `alliedFuelPool` / `japaneseFuelPool` fields.
- `public/scenarios/manifest.json`: lists Midway (medium) and Coral Sea stub (easy).
- `public/scenarios/midway.json`: full Midway definition — ships and squadrons nested under their task group; side and `taskGroupId` derived by loader; `alliedFuelPool: 15000`, `japaneseFuelPool: 12000` (placeholder values for Sprint 20 tuning).
- `game/data/scenarioRepository.ts`: `fetchManifest()`, `fetchScenario(id)`, and exported `scenarioFromDefinition()` denormaliser. Appends `SHIP_CLASSES` + `AIRCRAFT_TYPES` reference data; fills ship/squadron defaults (`hullDamage`, `fuelLevel`, `deckStatus`, etc.).
- `ScenarioSelectScreen.vue`: async manifest fetch on mount with loading spinner; per-scenario launch spinner; `fetchScenario(id)` replaces the hardcoded `MIDWAY` import.
- `midway.ts` retained as TS reference; not used in the game flow.
- **Bug fixes:** three pre-existing test failures resolved — missing `engine.resume()` in CAP test; OS2U Kingfisher scout target out of range (80 hexes vs 20-hex limit); `makeZeroSq` used non-existent `aircraftTypeId: 34` (Zero is ID 30).
- **Tests:** 11 new tests in `tests/data/scenarioRepository.test.ts` — round-trip ship/TG/squadron fidelity, fuel pool presence, `aircraftCount` mutation, `maxAircraftCount` override, manifest structure, manifest fetch error, scenario fetch success, missing-ID rejection. 106/106 unit tests + 25/25 E2E tests green.

---

## Sprint 17 — Enemy AI, CAP & Scout Missions

**Goal:** Japan plays back. The game has no tension until the enemy acts.

- Implement a `JapaneseAI` controller that issues orders each game step on behalf of all Japanese task forces.
- Initial AI behavior (rule-based heuristic):
  - Detects Allied TFs within search range using existing `SearchSystem`.
  - Launches scout missions before committing to strikes (`getScoutSquadrons()`).
  - Launches strike waves toward the nearest detected Allied carrier/TF.
  - Returns planes and re-arms before launching follow-up strikes.
  - Launches CAP fighters when an Allied inbound strike is detected (`hasInboundStrikeToward()`).
  - Moves TFs to close distance when no target is in range.
- Wire AI controller into the game loop (runs after player orders, before simulation step).
- **CAP missions** (`MissionType = 'cap'`): fighters orbit their assigned TF; incoming strikes
  trigger air combat resolution in `CombatSystem` before reaching the target. Full UI in
  `AirOpModal` (CAP tab, launch fighters, active CAP display). CAP orbit shown as rotating dots
  around defended TF (`drawCAPRings()`).
- **Scout missions** (`MissionType = 'scout'`): squadrons fly to a target hex; detections feed
  `SearchSystem` and create confirmed contacts. Scouts shown as triangles on the map.
- Add tests: AI launches at least one strike per scenario, AI does not crash when no targets are visible.


## Sprint 16 - small adjustments to existing ui

- no more toasts for now
- indicator All Systems Operational must be green when simulation is on, red when paused (currently always green)
- overall speed is to fast, make 30% slower
- range circles for selected units must be highlighted in the map, maye yellow or white, but visible


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


## Sprint 14 — Clickable In-Flight Squadrons

**Goal:** Players can inspect any moving squadron, not just carrier groups.

- In-flight squadron dots are currently display-only. Make them interactive.
- Click on any moving strike or scout dot on the map → opens the per-strike detail popup (from Sprint 16).
- Hover tooltip: squadron name, mission, target, ETA.
- Selection highlight: clicked squadron dot pulses or changes color while popup is open.
- Ensure hit-testing works correctly when multiple dots overlap (z-order picker or small disambiguation menu).
- Tests: click on a strike dot opens correct popup, hover shows tooltip, disambiguation works with overlapping dots.


## Sprint 13 — Strike Event Log & Per-Strike Detail Popup (completed 2026-04-06)

**Goal:** Players can see what happened and why. Feedback closes the gameplay loop.

### Delivered

#### Bug fix — auto-speed removed (`app/composables/useGameEvents.ts`, `tests/e2e/golden-flow.spec.ts`)
- Removed `enemyCarrierDown`, `autoSpeedFired` refs and the `watch(() => forcesStore.squadrons, ...)` block that forced 8× when an enemy carrier sank and all allied planes returned — this was production gameplay code written to pass a test rather than serve the player
- Removed the corresponding `waitForFunction(timeScale === 8 || phase === 'ended')` assertion from `golden-flow.spec.ts`; the extended-flow test already sets 8× explicitly at the start, so the assertion was trivially true and no longer meaningful

#### `useModalPause` composable (`app/composables/useModalPause.ts`)
- New composable that accepts a `Ref<boolean>` (`open`) and implements the modal-pause UX pattern:
  - On open: if the simulation is running, records `wasRunning = true` and calls `gameStore.togglePause()`
  - On close: if `wasRunning` was set, calls `togglePause()` to resume — leaving the game unaffected if the player had already paused before opening
- Applied to `AirOpModal` (`open` model), `OrderModal` (`open` model), and command palette (`showCommandPalette`) in `GameHUD`
- `launchStrike()` in `AirOpModal` no longer manually calls `togglePause()` — just closes the modal and `useModalPause` handles resume uniformly for all close paths (launch, cancel, Escape)

#### Engine — `strike-launched` events (`game/engine/GameEngine.ts`)
- `runStep()` now captures the return value of `airOpsSystem.processStep()` (previously discarded)
- For each newly created strike plan, pushes `{ type: 'strike-launched', flightPlanId, at }` into `pendingCombatEvents`
- Events flow through `buildSnapshot().combatEvents` → `intelStore.syncFromSnapshot()` → `intelStore.combatLog` on the next RAF tick

#### `EngagementEventsPanel` enhanced (`app/components/game/EngagementEventsPanel.vue`)
- `strike-launched` entries: look up `FlightPlan` from `forcesStore` to show carrier name and target hex (e.g. "Strike from Task Force 16 → (42, 28)"); dot color blue
- `strike-resolved` entries: now carry `flightPlanId` alongside the existing summary text; dot color amber
- All strike entries (both types) have `data-testid="strike-entry"`, a right-chevron affordance, and `cursor-pointer` with hover highlight
- Click emits `view-strike(flightPlanId)` to parent; non-strike entries are non-interactive
- Added `data-testid="events-panel-toggle"` on the toggle strip and `data-testid="events-panel-body"` on the panel content for E2E targeting

#### `StrikeDetailModal` (`app/components/game/StrikeDetailModal.vue`)
- New `UModal` component using `useModalPause(open)` — pauses the simulation when opened
- Reads `forcesStore.flightPlans`, `forcesStore.squadrons`, `forcesStore.taskGroups`, `forcesStore.ships`, and `intelStore.combatLog` (looking for a matching `strike-resolved` event)
- **Mission card**: squadron names (joined), origin carrier, target (TG name if resolved, hex if in-flight), launch time, ETA / resolved-at time
- **Aircraft card**: planes lost, planes returning (if resolved), CAP losses (if `airCombat` present), flak losses (if resolved)
- **Combat results card** (resolved only): per-hit breakdown (ship name, damage type, fires started), narrative lines from `StrikeResult.narrative`
- `data-testid="strike-detail-modal"` on modal content wrapper

#### `index.vue` wiring
- `selectedStrikePlanId: ref<string | null>` and `strikeModalOpen: ref(false)` state
- `openStrikeDetail(planId)` handler called by `@view-strike` from `GameEngagementEventsPanel`
- `GameStrikeDetailModal` rendered outside the shell flex-row to avoid stacking context issues

#### E2E tests (`tests/e2e/strike-detail.spec.ts`) — 2 new tests
- **Entry + popup test**: loads Midway, opens events panel, runs at 8× until contact, launches a strike via action bridge, resumes to fire the step, waits for `combatLogLength` to grow, asserts `strike-entry` is visible, clicks it, asserts modal shows `strike` badge and `Task Force 16`
- **Pause lifecycle test**: same setup, but leaves the game running before clicking the entry; asserts `isPaused === true` immediately after modal opens, presses Escape to close, asserts `isPaused === false` (simulation resumed)

### Architecture notes
- `useModalPause` uses `wasRunning` as a per-invocation flag rather than a global — each modal instance independently tracks whether it was the one that caused the pause, preventing double-resume when two modals are mounted simultaneously
- `strike-launched` events are only emitted for `plan.mission === 'strike'`; CAP and search launches are silent for now
- `StrikeDetailModal` finds its `StrikeResult` by scanning `intelStore.combatLog` for `type === 'strike-resolved'` with matching `flightPlanId` — no separate store state needed
- The modal is placed in `index.vue` (not inside `GameHUD`) so it renders at the top of the component tree and avoids the `pointer-events: none` wrapper in the HUD overlay

---

## Sprint 12 — Tactical Map UI Layout & MVP Shell (completed 2026-04-06)

**Goal:** Deliver a new command-center shell that makes the Tactical Map the app's primary MVP experience, while reusing existing components and avoiding gameplay rewrites.

### Delivered

#### Shell components (`app/components/shell/`)
- **`TopStatusBar.vue`**: full-width 40 px header bar (`h-10`); left-side nav toggle (chevron button), `Karriers` brand in sky-blue, `Tactical Map` label, flexible spacer, passive game clock (reads `gameStore.currentTime`, same format as TimeControls but display-only), status dot + "All Systems Operational" text; `data-testid="shell-top-bar"`
- **`NavSidebar.vue`**: left nav strip with independently collapsible width (`w-13` collapsed / `w-44` expanded via transition); icons for Tactical Map (active, sky-blue highlight), Units, Missions, Intel (visual placeholders, no live content), Settings pinned to bottom; tooltips on collapsed icons via `title`; `data-testid="shell-nav-sidebar"`

#### `EngagementEventsPanel` (`app/components/game/EngagementEventsPanel.vue`)
- Right-side collapsible panel with 20 px toggle strip (always visible, independent collapse); opens to 288 px
- Pulls from `intelStore.sightingLog` (confidence ≥ 40, not false reports) and `intelStore.combatLog` (strike-resolved, ship-damaged, ship-sunk)
- Color-coded dot per event type: sky (sighting), amber (strike resolved), orange (ship hit), red (ship sunk)
- Entries sorted newest-first; auto-scrolls to top on new events
- `data-testid="engagement-events-panel"` on outer wrapper; `data-testid="events-panel-toggle"` on toggle strip

#### `index.vue` restructure
- Menu phase (`phase === 'menu'`) renders `ScenarioSelectScreen` full-screen — unchanged
- Game phase wraps canvas in the new shell: `ShellTopStatusBar` + row of (`ShellNavSidebar` + canvas area + `GameEngagementEventsPanel`)
- Canvas area is `relative flex-1 overflow-hidden`; `GameCanvas` and `GameHUD` remain `absolute inset-0` inside it — all existing HUD overlay positioning (TimeControls, TaskGroupPanel, MiniLog) unaffected
- `navExpanded` and `eventsOpen` independent `ref` state in `index.vue`
- Root outer `<div>` loses `bg-gray-950`; shell uses `bg-slate-950` for the sea-blue palette shift

#### Palette
- New components use `bg-slate-900`, `border-slate-700`, `text-slate-400/300/200` instead of pure grays — cosmetically shifts the app toward a darker sea-blue tone without touching existing components

#### Auto-speed bug fix (`app/composables/useGameEvents.ts`)
- Removed `SHIP_CLASSES` import and `enemyCarrierDown` / `autoSpeedFired` state
- Removed the `watch(() => forcesStore.squadrons, ...)` block that ramped to 8× during gameplay after a carrier kill — this was artificial behavior added to satisfy a test assertion
- `ShipSunk` handler still shows the toast; the carrier-detection logic is gone
- `golden-flow.spec.ts` extended-flow test: removed `waitForFunction(timeScale === 8)` assertion (the test already sets 8× at the start; the assertion was trivially true)

### Architecture notes
- All existing `data-testid` selectors used by E2E tests (`hud-time-controls`, `play-pause-btn`, `game-canvas`, `tg-panel`, `air-ops-btn`) are unchanged — 19/19 tests pass without modification
- `TopStatusBar` passive clock reads `gameStore.currentTime` directly (not `stepFraction`-interpolated) — sufficient for a status bar; the precise interpolated clock stays in `TimeControls`
- Left nav placeholder tabs use `cursor-default` to signal they are not yet interactive

---

## Sprint 11 — Strike UX + Golden Flow E2E (completed 2026-04-05)

**Goal:** Make strike missions feel real to the player, prove the core loop with automated E2E tests, and add quality-of-life improvements to the Air Ops modal.

### Delivered

#### Renderer — animated strike dot (`app/composables/usePixiRenderer.ts`)
- `planOriginPx: Map<string, {x,y}>` captures the carrier's pixel position the moment a plan first goes `airborne` — arc no longer warps as the carrier moves
- `strikeDotLayer: Graphics` (new layer between flight paths and selection ring) redrawn every Pixi frame
- `bezierPoint(t, p0, cp, p1)` helper evaluates `B(t)` on the same quadratic bezier as the static arc
- **Outbound dot** (amber): `t = (nowMin − launchMin) / (etaMin − launchMin)` + `stepFraction × 30` for sub-step smoothness
- **Return dot** (grey): `t = (nowMin − etaMin) / (returnEtaMin − etaMin)`, tracks back to current carrier position
- `onFlightPlansChanged` replaces the old bare watcher — captures origins for new plans, prunes stale ones, then calls `drawFlightPaths`
- Return arc added to `drawFlightPaths` for `returning` plans (dimmer, thinner line)

#### Renderer — sunk ship markers (`usePixiRenderer.ts`, `intelligence.ts`, `combat.ts`, `GameEngine.ts`)
- `ship-sunk` `CombatEvent` extended with `hex: HexCoord` (TG position at time of sinking)
- `emitShipSunk` in `GameEngine` looks up the TG position and includes it in the event
- `sunkMarkers: ref<Array<{hex, side, shipId}>>` added to `useIntelligenceStore`; populated from incoming `ship-sunk` events, deduplicated by `shipId`, cleared on `returnToMenu`
- `sunkMarkerLayer: Container` (new layer between contacts and units) rebuilt whenever `intelStore.sunkMarkers` changes
- Each marker: 30 px dark-red diamond (larger than the 24 px contact diamond it replaces) with bold red `✕` glyph — visible at default zoom, drawn at the sinking hex so it overlays the contact position

#### Auto-speed after decisive moment (`app/composables/useGameEvents.ts`)
- `SHIP_CLASSES` imported; `ShipSunk` handler now cross-references `classId` to detect enemy carrier kills; sets `enemyCarrierDown = ref(false)` flag
- New `watch(() => forcesStore.squadrons, ...)` inside `attachToEngine`: when `enemyCarrierDown` is true and no allied squadron has `deckStatus === 'airborne'`, fires `setTimeScale(8)` and shows "All aircraft recovered — Advancing to maximum speed" info toast
- `autoSpeedFired` guard prevents repeated triggers; both flags reset via `clearUnsubs` on engine change / unmount

#### Air Ops modal UX (`app/components/menus/AirOpModal.vue`)
- **Select All / Deselect All** button in the squadron header row (visible when ≥1 squadron available); `allSelected` computed drives the label toggle
- **Auto-close + auto-resume**: `launchStrike()` now calls `open.value = false` then `if (gameStore.isPaused) gameStore.togglePause()` — modal disappears and simulation resumes in one click

#### `__GAME_STATE__` + `__GAME_ACTIONS__` extensions (`app/plugins/gameState.client.ts`)
- Ships now include `isCarrier: boolean` (derived from engine `shipClasses` lookup)
- `contacts[]` array added: `id`, `lastKnownHex`, `contactType`, `confirmedTaskGroupId`
- `sunkMarkers[]` array mirrors `intelStore.sunkMarkers`
- `timeScale` added to top-level state
- `__GAME_ACTIONS__` extended with `togglePause()` — lets Playwright resume the engine without fighting modal overlays
- New `data-testid` attributes: `air-ops-btn`, `strike-squadron-row`, `strike-target-select`, `air-ops-airborne-content`

#### E2E tests (`tests/e2e/golden-flow.spec.ts`) — 6 new tests, **19/19 passing (~32 s)**
- **Step 1**: scenario loads paused with action bridge available
- **Step 2**: time runs, sighting appears in Intel Log
- **Step 3**: Task Force 16 selectable, TG panel opens, Air Ops button present
- **Step 4**: Air Ops modal opens, Strike tab shows squadrons, Launch disabled until configured
- **Full golden flow**: sighting → TF-16 selection → squadron config → launch → airborne plan confirmed → Airborne tab re-opened and verified
- **Extended flow** (120 s budget, passes in ~7 s): resumes at 8×, waits for carrier-group contact, selects all TF-16 squadrons via UI, launches, waits for all plans recovered, verifies Japanese carrier `status === 'sunk'` + `isCarrier === true`, verifies 0 allied squadrons still airborne, verifies `sunkMarkers` populated, verifies `timeScale === 8` (auto-speed fired)

### Architecture notes
- `planOriginPx` is written once per plan (guarded by `planOriginPx.has(plan.id)`) — prevents origin drift if the watcher fires multiple times for the same plan
- Sunk marker layer sits **below** unit tokens so live units can still be selected; above contacts so the `✕` covers the decaying orange diamond at the same hex
- Auto-speed watch is registered inside `attachToEngine` and pushed into `unsubs`, so it is torn down and re-created cleanly on every engine change — no stale closure risk
- E2E contact selection uses `contactType === 'carrier-group'` rather than `index: 1` to guarantee targeting Kido Butai rather than the out-of-range Invasion Force

---

## Sprint 10 — Playwright E2E Test Suite (completed 2026-04-05)

**Goal:** Introduce Playwright for end-to-end test automation covering initial navigation and scenario load stability, with a fully self-contained test runner.

### Delivered

- **`playwright.config.ts`** — Playwright 1.52 configured for Chromium; `webServer` block auto-starts/stops `pnpm dev` so `pnpm test:e2e` is fully self-contained; `PLAYWRIGHT_REUSE_SERVER=1` skips startup when iterating; GPU flags preserved for PixiJS WebGL headless
- **`app/plugins/gameState.client.ts`** — dev-only Nuxt plugin exposing `window.__GAME_STATE__` as a live property getter; pulls `phase`, `isPaused`, `currentTime`, `taskGroups`, `ships`, `squadrons`, `flightPlans`, `alliedContactCount`, `sightingLogLength`, `combatLogLength` from Pinia stores at read time
- **`data-testid` additions:**
  - `ScenarioSelectScreen.vue`: `scenario-card-{id}`, `play-btn-{id}`, `coming-soon-{id}`
  - `TimeControls.vue`: `hud-time-controls`, `play-pause-btn`
  - `TaskGroupPanel.vue`: `tg-panel`
  - `GameCanvas.vue`: `game-canvas`
  - `AirOpModal.vue`: `air-ops-tab-strike-content`, `launch-strike-btn`
- **`tests/e2e/home.spec.ts`** — 5 tests: title/subtitle text, dark background (computed style), Midway card + Play button, Coral Sea Coming Soon, disabled opacity
- **`tests/e2e/scenario-load.spec.ts`** — 8 tests: canvas non-zero dimensions, HUD shows 06:00, play-pause aria-label, `__GAME_STATE__` phase/TG count/allied+IJN split/ship count, paused at Mon 06:00, return to menu
- **13/13 E2E tests passing** (~19 s)

### Architecture notes
- `window.__GAME_STATE__` uses `Object.defineProperty` with a `get()` function — each Playwright `evaluate()` call gets the live store state, not a snapshot taken at plugin init
- `reuseExistingServer: !!process.env.PLAYWRIGHT_REUSE_SERVER` (not hardcoded `false`) keeps CI clean while letting developers skip the 8-second startup overhead
- `beforeEach` in `scenario-load.spec.ts` gates on `window.__GAME_STATE__.taskGroups.length > 0` (not just canvas visibility) to avoid race conditions between Playwright assertions and Pinia store hydration

---

## Sprint 9 — Automated Test Suite (completed 2026-04-05)

**Goal:** Full Vitest regression net covering the engine, Pinia stores, and component behaviour — so future sprints don't require manual playability checks.

### Delivered

- **`tests/setup.ts`** — Nuxt auto-import polyfill: sets `globalThis.defineStore`, `ref`, `computed`, `shallowRef`, `watch`, `watchEffect`, `onUnmounted`, `onMounted`, `useToast`, `defineShortcuts`; calls `setActivePinia(createPinia())` in `beforeEach` so each test gets a clean store
- **Engine tests:**
  - `tests/engine/DamageSystem.test.ts` — 12 tests: `applyHit` status transitions (`operational → damaged → on-fire → sunk`), fire spread, flooding, damage control, `processStep`, `applyStrikeHits` (deck-jam fire multiplier)
  - `tests/engine/VictorySystem.test.ts` — 10 tests: `sink-carrier`, `survive-until`, `control-hex`, `sink-total-tonnage`, points tiebreak, draw on equal points
- **Store tests:**
  - `tests/stores/forces.test.ts` — 5 tests: `syncFromSnapshot` populates all maps; derived `getters`; `shipsInGroup` returns ships for a given TG; `clear()` resets state
  - `tests/stores/game.test.ts` — 6 tests: uses `engine.events.emit('ScenarioEnded', {...})` directly to verify store handler; `phase`, `winner`, `alliedPoints`, `japanesePoints` all set correctly; `returnToMenu` resets
  - `tests/stores/intelligence.test.ts` — 6 tests: sighting and combat log prepend + cap at 100; `clear()` resets both
- **Component behaviour tests (logic-only, no DOM mount):**
  - `tests/components/MiniLog.test.ts` — 9 tests: sighting/combat/sunk entry formatting and colour classes; merge sort order
  - `tests/components/TaskGroupPanel.test.ts` — 15 tests: `shipStatusColor` all statuses; `hullColor` threshold boundaries; store integration
  - `tests/components/TimeControls.test.ts` — 6 tests: `formattedTime` formatting (day/hour/minute), `togglePause`/`setTimeScale` wiring
- **72 tests across 9 files — all green in < 1 s**

### Architecture notes
- `vitest.config.ts` `setupFiles` runs before test module resolution in Vitest's Vite-based loader, so `globalThis` polyfills land before store files import `defineStore` or `ref`
- Component behaviour tests skip jsdom/happy-dom entirely — they extract and test the pure computed/logic functions that drive the UI, not the rendered DOM
- `TypedEventEmitter.emit()` is public, enabling store tests to fire engine events directly without exposing internal store handler functions

---

## Sprint 8 — Combat Bug Fixes + Feedback UI (completed 2026-04-05)

**Goal:** Make the existing engine observable — fix bugs preventing combat from working and add UI to surface results.

### Delivered

- **CAP intercept bug fix** (`game/engine/CombatSystem.ts`): `resolveStrike()` was called with `new Map()` for `flightPlans`, so CAP fighters were never found. Fixed: `processStep` threads `flightPlans` into `resolveStrike`; signature extended with `flightPlans: Map<string, FlightPlan>`; passed through to `getCAPSquadrons`
- **ShipDamaged event** (`game/engine/GameEngine.ts`): the ship-damaged loop now names the event and emits `this.events.emit('ShipDamaged', dmgEvent)` so `useGameEvents.ts` toast handler fires on hits
- **ScenarioEnded payload extended**: `EngineEvents.ScenarioEnded` now carries `{ winner, time, alliedPoints, japanesePoints }`; `ScenarioEnded` emit in `runStep` includes actual point totals from `VictorySystem`
- **Combat Intel Log** (`app/stores/intelligence.ts` + `app/components/game/MiniLog.vue`):
  - `useIntelligenceStore` adds `combatLog = ref<CombatEvent[]>([])`, populated from `snapshot.combatEvents` in `syncFromSnapshot`, capped at 100, cleared on `clear()`
  - `MiniLog.vue` unified rewrite: `LogEntry` interface merging sightings and combat events; `sightingToEntry`/`combatToEntry` pure functions; colour classes by event type (strike-resolved amber, damaged orange, sunk red+bold); entries merged and sorted by game time, capped to 10 visible
- **End screen** (`app/stores/game.ts` + `app/components/game/GameHUD.vue`):
  - Store adds `scenarioWinner`, `alliedPoints`, `japanesePoints`; `onScenarioEnded` stores all three; `returnToMenu` resets them
  - End overlay shows colour-coded winner label (Allied Victory / Japanese Victory / Draw), side-by-side points, and a prose result line
- **Vitest setup**: `vitest`, `@nuxt/test-utils`, `@vue/test-utils` added; `"test": "vitest run"` script; `vitest.config.ts` with `node` env and `@game` alias; `CombatSystem.test.ts` (3 tests: strike resolves, CAP active when flightPlans populated, zero-survivor path)

### Architecture notes
- `onScenarioEnded` handler in `game.ts` destructures the extended payload: `function onScenarioEnded({ winner, time, alliedPoints: ap, japanesePoints: jp })` — the aliased params avoid shadowing the ref names
- `MiniLog` merge/sort uses a `sortKey` (total game minutes) on each `LogEntry` so sighting and combat entries interleave chronologically

---

## Sprint 7 — Make It Playable (completed 2026-04-04)

**Goal:** Hex-click destination, Strike Launch UI, and fog-of-war rendering — the three features needed to play the game meaningfully.

### Delivered

- **Hex-click destination** (`app/composables/usePixiRenderer.ts`):
  - `pointerup` handler now issues `set-destination` order when an allied TG is selected and the player clicks an empty hex
  - Destination `×` cross drawn on `selectionLayer` each tick via `hexToPixel(tg.destination)` — cleared automatically when TG arrives or destination is updated

- **Fog-of-war rendering** (`app/composables/usePixiRenderer.ts`):
  - Added `getContactForTG(tgId)` helper — scans `intelStore.activeAlliedContacts` for `confirmedTaskGroupId === tgId`
  - `rebuildUnitTokens` now FOW-aware: enemy TGs with no confirmed contact have their token removed; enemy TGs with a confirmed contact render an orange diamond at `contact.lastKnownHex` (not true engine position)
  - `onTick` skips interpolation for Japanese tokens (static at `lastKnownHex`)
  - Added `watch(() => intelStore.activeAlliedContacts, ...)` to retrigger `rebuildUnitTokens` when the contact picture changes

- **Strike Launch UI** (`app/components/menus/AirOpModal.vue`):
  - New **Strike** tab (4th tab) in `AirOpModal`
  - Squadron checklist filtered to `deckStatus === 'hangared' | 'spotted'` and no current mission; click-to-toggle with visual selection ring
  - Aircraft type name shown per squadron via `AIRCRAFT_TYPES` lookup
  - Target picker: dropdown from `intelStore.activeAlliedContacts` (formatted as `type @ (q, r)`) plus manual Q/R hex inputs as fallback
  - Range warning: checks each selected squadron's `maxRange` vs `hexDistance * 20 NM`; shows yellow banner if any exceed range
  - Launch button disabled until ≥1 squadron selected and target set; fires `launch-strike` order and resets form
  - Strike state resets on modal close or TG selection change

### Architecture notes
- Enemy contact tokens are positioned in `buildUnitToken` at `contactPos` (lastKnownHex) and excluded from `prevPos`/`currPos` interpolation — they simply sit at whatever position the rebuild sets
- `getContactForTG` only matches *confirmed* contacts (`confirmedTaskGroupId` set); unconfirmed sightings do not reveal specific TG identity (consistent with FogOfWarSystem design)
- `AirOpModal` is widened from `sm:max-w-lg` to `sm:max-w-xl` to accommodate the strike checklist

---

## Sprint 6 — Vue HUD, Modals & Keyboard Shortcuts (completed 2026-04-04)

**Goal:** Full interactive HUD layer — extracted components, order/air-ops modals, keyboard shortcuts, command palette, and engine event toasts.

### Delivered
- **`app/components/game/TimeControls.vue`** — extracted top bar: game time, play/pause, 1×/2×/4×/8× time scale, Menu button; aria-labels include shortcut hints
- **`app/components/game/TaskGroupPanel.vue`** — enhanced TG panel extracted from GameHUD:
  - Ship table with hull% (color-coded green→red), fire count, fuel%, status badge per row
  - 3-column stats row: order, speed, fuel state
  - "Order" button (opens OrderModal) and "Air Ops" button (opens AirOpModal) for allied TGs only
- **`app/components/game/MiniLog.vue`** — scrollable intel log (last 10 sighting reports), auto-shows on new entries, dismissable via ×
- **`app/components/menus/OrderModal.vue`** — `UModal` with 8 order buttons (standby/patrol/search/strike/intercept/escort/refuel/retire) + speed selector (15/20/25/30 kt); highlights current order
- **`app/components/menus/AirOpModal.vue`** — `UModal` + `UTabs`: Deck Status (squadron list with deckStatus badges) / Airborne Missions (flight plans with Recall button) / CAP (assigned fighters)
- **`app/composables/useGameEvents.ts`** — subscribes to engine events on mount, cleans up on unmount:
  - `StrikeInbound` → red toast 8s
  - `ShipSunk` → red/green toast 8s (by side)
  - `ShipDamaged` → warning toast 5s
  - `SightingDetected` (confidence ≥60, allied, not false) → info toast 6s
- **`app/components/game/GameHUD.vue`** — refactored to use new components; adds:
  - `defineShortcuts`: `Space`=pause, `1/2/4/8`=time scale, `K`=command palette, `N/P`=cycle allied TGs, `Escape`=dismiss modals/deselect
  - `UCommandPalette` modal (K): order commands for selected TG + speed group + TF navigation group
- **`app/app.vue`** — fixed: removed Nuxt Starter Template boilerplate (UHeader/UFooter); now minimal `<UApp><NuxtPage /></UApp>`
- **`app/pages/index.vue`** — fixed: `<ScenarioSelectScreen>` → `<MenusScenarioSelectScreen>` (Nuxt subdirectory auto-import naming)
- Build: zero TypeScript errors, clean production build

### Architecture notes
- `useGameEvents` uses `watch(() => gameStore.engine, ...)` to re-attach event subscriptions on scenario reload; unsubscribes stored as the array of functions returned by `engine.events.on()`
- Command palette groups are computed: when a TG is selected, order and speed groups appear above the global TF navigation group
- `TaskGroupPanel` imports `SHIP_CLASSES` statically for hull% calculation (`hullDamage / maxHP`) — no runtime fetch needed

---

## Sprint 5 — PixiJS Rendering & Game Canvas (completed 2026-04-04)

**Goal:** First visual milestone — render the hex map, unit tokens, and flight paths via PixiJS; wire up the scenario selection screen; make the game playable in the browser.

### Delivered
- **`app/stores/map.ts`** — viewport state (x/y/zoom), selected TG, hovered hex
- **`app/composables/useHexMap.ts`** — Vue-side wrapper around `@game/utils/hexMath`; calls `initGrid()` once on first use
- **`app/composables/usePixiRenderer.ts`** — Full PixiJS v8 renderer:
  - 7-layer stage: terrain → grid → fog → contacts → units → flight paths → selection → annotations
  - `drawTerrain()`: atoll hexes (Midway) in green, annotation label placed on world container
  - `drawGrid()`: 72×84 hex outlines in single batched `Graphics` object
  - `rebuildUnitTokens()`: allied circles (blue), IJN circles (red), enemy contacts as orange diamonds with `?`; carrier-dot indicator; TG name label
  - `onTick()` (Pixi ticker): lerp all token positions between `prevPos` / `currPos` using `gameStore.stepFraction` for smooth animation
  - `drawFlightPaths()`: quadratic bezier arcs + arrowheads for airborne strike plans
  - `drawSelection()`: gold ring around selected TG
  - Pan (drag) + zoom (wheel-toward-cursor) with viewport clamped to 0.3×–4.0×
  - `centreViewport()`: auto-fits map to window on load
  - Pointer events: token tap → select TG, drag → pan, hover → `mapStore.hoveredHex`
- **`app/composables/useMapLibre.ts`** — no-op stub; MapLibre deferred until tile key is available
- **`app/components/game/GameCanvas.vue`** — mounts PixiJS app into a `<div>` container; calls `usePixiRenderer` + `useGameLoop`
- **`app/components/game/GameHUD.vue`** — absolute overlay (pointer-events: none globally, re-enabled per control):
  - Top bar: game time (formatted day + HH:MM), play/pause, time-scale buttons (1×/2×/4×/8×), menu button
  - Selected-TG side panel: name, side badge, order, speed, position, ship status list
  - Victory fade overlay when `phase === 'ended'`
- **`app/components/menus/ScenarioSelectScreen.vue`** — scenario card grid; Midway playable, Coral Sea marked "coming soon"
- **`app/pages/index.vue`** — phase switch: `menu` → `ScenarioSelectScreen`; playing/paused/ended → `GameCanvas` + `GameHUD`
- **`game/data/scenarios/midway.ts`** — added `fuelState` to all four task groups (required field)
- Build: zero TypeScript errors, clean production build

### Architecture notes
- `usePixiRenderer` installs a Pixi ticker listener for frame-rate interpolation — the game engine and Pixi ticker run independently; the ticker just reads `gameStore.stepFraction`
- `unitTokens` map (TG id → Container) is incrementally updated on store change; tokens are never rebuilt unless the TG disappears
- The world container handles all pan/zoom via `x/y/scale` — no individual layer translation needed

---

## Sprint 4 — Air Operations, Combat & Victory (completed 2026-04-04)

**Goal:** Implement all combat systems and wire them into the engine so the simulation can fully resolve carrier battles and declare a winner.

### Delivered
- **`game/engine/AirOpsSystem.ts`** — Launch queue, ETA/returnETA computation, recovery pipeline, CAP & spotted-squadron queries; `recallMission()` forces early return.
- **`game/engine/CombatSystem.ts`** — Strike resolution pipeline: CAP intercept (quality-weighted air combat, penetration if survivors > 30% of defenders) → flak (aaStrength/400 kill rate) → hit scoring by weapon type (torpedo 18hp+20 flooding, dive-bomb 12hp+1 fire, level 8hp). Prioritises carriers as targets.
- **`game/engine/DamageSystem.ts`** — Per-step damage: fire spread (22%), damage control (dcRate×0.55), fire hull damage (4hp/fire/step), flooding (8%×risk/step). `applyStrikeHits()` multiplies fires ×2.5 when spotted aircraft are on deck (Kido Butai scenario).
- **`game/engine/SurfaceCombatSystem.ts`** — Up to 4 surface rounds per step, 8% hit chance, armor mitigation, carriers auto-retreat at 90% probability. `combatStrength` determines disengagement at <40% ratio.
- **`game/engine/VictorySystem.ts`** — Evaluates sink-carrier, sink-ship-class, control-hex, survive-until, sink-total-tonnage conditions. Awards winner by condition sweep or points-at-time-expiry.
- **`game/engine/GameEngine.ts`** — Fully wired:
  - `MutableGameState` now includes `victoryConditions: VictoryCondition[]`
  - `OrderPayload` extended with `launch-strike`, `launch-cap`, `launch-search`, `recall-mission`
  - `runStep()` sequence: Movement → Search → FogOfWar → AirOps → Combat → Damage → SurfaceCombat → Victory
  - `emitShipSunk()` helper fires `ShipSunk` event and pushes `CombatEvent`
  - `ScenarioEnded` emitted (once) when VictorySystem returns a winner; engine auto-pauses
- **`game/engine/TimeSystem.ts`** — added `get endTime()` accessor (needed by VictorySystem via GameEngine)
- **`app/composables/useScenarioLoader.ts`** — now passes `scenario.victoryConditions` into state
- Build: zero TypeScript errors, clean production build

### Architecture notes
- `DamageSystem` is constructed before `CombatSystem` and injected — shared instance ensures strike hits and per-step fire/flooding use the same RNG stream.
- `scenarioEnded` guard prevents duplicate `ScenarioEnded` events across multiple calls to `runStep()` in the same tick.

---

## Sprint 3 — Search, Fog of War & Midway Scenario (completed 2026-04-04)

**Goal:** Implement search & sighting with fog of war; write the first full playable scenario (Battle of Midway).

### Delivered
- **`game/engine/SearchSystem.ts`** — Per-step search resolution:
  - Finds all TGs on 'search' order, selects best scout aircraft by effective range
  - Per-enemy-TG probability: `distFactor × visFactor × experienceModifier × 0.85 max`
  - False report chance by experience: ace 3%, veteran 8%, trained 18%, green 28%
  - Contact type misidentification by experience (ID accuracy: ace 97% → green 40%)
  - False reports placed at random hex within radius 4 of true position
  - Speed/course estimates with experience-scaled noise
- **`game/engine/FogOfWarSystem.ts`** — Contact tracking per side:
  - `processStep()`: decays stale contacts (>4h = inactive), integrates new SightingReports, matches reports to existing contacts by hex or confirmed TG ID
  - `isVisible(taskGroupId, forSide, ...)` — own forces always visible; enemies only if active contact
  - `getActiveContacts(side, ...)` — sorted most-recent first
- **`game/engine/EventEmitter.ts`** — now emits `SightingDetected` per sighting in addition to `StepComplete`
- **`game/engine/GameEngine.ts`** — updated:
  - `MutableGameState` now includes `weatherZones`, `aircraftTypes`, `shipClasses`
  - `runStep()` wires SearchSystem then FogOfWarSystem in sequence
  - `GameSnapshot` includes `sightingReports[]` from latest step
  - Constructor accepts optional `seed` for deterministic RNG
- **`game/data/scenarios/midway.ts`** — Full Battle of Midway (June 4–7, 1942):
  - 4 task groups: TF-16, TF-17, Kido Butai, Invasion Force
  - 35 ships with historical names, class IDs, taskGroup assignments
  - 25 squadrons: VF/VB/VS/VT for Enterprise, Hornet, Yorktown; Zero/Val/Kate/Jake for all 4 IJN carriers + Tone/Chikuma scouts
  - 2 weather zones (NW squall concealing Kido Butai; clear near US carriers)
  - 4 victory conditions (sink carriers, defend/capture Midway)
  - Historical hex positions at 20 NM/hex (Midway q=35 r=55, KB q=23 r=43, TF-16 q=51 r=39)
- **`game/types/scenario.ts`** — `ScenarioForce` now includes `ships: Ship[]`
- **`game/data/scenarios/index.ts`** — exports `MIDWAY` and scenario manifest
- **`app/stores/intelligence.ts`** — fully implemented: contacts by side, sighting log, `isVisible()`, `syncFromSnapshot()`
- **`app/composables/useScenarioLoader.ts`** — converts `Scenario` → `MutableGameState`, calls `gameStore.initEngine()`, seeds stores with initial snapshot
- **`app/composables/useGameLoop.ts`** — now syncs `intelStore` on each `StepComplete`

### Key decisions made
- SearchSystem uses the TG's 'search' order as proxy for "scouts are airborne" — AirOpsSystem (Sprint 4) will take over detailed deck cycle management
- False reports and misidentification are computed at sighting time and stored in the report — FogOfWarSystem never "corrects" them during decay
- Terrain atoll hexes (Midway) are registered in `hexCells` at load time — SearchSystem and pathfinding treat them as impassable

### Up next (Sprint 4)
`AirOpsSystem` (deck cycle state machine), `CombatSystem` (per-plane strike resolution, flak, CAP), `DamageSystem` (fire spread, flooding, damage control), `SurfaceCombatSystem`.

---

## Sprint 2 — Core Engine Headless (completed 2026-04-04)

**Goal:** Implement the pure TypeScript game engine: hex math, pathfinding, time system, movement, and the central GameEngine orchestrator with event bus.

### Delivered
- **`game/utils/dice.ts`** — Mulberry32 seeded RNG (`createRng`, `rollD100`, `chance`)
- **`game/utils/hexMath.ts`** — Full honeycomb-grid v4 wrappers:
  - `initGrid(hexSize)` / `getHexSize()` — lazy grid singleton (72×84, flat-top)
  - `hexToPixel`, `pixelToHex` — coordinate conversion
  - `hexCorners` — 6 corner points for rendering
  - `hexDistance` — cube coordinate distance
  - `hexNeighbors` — 6 valid in-bounds flat-top neighbors
  - `hexLine` — straight-line traversal via cube interpolation
  - `hexesInRange` — all hexes within radius N
  - `speedToHexesPerStep` — knots → hexes per 30-min step (at 20 NM/hex)
  - `bearingBetween` — degrees from one hex center to another
  - `coordKey` / `keyToCoord` — stable string keys for Map/Set usage
- **`game/utils/pathfinding.ts`** — Hex A* with terrain awareness:
  - `findPath(from, to, terrain, passable)` — returns ordered `HexCoord[]` or `null`
  - `isSurfacePassable`, `isSubmarinePassable` — terrain predicates
  - `advanceAlongPath(path, hexes)` — advance N hexes along path with remainder carry
- **`game/engine/EventEmitter.ts`** — Typed event emitter (no Vue/Node dependencies)
- **`game/engine/TimeSystem.ts`** — 30-min step accumulation:
  - Wall-clock ms → simulated ms via `timeScale` (1×/2×/4×/8×)
  - `tick(deltaMs)` → `TimeTickResult` (stepFired, stepsCompleted, stepFraction)
  - `forceStep()` for debugging
  - Auto-pauses at `endTime`
- **`game/engine/MovementSystem.ts`** — Per-step task group movement:
  - Hex accumulator pattern (fractional hexes carry between steps)
  - Auto-replan path when destination changes
  - Returns `MovementResult[]` consumed by GameEngine
- **`game/engine/GameEngine.ts`** — Central orchestrator:
  - `MutableGameState` (internal, never exposed to Vue)
  - `GameSnapshot` (immutable copy emitted after each step)
  - `TickResult` (returned from `tick()` to the RAF loop)
  - `EngineEvents` typed bus: `StepComplete`, `ShipDamaged`, `ShipSunk`, `StrikeInbound`, `ScenarioEnded`
  - `issueOrder(payload)` — handles `set-order`, `set-speed`, `set-destination`
  - `createEmptyState()` factory for dev/testing
- **`app/stores/game.ts`** — Master Pinia store: engine `shallowRef`, pause/resume, time scale, scenario lifecycle
- **`app/stores/forces.ts`** — Task groups, ships, squadrons, movement paths; `syncFromSnapshot()`
- **`app/composables/useGameLoop.ts`** — RAF loop calling `engine.tick()`, syncing stores on `StepComplete`

### Key decisions made
- `@game` Vite/Nuxt alias (absolute path via `fileURLToPath`) replaces `~/game` — the `~` alias in Nuxt 4 points to `app/`, not root
- `TypedEventEmitter` constrains `Events extends Record<string, any>` (not `unknown`) to support complex event payload types
- Engine holds `shallowRef` in Pinia — prevents Vue deep-watching internal Maps/class instances
- Between steps, `stepFraction` (0–1) available for smooth token interpolation in the renderer

### Up next (Sprint 3)
`SearchSystem`, `FogOfWarSystem`, first full scenario data (Midway): initial task group positions, ship assignments, squadron deployments.

---

## Sprint 1 — Foundation (completed 2026-04-04)

**Goal:** Scaffold the project, install dependencies, define all TypeScript types, write historical static data.

### Delivered
- Nuxt 3 initialized from the official Nuxt UI template (`--template ui`)
- Dependencies installed: `@nuxt/ui`, `@pinia/nuxt`, `pinia`, `pixi.js@8`, `honeycomb-grid`, `maplibre-gl`
- `nuxt.config.ts` configured: `ssr: false`, `@pinia/nuxt` module, `~/game` alias, Vite `optimizeDeps` for game libs
- Full folder skeleton created: `game/`, `app/stores/`, `app/composables/`, `app/components/game/`, `app/components/menus/`
- All TypeScript interfaces written in `game/types/`:
  - `map.ts` — `HexCoord`, `HexCell`, `TerrainType`, `GridConfig`, `WeatherCondition`, `WeatherZone`
  - `ships.ts` — `ShipClass`, `Ship`, `TaskGroup`, `TaskGroupOrder`, `Side`, `ShipType`, `ShipStatus`
  - `aircraft.ts` — `AircraftType`, `Squadron`, `FlightPlan`, `PilotExperience`, `DeckStatus`, `MissionType`
  - `scenario.ts` — `Scenario`, `GameTime`, `ScenarioForce`, `VictoryCondition`, time utility functions
  - `combat.ts` — `StrikeResult`, `HitResult`, `SurfaceCombatResult`, `CombatEvent`, `DamageType`
  - `intel.ts` — `SightingReport`, `ContactRecord`, `ContactType`, `GameEvent`
- Static data written in `game/data/`:
  - `shipClasses.ts` — 33 ship classes (Allied + IJN carriers, battleships, cruisers, destroyers, submarines, support)
  - `aircraftTypes.ts` — 17 aircraft types (Allied + IJN fighters, dive bombers, torpedo bombers, patrol/scout)
- Scenario manifest stub in `game/data/scenarios/index.ts` (Midway, Coral Sea)
- All engine, utils, store, and composable files stubbed for future sprints
- `pnpm build` passes clean ✓

### Key decisions made
- `ssr: false` (SPA mode) — PixiJS cannot run server-side
- `~/game` alias — keeps pure TypeScript engine code outside the Nuxt `app/` tree
- Ship classes and aircraft types are statically bundled TypeScript (no network fetch, no JSON, fully type-safe)
- `pnpm` version pinned to `9.12.2` (system version); template's `10.x` requirement removed due to corepack signature issue

### Up next (Sprint 2)
Core engine headless: `dice.ts` RNG, `hexMath.ts` wrappers, `TimeSystem`, `MovementSystem`, `GameEngine` skeleton with step loop.
