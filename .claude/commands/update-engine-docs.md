Update `docs/reference/game_engine.md` to reflect all engine changes made in the sprint just completed.

## Rules

1. **Never reference specific scenario items** (squadron names, ship names, scenario IDs, task group IDs, hex coordinates, victory condition specifics). The engine doc describes the simulation layer, which is scenario-agnostic. Scenario-specific data lives in `game/data/scenarios/`. Use generic terms like "a task group", "a carrier", "the attacking side" — or use illustrative values (e.g. "e.g. Midway") only when the concept genuinely needs an example to be understood.

2. **Document the engine contract, not the implementation detail.** Describe what a system does and what its inputs/outputs are. Only go into implementation specifics (formulas, constants, thresholds) when a developer needs them to write correct code or tests.

3. **Keep sections in sync with the actual code.** Before writing, read the relevant source files to verify constants, signatures, step order, and event names. Do not copy values from memory — check the source.

4. **Preserve the existing document structure.** Update in place: edit the relevant section(s), add new sections for new systems, remove sections for deleted systems. Do not reorder or reformat sections that were not touched by the sprint.

5. **Step sequence (Section 4) must exactly match `GameEngine.runStep()`** — same count, same order, same descriptions.

6. **Event table (Section 3) must stay complete** — add any new engine events, remove any deleted ones.

After updating, run `npx vitest run` to confirm tests still pass, then report which sections were changed and why.
