<template>
  <div
    v-if="entries.length"
    class="pointer-events-auto absolute bottom-4 left-4 w-72 rounded-lg bg-gray-950/85 backdrop-blur border border-gray-700 overflow-hidden"
  >
    <div class="flex items-center justify-between px-3 py-1.5 border-b border-gray-800">
      <span class="text-[10px] uppercase tracking-widest text-gray-500">Intel Log</span>
      <UButton
        icon="i-heroicons-x-mark"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="visible = false"
      />
    </div>

    <div class="max-h-36 overflow-y-auto divide-y divide-gray-800/40">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="flex gap-2 px-3 py-1.5 text-xs"
      >
        <span class="text-gray-600 shrink-0 tabular-nums">{{ entry.time }}</span>
        <span :class="entry.className">{{ entry.text }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SightingReport, CombatEvent, GameTime } from '@game/types'

const intelStore = useIntelligenceStore()
const forcesStore = useForcesStore()
const visible = ref(true)

interface LogEntry {
  id: string
  time: string
  text: string
  className: string
  sortKey: number
}

function formatTime(t: GameTime): string {
  const hh = String(t.hour).padStart(2, '0')
  const mm = String(t.minute).padStart(2, '0')
  return `D${t.day} ${hh}:${mm}`
}

function timeToSortKey(t: GameTime): number {
  return t.day * 1440 + t.hour * 60 + t.minute
}

function sightingToEntry(r: SightingReport, idx: number): LogEntry {
  const type = r.reportedContactType.replace(/-/g, ' ')
  const hex = `${r.contactHex.q},${r.contactHex.r}`
  return {
    id: `s-${idx}`,
    time: formatTime(r.reportedAt),
    text: `${r.reportedBy === 'allied' ? 'US' : 'IJN'} sighted ${type} at ${hex}`,
    className: r.isFalseReport ? 'text-gray-600 line-through' : 'text-gray-300',
    sortKey: timeToSortKey(r.reportedAt)
  }
}

function combatToEntry(e: CombatEvent, idx: number): LogEntry | null {
  if (e.type === 'strike-resolved') {
    const tg = forcesStore.taskGroups.get(e.result.targetTaskGroupId)
    const tgName = tg?.name ?? 'unknown force'
    const hits = e.result.hits.length
    const lost = e.result.aircraftLost
    const t = e.result.resolvedAt
    return {
      id: `c-sr-${idx}`,
      time: formatTime(t),
      text: `Strike vs ${tgName}: ${hits} hit${hits !== 1 ? 's' : ''}, ${lost} aircraft lost`,
      className: 'text-amber-400',
      sortKey: timeToSortKey(t)
    }
  }
  if (e.type === 'ship-damaged') {
    const ship = forcesStore.ships.get(e.shipId)
    const name = ship?.name ?? e.shipId
    return {
      id: `c-sd-${idx}`,
      time: formatTime(e.at),
      text: `${name} hit (${e.damageType})`,
      className: 'text-orange-400',
      sortKey: timeToSortKey(e.at)
    }
  }
  if (e.type === 'ship-sunk') {
    const ship = forcesStore.ships.get(e.shipId)
    const name = ship?.name ?? e.shipId
    return {
      id: `c-ss-${idx}`,
      time: formatTime(e.at),
      text: `${name} sunk`,
      className: 'text-red-400 font-semibold',
      sortKey: timeToSortKey(e.at)
    }
  }
  return null
}

const entries = computed<LogEntry[]>(() => {
  if (!visible.value) return []

  const sightingEntries = intelStore.sightingLog
    .slice(0, 50)
    .map((r, i) => sightingToEntry(r, i))

  const combatEntries = intelStore.combatLog
    .slice(0, 50)
    .map((e, i) => combatToEntry(e, i))
    .filter((e): e is LogEntry => e !== null)

  return [...sightingEntries, ...combatEntries]
    .sort((a, b) => b.sortKey - a.sortKey)
    .slice(0, 10)
})

// Re-show log when new entries arrive
watch(
  [() => intelStore.sightingLog.length, () => intelStore.combatLog.length],
  () => { visible.value = true }
)
</script>
