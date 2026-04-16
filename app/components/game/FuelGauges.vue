<template>
  <template v-if="showGauges">
    <div class="h-4 w-px bg-slate-700" />
    <div class="flex items-center gap-4">

      <!-- Allied fuel gauge -->
      <div class="flex items-center gap-1.5" data-testid="fuel-allied">
        <span class="font-mono text-xs text-sky-400 shrink-0">US</span>
        <div class="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-[width] duration-500"
            :class="[alliedBarClass, alliedPct > 0 && alliedPct <= 20 ? 'animate-pulse' : '']"
            :style="{ width: `${alliedPct}%` }"
          />
        </div>
        <span
          class="font-mono text-xs tabular-nums shrink-0"
          :class="alliedLabelClass"
          data-testid="fuel-allied-label"
        >{{ alliedPct === 0 ? 'GROUNDED' : `${alliedPct}%` }}</span>
      </div>

      <!-- IJN fuel gauge -->
      <div class="flex items-center gap-1.5" data-testid="fuel-ijn">
        <span class="font-mono text-xs text-rose-400 shrink-0">IJN</span>
        <div class="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-[width] duration-500"
            :class="[ijnBarClass, japanesePct > 0 && japanesePct <= 20 ? 'animate-pulse' : '']"
            :style="{ width: `${japanesePct}%` }"
          />
        </div>
        <span
          class="font-mono text-xs tabular-nums shrink-0"
          :class="ijnLabelClass"
          data-testid="fuel-ijn-label"
        >{{ japanesePct === 0 ? 'GROUNDED' : `${japanesePct}%` }}</span>
      </div>

    </div>
  </template>
</template>

<script setup lang="ts">
const forcesStore = useForcesStore()
const gameStore = useGameStore()

const showGauges = computed(() =>
  gameStore.phase === 'playing' || gameStore.phase === 'paused' || gameStore.phase === 'ended'
)

const alliedPct = computed(() => forcesStore.alliedFuelPct)
const japanesePct = computed(() => forcesStore.japaneseFuelPct)

function barColor(pct: number, side: 'allied' | 'japanese'): string {
  if (pct === 0) return 'bg-slate-600'
  if (pct <= 20) return 'bg-amber-400'
  return side === 'allied' ? 'bg-sky-500' : 'bg-rose-500'
}

function labelColor(pct: number): string {
  if (pct === 0) return 'text-red-500'
  if (pct <= 20) return 'text-amber-400'
  return 'text-slate-400'
}

const alliedBarClass = computed(() => barColor(alliedPct.value, 'allied'))
const ijnBarClass = computed(() => barColor(japanesePct.value, 'japanese'))
const alliedLabelClass = computed(() => labelColor(alliedPct.value))
const ijnLabelClass = computed(() => labelColor(japanesePct.value))
</script>
