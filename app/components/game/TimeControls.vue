<template>
  <div
    data-testid="hud-time-controls"
    class="pointer-events-auto flex items-center gap-3 px-4 py-2 bg-gray-950/80 backdrop-blur border-b border-gray-800"
  >
    <!-- Game time -->
    <span class="font-mono text-amber-300 text-sm tracking-wider min-w-32">
      {{ formattedTime }}
    </span>

    <div class="h-4 w-px bg-gray-700" />

    <!-- Play / Pause -->
    <UButton
      data-testid="play-pause-btn"
      :icon="gameStore.isPaused ? 'i-heroicons-play' : 'i-heroicons-pause'"
      size="xs"
      color="neutral"
      variant="ghost"
      :aria-label="gameStore.isPaused ? 'Resume (Space)' : 'Pause (Space)'"
      @click="gameStore.togglePause()"
    />

    <!-- Time scale buttons -->
    <div class="flex gap-1">
      <UButton
        v-for="scale in TIME_SCALES"
        :key="scale"
        :label="`${scale}×`"
        size="xs"
        :color="gameStore.timeScale === scale ? 'primary' : 'neutral'"
        :variant="gameStore.timeScale === scale ? 'solid' : 'ghost'"
        @click="gameStore.setTimeScale(scale)"
      />
    </div>

    <div class="flex-1" />

    <!-- Return to menu -->
    <UButton
      label="Menu"
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-heroicons-arrow-left"
      @click="gameStore.returnToMenu()"
    />
  </div>
</template>

<script setup lang="ts">
import type { TimeScale } from '@game/engine/TimeSystem'

const TIME_SCALES: TimeScale[] = [1, 2, 4, 8]

const gameStore = useGameStore()

const formattedTime = computed(() => {
  const t = gameStore.currentTime
  // Interpolate between steps using stepFraction so the clock ticks smoothly
  const baseMinutes = t.day * 1440 + t.hour * 60 + t.minute
  const totalMinutes = baseMinutes + Math.floor(gameStore.stepFraction * 30)
  const day = Math.floor(totalMinutes / 1440)
  const dayMinutes = totalMinutes % 1440
  const days = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const hh = String(Math.floor(dayMinutes / 60)).padStart(2, '0')
  const mm = String(dayMinutes % 60).padStart(2, '0')
  return `${days[day] ?? `D${day}`} ${hh}:${mm}`
})
</script>
