<template>
  <div
    ref="containerRef"
    data-testid="game-canvas"
    class="w-full h-full overflow-hidden relative"
    @click.self="mapStore.clearDisambiguation()"
  >
    <!-- Hover tooltip for in-flight squadron dots -->
    <Transition name="fade">
      <div
        v-if="hoveredPlan && hoverPos"
        data-testid="strike-dot-tooltip"
        class="absolute z-50 pointer-events-none bg-slate-800/90 border border-slate-600 rounded px-2 py-1.5 text-xs text-white shadow-lg min-w-36"
        :style="{ left: hoverPos.x + 14 + 'px', top: hoverPos.y - 24 + 'px' }"
      >
        <div class="font-semibold text-sky-300">
          {{ hoveredPlan.squadronName }}
        </div>
        <div class="text-slate-400 capitalize">
          {{ hoveredPlan.mission }} · {{ hoveredPlan.status }}
        </div>
        <div
          v-if="hoveredPlan.target"
          class="text-slate-400"
        >
          Target {{ hoveredPlan.target }}
        </div>
        <div
          v-if="hoveredPlan.eta"
          class="text-slate-400"
        >
          ETA {{ hoveredPlan.eta }}
        </div>
      </div>
    </Transition>

    <!-- Disambiguation picker (overlapping dots) -->
    <div
      v-if="mapStore.disambiguationPlans.length > 0 && mapStore.disambiguationPos"
      data-testid="strike-disambiguation"
      class="absolute z-50 bg-slate-800 border border-slate-600 rounded shadow-xl overflow-hidden min-w-40"
      :style="{ left: mapStore.disambiguationPos.x + 'px', top: mapStore.disambiguationPos.y + 8 + 'px' }"
    >
      <div class="px-2 py-1 text-xs text-slate-400 border-b border-slate-700 bg-slate-900">
        Select squadron
      </div>
      <button
        v-for="planId in mapStore.disambiguationPlans"
        :key="planId"
        class="w-full text-left px-2 py-1.5 text-xs text-white hover:bg-slate-700 block border-b border-slate-700/50 last:border-0"
        @click.stop="selectPlan(planId)"
      >
        {{ getPlanLabel(planId) }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const containerRef = ref<HTMLElement | null>(null)

usePixiRenderer(containerRef)
useGameLoop()

const mapStore = useMapStore()
const forcesStore = useForcesStore()

// ── Hover tooltip data ────────────────────────────────────────────────────

function fmtTime(t: { day: number, hour: number, minute: number }): string {
  return `D${t.day} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
}

const hoverPos = computed(() => mapStore.hoverScreenPos)

const hoveredPlan = computed(() => {
  const id = mapStore.hoveredFlightPlanId
  if (!id) return null
  const plan = forcesStore.flightPlans.get(id)
  if (!plan) return null
  const sq = forcesStore.squadrons.get(plan.squadronIds[0] ?? '')
  return {
    squadronName: sq?.name ?? 'Unknown squadron',
    mission: plan.mission,
    status: plan.status === 'returning' ? 'returning' : 'outbound',
    target: plan.targetHex ? `(${plan.targetHex.q}, ${plan.targetHex.r})` : null,
    eta: plan.status === 'returning' ? (plan.returnEta ? fmtTime(plan.returnEta) : null) : (plan.eta ? fmtTime(plan.eta) : null)
  }
})

// ── Disambiguation helpers ────────────────────────────────────────────────

function getPlanLabel(planId: string): string {
  const plan = forcesStore.flightPlans.get(planId)
  if (!plan) return planId
  const sq = forcesStore.squadrons.get(plan.squadronIds[0] ?? '')
  const name = sq?.name ?? 'Unknown'
  return `${name} (${plan.mission})`
}

function selectPlan(planId: string): void {
  mapStore.selectFlightPlan(planId)
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
