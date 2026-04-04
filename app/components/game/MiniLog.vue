<template>
  <div
    v-if="entries.length"
    class="pointer-events-auto absolute bottom-4 left-4 w-72 rounded-lg bg-gray-950/85 backdrop-blur border border-gray-700 overflow-hidden"
  >
    <div class="flex items-center justify-between px-3 py-1.5 border-b border-gray-800">
      <span class="text-[10px] uppercase tracking-widest text-gray-500">Intel Log</span>
      <UButton icon="i-heroicons-x-mark" size="xs" color="neutral" variant="ghost" @click="visible = false" />
    </div>

    <div class="max-h-36 overflow-y-auto divide-y divide-gray-800/40">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="flex gap-2 px-3 py-1.5 text-xs"
      >
        <span class="text-gray-600 shrink-0 tabular-nums">{{ formatTime(entry.reportedAt) }}</span>
        <span :class="entry.isFalseReport ? 'text-gray-600 line-through' : 'text-gray-300'">
          {{ formatReport(entry) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SightingReport } from '@game/types'
import type { GameTime } from '@game/types'

const intelStore = useIntelligenceStore()
const visible = ref(true)

const entries = computed<SightingReport[]>(() => {
  if (!visible.value) return []
  return intelStore.sightingLog.slice(0, 10)
})

function formatTime(t: GameTime): string {
  const hh = String(t.hour).padStart(2, '0')
  const mm = String(t.minute).padStart(2, '0')
  return `D${t.day} ${hh}:${mm}`
}

function formatReport(r: SightingReport): string {
  const type = r.reportedContactType.replace(/-/g, ' ')
  const hex = `${r.contactHex.q},${r.contactHex.r}`
  return `${r.reportedBy === 'allied' ? 'US' : 'IJN'} sighted ${type} at ${hex}`
}

// Re-show log when new entries arrive
watch(() => intelStore.sightingLog.length, () => { visible.value = true })
</script>
