# Playability Testing Guide

Step-by-step manual playability test for Karriers at War. Each section maps to a future automated test.
Run this after every sprint to confirm basic game functionality.

---

## Prerequisites

Start the dev server and note the port (always 3000, may kill any process that is using it):

```bash
pnpm dev
```

Look for the line: `➜ Local: http://localhost:3000/`

---

## 1. Home Screen

**Navigate to:** `http://localhost:<port>/`

Wait ~3 seconds for Nuxt to hydrate.

**Check:**
- Background is near-black (`bg-gray-950`)
- Title "KARRIERS" renders in amber/gold, large, spaced-out letters
- Subtitle "PACIFIC CARRIER OPERATIONS · 1941–1945" visible below in gray
- Two scenario cards visible side by side:
  - **Battle of Midway** — badge: `medium`, duration: `72h`, has a **Play** button
  - **Battle of the Coral Sea** — badge: `easy`, duration: `96h`, shows **Coming soon** (no Play button)

**Future test tag:** `home-screen`

---

## 2. Load a Scenario

**Action:** Click the **Play** button on the Battle of Midway card.

Wait ~3 seconds for the game view to render.

**Check:**
- URL stays at `/` (SPA, no navigation)
- A dark blue hex grid fills the viewport
- A green hexagon labeled **Midway** is visible roughly in the center-left
- At least two blue circular tokens are visible on the map (US task forces), labeled **Task F…**
- Top bar is present with: clock (e.g. `Mon 06:00`), a play/pause button, speed buttons (`1×` `2×` `4×` `8×`), and a **Menu** button
- No console errors

**Future test tag:** `scenario-load`

---

## 3. Time Advance (Play / Pause)

**Action:** Click the **Resume** / play button in the top bar (or press `Space`).

Wait 3 seconds.

**Check:**
- Clock has advanced from its starting time (was `Mon 06:00`, should now be past `07:00`)
- Button label changed to **Pause**
- An **Intel Log** panel appeared in the bottom-left with at least one sighting entry, e.g.:
  - `D1 06:30 — US sighted surface force at …`
- At least one enemy token (orange diamond) has appeared on the map

**Action:** Click **Pause** (or press `Space`).

**Check:**
- Clock stops advancing
- Button label returns to **Resume**

**Future test tag:** `time-controls`

---

## 4. Speed Controls

With the game paused, resume it. Then click each speed button in sequence.

**Action:** Click **2×**, wait 2 seconds. Click **4×**, wait 2 seconds. Click **8×**, wait 2 seconds. Click **1×**.

**Check after each click:**
- The clicked button becomes visually active (highlighted green)
- The clock advances proportionally faster at higher speeds

**Future test tag:** `speed-controls`

---

## 5. Task Force Selection

**Action:** Pause the game. Click on one of the blue circular task force tokens on the map.

> Because task forces are drawn on a PixiJS canvas, use a pointer event at the token's pixel position:
> ```js
> canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 737, clientY: 523 }));
> canvas.dispatchEvent(new MouseEvent('pointerup',   { bubbles: true, clientX: 737, clientY: 523 }));
> canvas.dispatchEvent(new MouseEvent('click',       { bubbles: true, clientX: 737, clientY: 523 }));
> ```
> Pixel positions vary by viewport size — find tokens dynamically from game state in automated tests.

**Check:**
- A **Task Force panel** slides open on the left side
- Panel header shows task force name (e.g. `Task Force 16`) and a `US` badge
- Three stat chips are shown: **Order** (e.g. `SEARCH`), **Speed** (e.g. `15 kt`), **Fuel** (e.g. `85%`)
- A scrollable ship list is shown with columns: Ship | Hull | Fire | Status
  - Should include USS Enterprise (CV-6), USS Hornet (CV-8), and escort ships
  - All ships show `100%` hull and `operational` status at scenario start
- Two buttons at the bottom: **Order** and **Air Ops**

**Future test tag:** `tf-selection`

---

## 6. Order Dialog

**Action:** With a task force selected, click the **Order** button.

**Check:**
- A modal/dialog opens titled `Task force: Task Force 16` (or whichever TF is selected)
- Six order options are shown as buttons: **Standby**, **Patrol**, **Search**, **Strike**, **Intercept**, **Escort**, **Refuel**, **Retire**
- The current order is visually highlighted (green)
- Speed options are shown: **15 kt**, **20 kt**, **25 kt**, **30 kt** — current speed highlighted

**Action:** Click a different order (e.g. **Patrol**). Close the dialog.

**Check:**
- The TF panel now shows `ORDER: PATROL` (or whichever was selected)

**Future test tag:** `order-dialog`

---

## 7. Air Ops Dialog

**Action:** With a task force selected, click the **Air Ops** button.

**Check:**
- A modal opens with four tabs: **Deck Status**, **Airborne**, **CAP**, **Strike**
- **Deck Status** tab (default) shows a list of air groups, each with:
  - Name (e.g. `VF-6 (Fighting Six)`)
  - Aircraft count (e.g. `27 aircraft`)
  - Experience level (e.g. `veteran`, `trained`, `green`)
  - State badge (e.g. `hangared`)
- For TF16 at Midway scenario start, expect squadrons from both Enterprise and Hornet air groups

**Future test tag:** `air-ops-dialog`

---

## 8. Intel Log

**Check (after game has run for several in-game hours):**
- The Intel Log panel in the bottom-left shows timestamped entries in `D<day> HH:MM` format
- Entries describe sighting events: `US sighted [type] force at [hex]`
- Earlier entries are struck through / dimmed (read), newer ones are bold
- The close (×) button dismisses the panel

**Future test tag:** `intel-log`

---

## 9. Menu

**Action:** Click the **Menu** button in the top-right.

**Check:**
- A menu or overlay opens
- At minimum there is an option to return to the scenario select screen

**Future test tag:** `menu`

---

## Automated Test Backlog

The following tasks should be added to a future sprint to automate the above:

| Tag | Description |
|---|---|
| `home-screen` | Playwright: navigate to `/`, assert title, both scenario cards, Play button, Coming Soon |
| `scenario-load` | Playwright: click Play, wait for canvas, assert hex grid, Midway hex, TF tokens, HUD |
| `time-controls` | Playwright: resume, wait, assert clock advanced and intel log has entries |
| `speed-controls` | Playwright: cycle 1×→2×→4×→8×→1×, assert active button state each time |
| `tf-selection` | Playwright: canvas click at TF position, assert panel opens with ship list |
| `order-dialog` | Playwright: open Order dialog, assert all 8 orders present, select one, assert TF panel updated |
| `air-ops-dialog` | Playwright: open Air Ops, assert 4 tabs, assert squadron list with counts and states |
| `intel-log` | Playwright: run game, assert log populates with sighting events in correct format |
| `menu` | Playwright: click Menu, assert menu opens, assert back-to-home option |
