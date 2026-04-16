<template>
  <header
    data-testid="shell-top-bar"
    class="flex items-center h-10 px-3 gap-3 bg-slate-900 border-b border-slate-700 shrink-0 select-none"
  >
    <!-- Nav expand/collapse -->
    <UButton
      :icon="navExpanded ? 'i-heroicons-chevron-left' : 'i-heroicons-chevron-right'"
      size="xs"
      color="neutral"
      variant="ghost"
      :aria-label="navExpanded ? 'Collapse navigation' : 'Expand navigation'"
      @click="emit('toggleNav')"
    />

    <!-- Brand -->
    <span class="text-sky-400 font-bold tracking-[0.2em] uppercase text-sm">Karriers</span>

    <div class="h-4 w-px bg-slate-700" />

    <span class="text-slate-400 text-xs tracking-wide">Tactical Map</span>

    <div class="flex-1" />

    <!-- Fuel gauges (hidden in menu) -->
    <FuelGauges />

    <!-- Passive game clock -->
    <span class="font-mono text-slate-300 text-xs tabular-nums">{{ gameTime }}</span>

    <div class="h-4 w-px bg-slate-700" />

    <!-- System status -->
    <div class="flex items-center gap-1.5">
      <div class="w-1.5 h-1.5 rounded-full" :class="gameStore.isPaused ? 'bg-red-500' : 'bg-emerald-400'" />
      <span class="text-slate-400 text-xs">All Systems Operational</span>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{ navExpanded: boolean }>()
const emit = defineEmits<{ toggleNav: [] }>()

const gameStore = useGameStore()

const gameTime = computed(() => {
  const t = gameStore.currentTime
  const days = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const hh = String(t.hour).padStart(2, '0')
  const mm = String(t.minute).padStart(2, '0')
  return `${days[t.day] ?? `D${t.day}`} ${hh}:${mm}`
})
</script>
