<template>
  <div class="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-10 px-6 py-12">

    <!-- Title -->
    <div class="text-center space-y-2">
      <h1 class="text-5xl font-bold tracking-[0.25em] uppercase text-amber-400">Karriers</h1>
      <p class="text-gray-400 tracking-widest text-sm uppercase">Pacific Carrier Operations · 1941–1945</p>
    </div>

    <!-- Scenario cards -->
    <div class="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-5">
      <div
        v-for="meta in SCENARIO_MANIFEST"
        :key="meta.id"
        :data-testid="`scenario-card-${meta.id}`"
        class="group rounded-xl border border-gray-700 bg-gray-900 hover:border-amber-500 hover:bg-gray-800 transition-all cursor-pointer p-5 flex flex-col gap-3"
        :class="{ 'opacity-50 cursor-not-allowed hover:border-gray-700 hover:bg-gray-900': !isAvailable(meta.id) }"
        @click="selectScenario(meta.id)"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="font-semibold text-white group-hover:text-amber-300 transition-colors">{{ meta.name }}</h2>
            <p class="text-xs text-gray-500 mt-0.5">{{ meta.date }}</p>
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0">
            <UBadge :color="difficultyColor(meta.difficulty)" variant="subtle" size="sm">
              {{ meta.difficulty }}
            </UBadge>
            <span class="text-xs text-gray-500">{{ meta.durationHours }}h</span>
          </div>
        </div>

        <p class="text-sm text-gray-400 leading-relaxed">{{ meta.description }}</p>

        <div class="mt-auto">
          <UButton
            v-if="isAvailable(meta.id)"
            label="Play"
            size="sm"
            color="primary"
            variant="soft"
            block
            trailing-icon="i-heroicons-play"
            :data-testid="`play-btn-${meta.id}`"
            @click.stop="selectScenario(meta.id)"
          />
          <p v-else :data-testid="`coming-soon-${meta.id}`" class="text-xs text-gray-600 text-center">Coming soon</p>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { SCENARIO_MANIFEST } from '@game/data/scenarios/index'
import { MIDWAY } from '@game/data/scenarios/midway'
import type { ScenarioMetadata } from '@game/types'

const { loadScenario } = useScenarioLoader()

const AVAILABLE_IDS = new Set(['midway'])

function isAvailable(id: string): boolean {
  return AVAILABLE_IDS.has(id)
}

function difficultyColor(d: ScenarioMetadata['difficulty']): 'success' | 'warning' | 'error' {
  return d === 'easy' ? 'success' : d === 'medium' ? 'warning' : 'error'
}

function selectScenario(id: string): void {
  if (!isAvailable(id)) return
  if (id === 'midway') loadScenario(MIDWAY)
}
</script>
