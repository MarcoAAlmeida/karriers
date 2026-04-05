# Karriers at War — Gameplay Reference

> **Audience:** This document serves both human players learning the game and AI agents reasoning about game state, writing tests, or generating scenarios.
> **Scope:** Sections marked ✅ describe current Sprint 6 behavior. Sections marked ⚠️ Planned describe intended design not yet implemented in the engine.

---

## Implementation Status at a Glance

| Feature | Status |
|---|---|
| Scenario selection screen | ✅ |
| Hex map rendering | ✅ |
| Time advance / pause / speed controls | ✅ |
| Task force selection and panel | ✅ |
| All 8 orders (issuable) | ✅ |
| Movement (patrol, intercept, escort, retire) | ✅ |
| Search system with false reports | ✅ |
| Intel Log | ✅ |
| Air Ops — Deck Status tab | ✅ |
| Air Ops — Airborne tab with Recall | ✅ |
| Air Ops — Strike tab (launch) | ✅ |
| Air Ops — CAP tab (read-only) | ✅ |
| Combat resolution (air-to-ship) | ⚠️ Planned |
| Damage system (fires, flooding) | ⚠️ Planned |
| CAP interception of incoming strikes | ⚠️ Planned |
| Surface combat | ⚠️ Planned |
| Victory / scoring | ⚠️ Planned |

---

## The Game in One Paragraph

Karriers at War is an operational carrier warfare simulation set in the Pacific, 1941–1945. The player commands task forces — not individual ships — issuing high-level directives while time flows at adjustable speed. The core tension is informational: enemy positions are hidden until search aircraft find them, and every sighting report might be incomplete or wrong. The fundamental decision is one of commitment — once a strike is launched, it cannot easily be recalled, and the enemy will strike back.

---

## The Core Loop

A game session alternates between two modes:

**Running** — The player unpauses time. Task forces move along their assigned courses, search aircraft fan out, and new sightings trickle into the Intel Log. Enemy forces advance toward their objectives. Time flows at 1×, 2×, 4×, or 8× speed.

**Paused** — The player stops time to absorb new intelligence and react. The player clicks task force tokens to open their panels, issues new orders, adjusts speeds, or launches air operations. Nothing in the world moves while paused.

The cycle repeats:
1. Resume — let the situation develop
2. Pause when Intel Log shows a sighting or when a decision must be made
3. Evaluate — where is the enemy? What is the player's fuel state? What is airborne?
4. Act — change orders, launch strikes or CAP
5. Resume — commit and wait for results

The irreversibility of commitment is central: a launched strike takes hours to reach its target and return. During that window, the carrier's deck is busy recovering aircraft and the task force is vulnerable. The player cannot hedge — they must decide, then live with the consequence.

---

## The Map

The map is a flat-top hexagonal grid at **20 nautical miles per hex**, covering a large area of the central Pacific. The full grid is 72×84 hexes.

**Terrain:**
- **Ocean hexes** — dark blue; all movement occurs here
- **Island hexes** — green with label; Midway Atoll is at hex (35, 55)

**Tokens on the map:**
- **Blue circles** — US/Allied task forces; labeled with abbreviated name (e.g. "Task F…")
- **Orange diamonds** — Enemy contacts; only visible after a sighting event. Position represents last known location.
- *(Planned)* **Aircraft icons** — active flight plans shown in motion between hexes

**Fog of war:**
Enemy task forces are not visible on the map until a Search-ordered allied task force's aircraft detects them. When detected, an orange diamond appears at the reported hex and an entry is added to the Intel Log. Contacts go stale — if the enemy moves and is not re-sighted, the orange diamond remains at the old position until a new sighting updates it. Sighting reports may misidentify the contact type (false reports).

---

## Task Forces

A **task force (TF)** is a group of ships operating together as a single unit. It has one position on the map, one active order, and one speed. All ships in a TF move together.

**Selecting a task force:** Click its token on the canvas. A panel slides open on the left side of the screen.

**The task force panel shows:**
- Name (e.g. `Task Force 16`) and side badge (`US`)
- Current **Order**, **Speed** (knots), and **Fuel** (percentage)
- Ship roster with columns: Ship name | Hull % | Fire % | Status
  - Status values: `operational`, `damaged`, `on fire`, `sunk`
- Two action buttons: **Order** and **Air Ops**

At scenario start (Midway, June 4 06:00), all allied ships begin at 100% hull, no fires, operational.

---

## Orders

Orders are issued via the **Order** button on the task force panel. A dialog opens showing all available orders and speed options.

Speed options: **15 kt / 20 kt / 25 kt / 30 kt**. Higher speed increases fuel consumption.

---

### Standby ✅
**Intent:** Hold position. Used when no movement is desired — waiting for a strike to return, conserving fuel, or holding a defensive position.

**UI:** Selecting Standby closes the Order dialog and sets order chip to `STANDBY`.

**Engine:** Task force does not move. Fuel consumption continues at normal rate (Refuel is needed to stop it).

---

### Patrol ✅
**Intent:** Move to a destination hex and maintain a presence in that area. Useful for covering approaches to a key location (e.g. Midway) or positioning for a future engagement.

**UI:** After selecting Patrol, the player sets a destination hex on the map (implementation detail: destination input method TBD). Task force moves along a pathfound route.

**Engine:** Task force moves step by step toward destination. When detected by enemy search, reported contact type is `surface-force` (not carrier force) — useful for masking carrier presence. Transitions to Standby automatically on arrival.

---

### Search ✅
**Intent:** Dispatch search aircraft to locate the enemy. This is the primary intelligence-gathering tool. A task force on Search is the only reliable way to find enemy contacts.

**UI:** Setting order to Search is sufficient; no further input needed. The task force does not change course.

**Engine:** Activates the SearchSystem each game step. Aircraft from carrier squadrons on the task force fan out and check surrounding hexes for enemy contacts. Detection probability scales with the number of aircraft available and pilot experience. False report rate: 3% (ace) to 28% (green) — a detected contact may be misidentified (e.g. a carrier force reported as "unknown warships"). Detected contacts appear in the Intel Log.

---

### Strike ✅ (intent marker) / ⚠️ Planned (full execution)
**Intent:** Commit the task force to an offensive posture and launch an air strike against an identified enemy contact.

**UI:** Setting order to Strike marks the task force's intent. The actual strike is planned and launched from **Air Ops → Strike tab** (see Air Operations below). The order chip shows `STRIKE`.

**Engine (current):** Intent marker only — no movement or automatic launch. The task force continues on its previous course. Actual launch must be initiated manually via Air Ops.

**Engine (planned):** Full combat resolution on strike arrival, including flak, CAP interception, damage calculation.

---

### Intercept ⚠️ Partial
**Intent:** Move at speed to cut off an enemy force, positioning to engage before it reaches its objective.

**UI:** Selecting Intercept sets a destination hex; task force moves toward it.

**Engine (current):** Functions as movement only — identical to Patrol in engine behavior. No special interception combat modifier is implemented yet.

**Engine (planned):** Arriving in the same hex as an enemy force will trigger surface or air combat depending on composition.

---

### Escort ⚠️ Partial
**Intent:** Shadow a friendly task force, providing anti-aircraft cover and surface screen protection.

**UI:** Selecting Escort requires designating a target friendly task force (stored as `escortTargetId`). The escorting TF moves toward that TF's position.

**Engine (current):** Movement toward the escort target only. No protection bonus is computed; the escorting TF does not combine with the target for combat purposes.

**Engine (planned):** Escorting TFs will contribute their AA firepower to the escorted TF's defense against incoming strikes.

---

### Refuel ✅
**Intent:** Stop all movement and halt fuel consumption. Used when rendezvousing with a tanker or when fuel is critically low and no action is possible.

**UI:** Setting order to Refuel stops all movement immediately.

**Engine:** Task force is stationary. Fuel consumption is paused. *(Planned: actual refueling from an oiler ship will replenish fuel over time.)*

---

### Retire ✅
**Intent:** Withdraw from the engagement area entirely. Used when a task force is heavily damaged or the battle is decided.

**UI:** Setting order to Retire requires no additional input. The task force begins moving toward the nearest map edge.

**Engine:** Pathfinds toward the nearest map boundary. Automatically transitions to Standby when the edge is reached.

---

## Air Operations

Carrier task forces carry **air groups** composed of **squadrons**. Each squadron belongs to a specific carrier within the task force and has a fixed aircraft type, count, and pilot experience level.

The **deck cycle** is the critical constraint on air operations:

```
hangared → spotted → airborne → returning → recovering → rearming → hangared
```

A squadron must be spotted on deck before it can be launched. After a mission, it must recover and rearm before it can fly again. **If incoming enemy strikes arrive while the deck is full of returning aircraft, those aircraft (and the carrier) are extremely vulnerable.** Timing strikes and recoveries is the core skill of carrier command.

Open Air Ops via the **Air Ops** button on the task force panel.

---

### Deck Status Tab ✅
**What it shows:** All squadrons assigned to carriers in this task force, regardless of current state.

| Column | Description |
|---|---|
| Squadron name | e.g. `VF-6 (Fighting Six)` |
| Aircraft count | e.g. `27 aircraft` (current / max) |
| Experience | `ace`, `veteran`, `trained`, `green` — affects detection, accuracy, and false report rates |
| Deck status | Badge showing current state in the cycle |

**Deck status badge colors:** `hangared` (neutral) · `spotted` / `recovering` / `rearming` (warning amber) · `airborne` (blue)

This tab is **read-only**. Actions are taken from the Strike and CAP tabs.

---

### Airborne Tab ✅
**What it shows:** All active **flight plans** — missions currently in the air that have not yet recovered.

| Column | Description |
|---|---|
| Mission type | `strike`, `cap`, `search` |
| Squadrons | Which squadrons are on this mission |
| Target hex | Where the mission is headed |
| Status | `airborne` (outbound) · `returning` (inbound) · `recovered` · `lost` |

**Recall button:** Available for `airborne` missions. Forces the flight plan to return immediately, skipping the attack. Use when an enemy strike is inbound and fighters are needed for CAP, or when a bad contact report means the strike will find nothing.

---

### CAP Tab ✅ (read-only) / ⚠️ Planned (assignment)
**What it shows:** Fighter squadrons currently assigned to Combat Air Patrol — orbiting overhead to intercept incoming enemy aircraft.

CAP assignment is currently issued via a separate `launch-cap` order not exposed in the Air Ops UI. The CAP tab shows which fighters are on station and their aircraft count.

**Empty state message:** "No CAP assigned. Select a fighter squadron and issue a CAP order."

*(Planned: CAP squadrons will intercept incoming enemy strikes. CAP effectiveness scales with fighter count, pilot experience, and altitude advantage.)*

---

### Strike Tab ✅
**What it does:** Plans and launches an air strike against an enemy contact or a manually entered hex.

**Step by step:**

1. **Select squadrons** — the list shows all squadrons with `deckStatus` of `hangared` or `spotted` that are not already on a mission. Check boxes to include them in the strike. Mix dive bombers (VB) and torpedo bombers (VT) for maximum effect against capital ships.

2. **Select a target** — choose from the dropdown of active Intel contacts (enemy contacts currently on the map), or enter a target hex manually using Q, R coordinates.

3. **Check range** — the tab computes the distance from the task force's current position to the target hex and warns if any selected squadron's maximum range would be exceeded. Formula: `distance > maxRange × 0.5 × (1 − 0.15 fuel reserve)`. A strike launched beyond range will not reach its target.

4. **Launch** — the Launch button is enabled when at least one squadron is selected and a valid target hex is provided. Clicking it queues a `launch-strike` order. Squadrons transition from `hangared` → `spotted` → `airborne`. The mission appears in the Airborne tab.

*(Planned: on arrival, combat resolution calculates hits based on number of aircraft, experience, enemy flak density, and CAP interference. Results are reported as damage entries in the Intel Log.)*

---

## Intel Log

The Intel Log panel appears in the bottom-left of the screen when the game is running. It is the player's primary window into enemy activity.

**Entry format:** `D<day> HH:MM — [side] sighted [contact-type] force at [Q,R]`

**Example entries:**
```
D1 06:30  US sighted surface force at 27,51
D1 07:00  US sighted carrier force at 27,51
D1 07:30  US sighted battleship force at 27,51
```

**Contact types (from least to most certain):**
- `unknown warships` — detected but not identified
- `surface force` — warships confirmed, type unknown
- `battleship force` — heavy surface unit identified (may be a false report)
- `carrier force` — carrier presence confirmed

**False reports:** Low-experience pilots generate incorrect contact types. A `carrier force` report from a green squadron may in fact be a cruiser screen. Cross-referencing multiple sightings at the same hex increases confidence.

**Older entries** are dimmed and struck through. Newer, unread entries are displayed prominently.

The Intel Log is the **only** way to see enemy position — there is no omniscient map view. The player must read it actively.

---

## Victory Conditions ⚠️ Planned

Victory conditions are defined in the scenario data but not yet evaluated by the engine (no end-game screen exists).

### Battle of Midway (72 hours: June 4–7, 1942)

**Allied objectives:**
| Objective | Points |
|---|---|
| Sink Akagi, Kaga, Soryu, and Hiryu (all four Kido Butai carriers) | 100 |
| Prevent Japanese occupation of Midway Atoll by June 7 06:00 | 50 |

**Japanese objectives:**
| Objective | Points |
|---|---|
| Sink USS Enterprise, USS Hornet, and USS Yorktown | 100 |
| Occupy Midway Atoll (hex 35, 55) with invasion forces by June 7 06:00 | 80 |

The side with the most points at the end of the 72-hour window wins.

---

## Full Session Walkthrough — Battle of Midway

This walkthrough describes a typical opening sequence. Actions are given precisely enough for an automated test to reproduce them.

---

**Scenario start — Mon 06:00**

The scenario loads with the game paused. On the map:
- **TF-16** (Enterprise + Hornet) at hex (43, 49), order: Search, speed: 15 kt
- **TF-17** (Yorktown) at hex (44, 50), order: Search, speed: 15 kt
- **Midway Atoll** island hex at (35, 55) — green labeled hex in the center-left of the map
- No enemy tokens are visible yet

The Intel Log panel is closed. No sightings have occurred.

---

**Action: Resume time**

The player clicks the Resume button (or presses Space). The clock begins advancing. Both US task forces move SW at 15 kt on their search headings.

The player lets time run at 1× speed.

---

**D1 06:30 — First sighting**

An Intel Log panel slides into view. Entry: `D1 06:30 — US sighted surface force at 27,51`.

TF-16's search aircraft have found something 170 nm NW of Midway. The contact type is vague — "surface force" could be anything. An orange diamond appears at hex (27, 51).

The player does not yet pause. More information is needed.

---

**D1 07:00 — Contact clarified**

Two new entries appear:
- `D1 07:00 — US sighted battleship force at 27,51`
- `D1 07:00 — US sighted carrier force at 27,51`

Multiple contacts are converging on the same hex. The player pauses.

---

**Action: Select TF-16 and assess**

The player clicks the blue TF-16 token on the map (approximately at canvas position 737, 523 in a standard viewport). The Task Force panel opens showing:
- Order: SEARCH · Speed: 15 kt · Fuel: 85%
- USS Enterprise (CV-6) and USS Hornet (CV-8) — both operational, 100% hull

---

**Action: Change TF-16 order to Strike**

1. The player clicks **Order** on the TF-16 panel
2. In the Order dialog, the player clicks **Strike**
3. Speed is left at 15 kt
4. The dialog closes; order chip now reads `STRIKE`

---

**Action: Launch strike from TF-16**

1. The player clicks **Air Ops** on the TF-16 panel
2. The Air Ops dialog opens on the **Deck Status** tab — all squadrons show `hangared`
3. The player clicks the **Strike** tab
4. The player checks: **VB-6 (Bombing Six)** and **VT-6 (Torpedo Six)**
5. In the target dropdown, the player selects the contact at hex (27, 51)
6. Range check passes — distance is within squadron range
7. The player clicks **Launch**

The dialog closes. VB-6 and VT-6 transition to `spotted` then `airborne`. The Airborne tab now shows one active flight plan: mission type `strike`, target hex `27,51`, status `airborne`.

---

**Action: Resume and wait**

The player clicks Resume. Time advances. The strike is en route — roughly 8–9 in-game hours at aircraft cruise speed.

During this window the player should:
- Monitor the Intel Log for updated sightings
- Consider assigning VF-6 (Fighting Six) to CAP via `launch-cap` order
- Check TF-17's Deck Status and consider a second wave

*(Planned: when the strike arrives at the target hex, combat resolution fires. Results appear in the Intel Log as damage entries: e.g. `D1 16:00 — Akagi hit by 3 bombs, fires reported`.)*

---

## Glossary

| Term | Definition |
|---|---|
| **TF / Task Force** | A group of ships operating as a single unit with one position, order, and speed on the map |
| **CAP** | Combat Air Patrol — fighter aircraft orbiting overhead to intercept incoming enemy strikes |
| **Deck cycle** | The sequence a squadron goes through: hangared → spotted → airborne → returning → recovering → rearming |
| **Hex** | A single cell on the map, representing 20 nautical miles |
| **Contact** | An enemy force position on the map, derived from a sighting event |
| **Sighting** | A detection event generated by search aircraft; appears as an Intel Log entry |
| **False report** | A sighting that misidentifies the contact type; more common with inexperienced pilots |
| **Flight plan** | An active air mission (strike, CAP, or search) in progress; visible in the Airborne tab |
| **Experience level** | Pilot quality rating: `ace` > `veteran` > `trained` > `green`; affects detection, accuracy, and false report rates |
| **Kido Butai** | IJN 1st Carrier Strike Force: Akagi, Kaga, Soryu, Hiryu — the primary enemy target at Midway |
