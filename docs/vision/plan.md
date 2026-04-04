# Karriers — Upcoming Work

Architecture reference, folder structure, engine internals, and order types live in `AGENTS.md`.
Completed sprint history lives in `docs/done/sprints.md`.

---

## Current State (end of Sprint 6)

- ✅ Full engine: movement, search, fog of war, air ops, combat, damage, victory
- ✅ PixiJS renderer: hex grid, unit tokens, flight path arcs, selection ring
- ✅ HUD: time controls, task group panel, order modal, air ops modal, keyboard shortcuts, command palette, toasts
- ✅ Scenario: Battle of Midway (4 TFs, 35 ships, 25 squadrons, 4 victory conditions)
- ✅ Time fix: `MS_PER_SIM_MINUTE_AT_1X = 100` → steps fire every 3s at 1×; clock interpolates smoothly
- ❌ Hex-click navigation
- ❌ Strike launch UI
- ❌ Fog-of-war rendering
- ❌ MapTiler basemap

---

## Sprint 7 — Make It Playable

### 1. Hex-click destination (`usePixiRenderer.ts`)

`pointerup` already computes the world-space hex of every non-token click. Add:
- If an allied TG is selected → `gameStore.issueOrder({ type: 'set-destination', taskGroupId, destination: clickedHex })`
- Draw a destination marker (small `×` cross in `selectionLayer`) at `tg.destination`; update it reactively; clear when TG arrives

### 2. Strike launch UI (`AirOpModal.vue`)

Add a **Launch Strike** tab:
- Checklist of squadrons with `deckStatus === 'hangared' | 'spotted'`
- Target picker: dropdown from `intelStore.activeAlliedContacts`; fallback to manual q/r inputs
- Range warning if target hex exceeds squadron `maxRange` (use `hexDistance`)
- Launch button → `gameStore.issueOrder({ type: 'launch-strike', taskGroupId, squadronIds, targetHex })`

### 3. Fog-of-war rendering (`usePixiRenderer.ts`)

`buildUnitToken()` already contains the `isContact` check, but `rebuildUnitTokens` is only triggered by `forcesStore` changes. Fix:
- Add `watch(() => intelStore.activeAlliedContacts, () => rebuildUnitTokens(forcesStore.taskGroups))`
- IJN TGs with **no active contact** → hide token entirely
- IJN TGs with a contact → orange diamond at the contact's `lastKnownHex` (not true engine position)
- Requires reading contact positions from `intelStore` rather than true positions from `forcesStore`

---

## Sprint 8 — MapTiler Basemap + Visual Polish

### MapLibre integration

Goal: real Pacific Ocean geography behind the PixiJS tactical overlay.

- `GameCanvas.vue`: add `<div ref="mapEl" class="absolute inset-0" />` behind the PixiJS canvas
- `useMapLibre(mapEl)`: initialize MapLibre with MapTiler Ocean style when `NUXT_PUBLIC_MAPTILER_KEY` is set
- PixiJS ocean fill (`COL.ocean` background) becomes transparent when basemap is active
- Viewport sync: on every `wheel`/`drag` event, derive screen-center hex → `hexToLatLon()` → `map.setCenter()`; derive MapLibre zoom from `vpZoom`
- Coordinate transform anchor: Midway hex `(35, 55)` ↔ `(28.21°N, 177.37°W)`; scale 20 NM/hex
- MapTiler style: `https://api.maptiler.com/maps/ocean/style.json?key={KEY}`
- Fallback when key absent: existing PixiJS terrain tiles, no change

### Visual polish
- Hex hover highlight (faint glow on `pointermove`)
- Destination marker on map when TG has a pending `tg.destination`
- Contact confidence opacity (semi-transparent diamonds for low-confidence reports)
- Range ring overlay on TG selection (max search/strike radius)

---

## Sprint 9 — Second Scenario + Deploy

- **Battle of the Coral Sea** (`game/data/scenarios/coralSea.ts`) — May 4–8 1942; two carriers per side, no land objective
- Balance pass: review combat hit probabilities, search detection rates, victory point values
- `pnpm build && pnpm preview` full validation
- NuxtHub deploy (`npx nuxthub deploy`) — `ssr: false` is Cloudflare Pages compatible
- Set `NUXT_PUBLIC_MAPTILER_KEY` as a NuxtHub environment variable

---

## Verification Checklist

```bash
pnpm dev   # http://localhost:3000
```

1. Scenario select → click Midway → canvas loads; click ▶ → clock starts ticking within 3s
2. Click empty hex with TF selected → destination marker appears; TF moves toward it
3. Air Ops → Launch Strike tab → pick squadrons, pick contact target, launch → flight path arc renders
4. IJN TFs invisible until a search step detects them; then orange diamond at contact position
5. With `NUXT_PUBLIC_MAPTILER_KEY` set → Ocean basemap visible behind hex grid
6. Scenario ends → victory screen; Back to Menu → scenario select
7. `pnpm build` → zero TypeScript errors
