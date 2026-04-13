<template>
  <div class="flex shrink-0" data-testid="engagement-events-panel">

    <!-- Toggle strip — always visible -->
    <div
      data-testid="events-panel-toggle"
      class="flex flex-col items-center justify-center w-5 bg-slate-800 border-l border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors"
      :title="open ? 'Collapse events' : 'Expand events'"
      @click="emit('toggle')"
    >
      <UIcon
        :name="open ? 'i-heroicons-chevron-right' : 'i-heroicons-chevron-left'"
        class="w-3 h-3 text-slate-400"
      />
    </div>

    <!-- Panel body -->
    <div
      v-if="open"
      data-testid="events-panel-body"
      class="w-72 flex flex-col bg-slate-900 border-l border-slate-700"
    >

      <!-- Header -->
      <div class="flex items-center justify-between px-3 py-2 border-b border-slate-700 shrink-0">
        <span class="text-[10px] uppercase tracking-widest text-slate-400 font-medium">Engagement Events</span>
        <UBadge
          v-if="entries.length"
          :label="String(entries.length)"
          color="neutral"
          variant="subtle"
          size="xs"
        />
      </div>

      <!-- Events list -->
      <div ref="scrollEl" class="flex-1 overflow-y-auto">
        <div v-if="!entries.length" class="px-3 py-6 text-xs text-slate-600 text-center italic">
          No events yet
        </div>

        <div
          v-for="entry in entries"
          :key="entry.id"
          :data-testid="entry.flightPlanId ? 'strike-entry' : undefined"
          :class="[
            'flex gap-2.5 px-3 py-2 border-b border-slate-800/50',
            entry.flightPlanId
              ? 'cursor-pointer hover:bg-sky-900/30 active:bg-sky-900/50'
              : 'hover:bg-slate-800/30'
          ]"
          @click="entry.flightPlanId ? emit('viewStrike', entry.flightPlanId) : undefined"
        >
          <!-- Color dot -->
          <div class="shrink-0 pt-1">
            <div :class="['w-1.5 h-1.5 rounded-full', entry.dotClass]" />
          </div>

          <!-- Text -->
          <div class="min-w-0 flex-1">
            <p :class="['text-xs leading-snug break-words', entry.textClass]">{{ entry.text }}</p>
            <p class="text-[10px] text-slate-600 tabular-nums mt-0.5">{{ entry.time }}</p>
          </div>

          <!-- Click indicator for strike entries -->
          <UIcon
            v-if="entry.flightPlanId"
            name="i-heroicons-chevron-right"
            class="shrink-0 w-3 h-3 text-slate-600 self-center"
          />
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import type { SightingReport, CombatEvent, GameTime } from '@game/types'

defineProps<{ open: boolean }>()
const emit = defineEmits<{
  toggle: []
  viewStrike: [flightPlanId: string]
}>()

const intelStore = useIntelligenceStore()
const forcesStore = useForcesStore()

const scrollEl = ref<HTMLElement | null>(null)

interface EventEntry {
  id: string
  time: string
  text: string
  sortKey: number
  dotClass: string
  textClass: string
  flightPlanId?: string
}

function formatTime(t: GameTime): string {
  const days = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const hh = String(t.hour).padStart(2, '0')
  const mm = String(t.minute).padStart(2, '0')
  return `${days[t.day] ?? `D${t.day}`} ${hh}:${mm}`
}

function timeKey(t: GameTime): number {
  return t.day * 1440 + t.hour * 60 + t.minute
}

function originCarrierName(flightPlanId: string): string {
  const plan = forcesStore.flightPlans.get(flightPlanId)
  if (!plan) return ''
  const sq = forcesStore.squadrons.get(plan.squadronIds[0] ?? '')
  if (!sq) return ''
  return forcesStore.taskGroups.get(sq.taskGroupId)?.name ?? ''
}

function sightingEntry(r: SightingReport, idx: number): EventEntry | null {
  if (r.isFalseReport || r.confidence < 40) return null
  const who = r.reportedBy === 'allied' ? 'US' : 'IJN'
  const type = r.reportedContactType.replace(/-/g, ' ')
  return {
    id: `s-${idx}`,
    time: formatTime(r.reportedAt),
    text: `${who} sighted ${type} at (${r.contactHex.q}, ${r.contactHex.r})`,
    sortKey: timeKey(r.reportedAt),
    dotClass: 'bg-sky-500',
    textClass: 'text-slate-300'
  }
}

function combatEntry(e: CombatEvent, idx: number): EventEntry | null {
  if (e.type === 'strike-launched') {
    const plan = forcesStore.flightPlans.get(e.flightPlanId)
    const carrier = originCarrierName(e.flightPlanId)
    const target = plan?.targetHex ? `(${plan.targetHex.q}, ${plan.targetHex.r})` : ''
    const label = carrier ? `Strike from ${carrier}${target ? ` → ${target}` : ''}` : 'Strike launched'
    return {
      id: `c-sl-${e.flightPlanId}`,
      time: formatTime(e.at),
      text: label,
      sortKey: timeKey(e.at),
      dotClass: 'bg-blue-500',
      textClass: 'text-blue-300',
      flightPlanId: e.flightPlanId
    }
  }
  if (e.type === 'strike-resolved') {
    const tg = forcesStore.taskGroups.get(e.result.targetTaskGroupId)
    const tgName = tg?.name ?? 'unknown force'
    const hits = e.result.hits.length
    const lost = e.result.aircraftLost
    const t = e.result.resolvedAt
    return {
      id: `c-sr-${idx}`,
      time: formatTime(t),
      text: `Strike vs ${tgName}: ${hits} hit${hits !== 1 ? 's' : ''}, ${lost} a/c lost`,
      sortKey: timeKey(t),
      dotClass: 'bg-amber-400',
      textClass: 'text-amber-300',
      flightPlanId: e.result.flightPlanId
    }
  }
  if (e.type === 'ship-damaged') {
    const ship = forcesStore.ships.get(e.shipId)
    const name = ship?.name ?? e.shipId
    return {
      id: `c-sd-${idx}`,
      time: formatTime(e.at),
      text: `${name} hit (${e.damageType})`,
      sortKey: timeKey(e.at),
      dotClass: 'bg-orange-500',
      textClass: 'text-orange-300'
    }
  }
  if (e.type === 'ship-sunk') {
    const ship = forcesStore.ships.get(e.shipId)
    const name = ship?.name ?? e.shipId
    return {
      id: `c-ss-${idx}`,
      time: formatTime(e.at),
      text: `${name} sunk`,
      sortKey: timeKey(e.at),
      dotClass: 'bg-red-500',
      textClass: 'text-red-400 font-semibold'
    }
  }
  if (e.type === 'cap-launched') {
    const tg = forcesStore.taskGroups.get(e.taskGroupId)
    const tgName = tg?.name ?? 'unknown force'
    return {
      id: `c-cap-${e.flightPlanId}`,
      time: formatTime(e.at),
      text: `CAP over ${tgName}`,
      sortKey: timeKey(e.at),
      dotClass: 'bg-green-500',
      textClass: 'text-green-300'
    }
  }
  if (e.type === 'scout-launched') {
    const plan = forcesStore.flightPlans.get(e.flightPlanId)
    const sq = forcesStore.squadrons.get(plan?.squadronIds[0] ?? '')
    const tgName = sq ? (forcesStore.taskGroups.get(sq.taskGroupId)?.name ?? '') : ''
    const from = tgName ? ` from ${tgName}` : ''
    return {
      id: `c-scl-${e.flightPlanId}`,
      time: formatTime(e.at),
      text: `Scout${from} → (${e.targetHex.q}, ${e.targetHex.r})`,
      sortKey: timeKey(e.at),
      dotClass: 'bg-teal-400',
      textClass: 'text-teal-300'
    }
  }
  if (e.type === 'scout-resolved') {
    return {
      id: `c-scr-${e.flightPlanId}`,
      time: formatTime(e.at),
      text: e.contactFound
        ? `Scout: contact confirmed at (${e.targetHex.q}, ${e.targetHex.r})`
        : `Scout: no contact at (${e.targetHex.q}, ${e.targetHex.r})`,
      sortKey: timeKey(e.at),
      dotClass: e.contactFound ? 'bg-teal-500' : 'bg-slate-500',
      textClass: e.contactFound ? 'text-teal-200' : 'text-slate-400'
    }
  }
  return null
}

const entries = computed<EventEntry[]>(() => {
  const sightings = intelStore.sightingLog
    .map((r, i) => sightingEntry(r, i))
    .filter((e): e is EventEntry => e !== null)

  const combat = intelStore.combatLog
    .map((e, i) => combatEntry(e, i))
    .filter((e): e is EventEntry => e !== null)

  return [...sightings, ...combat].sort((a, b) => b.sortKey - a.sortKey)
})

watch(
  () => entries.value.length,
  () => {
    nextTick(() => {
      if (scrollEl.value) scrollEl.value.scrollTop = 0
    })
  }
)
</script>
