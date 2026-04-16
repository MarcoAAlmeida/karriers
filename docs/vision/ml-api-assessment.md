# ML/RL API Surface Assessment — GameEngine

> Answers the question: is the current engine good enough for neural network training data,
> or should we change something before Path B starts logging games to NuxtHub D1?

---

## What Is Already Good

**Seeded, deterministic RNG.** `dice.ts` (Mulberry32) is threaded through every subsystem.
Zero `Math.random()` calls exist in `game/`. Deterministic replay is guaranteed — given the same
seed and order log, any game can be reproduced exactly. This is a hard requirement for RL and
evolutionary training and it is already satisfied.

**FogOfWarSystem has per-side tracking.** `getActiveContacts(forSide)` and `isVisible()` already
separate Allied and Japanese knowledge. The data is there; it just isn't being used in the snapshot.

**Step-based architecture.** The 30-minute discrete step with a clean event boundary maps naturally
to an RL episode step. No wall-clock timing to deal with in headless mode.

---

## Critical Gap — Fix Before Path B Logging Starts

### `GameSnapshot` leaks ground truth to both sides

`getSnapshot()` (GameEngine.ts) shallow-copies the full engine state — both sides' true task group
positions, all contacts, all squadron states — into one object. An RL agent using this snapshot
directly sees the enemy's real position even when fog of war should hide it.

**If we log unfiltered snapshots to D1, the training data is poisoned.** Every logged episode
would teach an agent to navigate with omniscient vision, which is a completely different problem
from actual gameplay.

**Fix required before Sprint 25 (logging starts):**

Add `engine.getObservation(side: Side): SidedSnapshot` that filters the snapshot through
`FogOfWarSystem`:

```typescript
// game/engine/GameEngine.ts (addition)
getObservation(side: Side): SidedSnapshot {
  const raw = this.getSnapshot();
  return {
    ...raw,
    // Own forces: full state
    ownTaskGroups: raw.taskGroups.filter(tg => tg.side === side),
    // Enemy forces: only what FogOfWarSystem says this side can see
    enemyContacts: this.fogOfWarSystem.getActiveContacts(side),
    // Remove the other side's ground truth entirely
    taskGroups: undefined,
  };
}
```

`SidedSnapshot` replaces `GameSnapshot` as the type logged to D1 and passed to `AIAgent.decideTurn()`.
The engine still maintains full ground truth internally — only the output is filtered.

**This is the one change that must happen before any game logs are written to the database.**

---

## High Priority — Address in Sprint 25 or 26

### Variable-length collections

Task groups, ships, squadrons, flight plans, and contacts are all variable-length arrays/maps.
Neural networks expect fixed-size input vectors.

This does **not** require changing the engine. It requires a serializer utility:

```typescript
// game/utils/featureVector.ts (new file)
export function toFeatureVector(obs: SidedSnapshot, side: Side): Float32Array {
  // Pad/truncate to fixed slots:
  // - Up to 4 own task groups × N features each
  // - Up to 8 enemy contacts × M features each
  // - Up to 16 squadrons × K features each
  // - Scalar globals: step count, fuel pool %, etc.
}
```

The schema of this vector should be designed once and then frozen — changing it invalidates all
prior training data. Design it deliberately in Sprint 25 alongside the D1 schema.

**Suggested fixed-size slots for Midway:**

| Category | Max slots | Features per slot |
|---|---|---|
| Own task groups | 4 | position q/r, speed, fuel%, order enum, hull avg% |
| Enemy contacts | 8 | position q/r, contact type enum, staleness (steps since sighted) |
| Own squadrons | 16 | aircraft count, deck status enum, experience enum, mission type |
| Active flight plans | 8 | mission type, target q/r, steps remaining estimate |
| Globals | — | step number, time of day, fuel pool %, score delta |

Total vector size: roughly 100–150 floats. Manageable for a shallow network.

---

## Medium Priority — Add When Training Starts

### No per-step reward signal

`VictorySystem` evaluates win conditions only at scenario end. RL training with only terminal
rewards is possible (REINFORCE / Monte Carlo) but converges much more slowly than dense rewards.

**Per-step reward can be derived from events already emitted by the engine:**

| Engine event | Reward signal |
|---|---|
| `ShipDamaged` | +damage dealt to enemy, −damage taken |
| `ShipSunk` | +large bonus (enemy), −large penalty (own); weighted by tonnage |
| `SightingDetected` | +small bonus for first sighting of a contact (information value) |
| `StrikeInbound` | −small penalty (allows enemy to reach our carrier) |
| Step with no sightings | −tiny penalty (encourages active scouting) |

These can be computed as a **wrapper around `StepComplete`** without touching engine internals:

```typescript
// game/ai/RewardShaper.ts (new file)
export class RewardShaper {
  compute(prevObs: SidedSnapshot, currentObs: SidedSnapshot, events: EngineEvent[]): number { ... }
}
```

`RewardShaper` is optional infrastructure — evolutionary training (Path B Sprint 27) only needs
end-of-game fitness. This becomes important when/if NN training begins (Sprint 29+).

### Large hex action space

Strike and destination targeting cover 6048 hexes (72×84 board). This is too large for a flat
action space in a simple network.

**Mitigation (agent-side, not engine-side):** Use hierarchical action selection —
1. Choose order type (8 discrete choices)
2. If hex required, choose a sector (e.g. 9 coarse zones) then a hex within it

This is an agent implementation concern and does not require engine changes.

---

## Summary: What to Do and When

| Change | Where | When | Blocking? |
|---|---|---|---|
| `getObservation(side)` — FOW-filtered snapshot | `GameEngine.ts` | **Before Sprint 25 logging** | Yes — all logged data depends on this |
| `SidedSnapshot` type | `game/types/` | Same sprint as above | Yes |
| `featureVector.ts` serializer | `game/utils/` | Sprint 25 — design alongside D1 schema | Soft — needed before NN training |
| `RewardShaper` | `game/ai/` | Sprint 29+ | No — evolutionary doesn't need it |
| Hierarchical action space | Agent implementation | Sprint 27+ | No — agent concern only |

**Bottom line:** One engine change is needed before Path B logging starts — per-side snapshot
filtering via `getObservation(side)`. Everything else can be layered on top without invalidating
stored data.
