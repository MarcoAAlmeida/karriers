/**
 * Global vitest setup — runs before every test file.
 *
 * Polyfills Nuxt auto-imports (defineStore, ref, computed, …) onto globalThis
 * so that store modules (which use them without an explicit import declaration)
 * can be loaded directly in vitest's Node environment.
 *
 * Execution order guaranteed by vitest:
 *   setupFiles module body → test module imports resolved → test body runs
 * So globals set here are visible when store/component modules first load.
 */

import { createPinia, setActivePinia, defineStore } from 'pinia'
import {
  ref,
  computed,
  shallowRef,
  watch,
  watchEffect,
  onUnmounted,
  onMounted
} from 'vue'
import { beforeEach } from 'vitest'

// ── Pinia / Vue primitives ────────────────────────────────────────────────

Object.assign(globalThis, {
  defineStore,
  ref,
  computed,
  shallowRef,
  watch,
  watchEffect,
  onUnmounted,
  onMounted
})

// ── Nuxt UI stubs (no-ops so store tests don't error on useToast etc.) ───

;(globalThis as Record<string, unknown>).useToast = () => ({ add: () => {} })
;(globalThis as Record<string, unknown>).defineShortcuts = () => {}

// ── Fresh Pinia before each test ─────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia())
})
