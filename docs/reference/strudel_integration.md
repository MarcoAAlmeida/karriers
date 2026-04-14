# Strudel Music Engine — Integration Reference

Strudel (https://strudel.cc) is a live-coding music environment built on the TidalCycles
pattern language. This document covers how to embed it into Karriers as a programmatic
soundtrack engine — no REPL, no editor UI, patterns composed externally and played in-game.

---

## Packages

```
@strudel/web        ← recommended entry point: initStrudel() + evaluate()
@strudel/core       ← pattern primitives, queryArc() (if lower-level control is needed)
@strudel/webaudio   ← Web Audio API binding (pulled in by @strudel/web)
@strudel/mini       ← mini notation parser (pulled in by @strudel/web)
```

Install:
```bash
pnpm add @strudel/web
```

All packages are pure ESM. No framework coupling (the only framework-specific package is
`@strudel/react`, which we do not use). Works directly with Vite/Nuxt 3.

**License:** AGPL-3.0. Non-issue for a personal/private project.

---

## Composable — `app/composables/useStrudel.ts`

```ts
import { initStrudel, evaluate } from '@strudel/web'

let initialised = false

export function useStrudel() {
  async function play(pattern: string) {
    if (!initialised) {
      await initStrudel()   // sets up Web Audio context; must follow a user gesture
      initialised = true
    }
    await evaluate(pattern)
  }

  function stop() {
    // @strudel/web exposes a global stop — call it or replace pattern with silence
    evaluate('silence')
  }

  return { play, stop }
}
```

**Web Audio autoplay rule:** `initStrudel()` must be called within a user-gesture handler
(click, keydown). The game's "Start Scenario" button is the natural trigger.

---

## Soundtrack file format

Patterns are plain text files stored in `public/music/`. They contain valid Strudel
mini-notation or JS-style pattern code — the same code you would run in the REPL at
strudel.cc.

```
public/
  music/
    midway.strudel      ← main scenario soundtrack
    midway-combat.strudel  ← triggered on first enemy strike
    menu.strudel        ← entry screen ambient
```

Load at runtime with a simple fetch (files are static assets):

```ts
const pattern = await fetch('/music/midway.strudel').then(r => r.text())
await play(pattern)
```

Or inline as a TypeScript string constant for simpler cases.

---

## Authoring workflow

1. Open https://strudel.cc — compose and iterate in the REPL.
2. When satisfied, copy the pattern code.
3. Paste into the appropriate `.strudel` file under `public/music/`.
4. Refresh the game — `evaluate()` picks it up on next scenario start (no rebuild needed
   since it lives in `public/`).

---

## Game integration points

| Game event | Music action |
|---|---|
| Scenario select screen | `play(menu.strudel)` |
| Scenario start (user clicks Play) | `stop()` then `play(midway.strudel)` |
| First enemy strike detected | Crossfade to `midway-combat.strudel` (swap pattern) |
| Carrier sunk | One-shot percussion accent (optional inline pattern) |
| Scenario end screen | `stop()` or quiet resolution pattern |

Strudel patterns loop continuously by default — no manual loop management needed.
Swapping patterns mid-play is done by calling `evaluate(newPattern)`; Strudel handles the
transition at the next cycle boundary.

---

## Pinia integration (optional)

If playback state needs to be reflected in the UI (e.g. a mute button):

```ts
// app/stores/audio.ts
export const useAudioStore = defineStore('audio', () => {
  const muted = ref(false)
  const currentTrack = ref<string | null>(null)

  function setTrack(name: string) { currentTrack.value = name }
  function toggleMute() { muted.value = !muted.value }

  return { muted, currentTrack, setTrack, toggleMute }
})
```

The `useStrudel` composable reads `muted` before calling `evaluate()` and calls
`stop()` / `play()` when the value changes.

---

## Verification

1. `pnpm add @strudel/web` — package installs, Nuxt build succeeds.
2. Start game, click "Start Scenario" — audio plays (check browser console for no errors).
3. Edit `public/music/midway.strudel`, refresh browser, start scenario — new pattern plays.
4. Trigger a combat event — music transitions at next cycle boundary.
5. Click mute — silence; unmute — resumes.

---

## Notes

- Strudel's default synths (sawtooth, triangle, etc.) work without any sample files.
  For richer sound, samples can be loaded via `samples()` in the pattern itself.
- Pattern evaluation is async but near-instant; no perceptible lag on scenario start.
- `evaluate('silence')` is the cleanest stop — avoids any Web Audio click artifacts.
- For MIDI output (driving an external synth): add `@strudel/midi` and replace
  `webaudioOutput` with `midiOutput` in the init options. Not required for basic use.
