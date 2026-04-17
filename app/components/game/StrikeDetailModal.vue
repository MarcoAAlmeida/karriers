<template>
  <UModal
    v-model:open="open"
    :title="modalTitle"
    :ui="{ width: 'sm:max-w-lg' }"
  >
    <template #content>
      <div
        data-testid="strike-detail-modal"
        class="p-4 space-y-4"
      >
        <!-- No data guard -->
        <div
          v-if="!plan"
          class="text-sm text-slate-500 text-center py-4"
        >
          No mission data available.
        </div>

        <template v-else>
          <!-- Status row -->
          <div class="flex items-center gap-2 flex-wrap">
            <UBadge
              :color="missionColor"
              variant="soft"
              size="sm"
              class="uppercase tracking-wide"
            >
              {{ plan.mission }}
            </UBadge>
            <UBadge
              :color="statusColor"
              variant="subtle"
              size="sm"
            >
              {{ plan.status }}
            </UBadge>
            <UBadge
              :color="plan.side === 'allied' ? 'info' : 'error'"
              variant="subtle"
              size="sm"
            >
              {{ plan.side === 'allied' ? 'US' : 'IJN' }}
            </UBadge>
          </div>

          <!-- Mission details -->
          <UCard :ui="{ body: { padding: 'px-4 py-3' } }">
            <dl class="space-y-1.5 text-sm">
              <div class="flex gap-2">
                <dt class="text-slate-500 w-24 shrink-0">
                  Squadrons
                </dt>
                <dd class="text-slate-200">
                  {{ squadronNames || '—' }}
                </dd>
              </div>
              <div class="flex gap-2">
                <dt class="text-slate-500 w-24 shrink-0">
                  Origin
                </dt>
                <dd class="text-slate-200">
                  {{ originCarrierName || '—' }}
                </dd>
              </div>
              <div class="flex gap-2">
                <dt class="text-slate-500 w-24 shrink-0">
                  Target
                </dt>
                <dd class="text-slate-200">
                  {{ targetLabel }}
                </dd>
              </div>
              <div class="flex gap-2">
                <dt class="text-slate-500 w-24 shrink-0">
                  Launched
                </dt>
                <dd class="font-mono text-slate-300">
                  {{ formatTime(plan.launchTime) }}
                </dd>
              </div>
              <div
                v-if="plan.eta"
                class="flex gap-2"
              >
                <dt class="text-slate-500 w-24 shrink-0">
                  {{ strikeResult ? 'Resolved' : 'ETA' }}
                </dt>
                <dd class="font-mono text-slate-300">
                  {{ strikeResult ? formatTime(strikeResult.resolvedAt) : formatTime(plan.eta) }}
                </dd>
              </div>
            </dl>
          </UCard>

          <!-- Aircraft summary -->
          <UCard :ui="{ body: { padding: 'px-4 py-3' } }">
            <p class="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
              Aircraft
            </p>
            <div class="flex gap-6 text-sm">
              <div class="text-center">
                <p class="text-slate-400 text-xs mb-0.5">
                  Lost
                </p>
                <p class="text-red-400 font-semibold text-base tabular-nums">
                  {{ plan.aircraftLost }}
                </p>
              </div>
              <div
                v-if="strikeResult"
                class="text-center"
              >
                <p class="text-slate-400 text-xs mb-0.5">
                  Returning
                </p>
                <p class="text-green-400 font-semibold text-base tabular-nums">
                  {{ strikeResult.aircraftReturning }}
                </p>
              </div>
              <div
                v-if="strikeResult?.airCombat"
                class="text-center"
              >
                <p class="text-slate-400 text-xs mb-0.5">
                  Lost to CAP
                </p>
                <p class="text-orange-400 font-semibold text-base tabular-nums">
                  {{ strikeResult.airCombat.attackerLosses }}
                </p>
              </div>
              <div
                v-if="strikeResult"
                class="text-center"
              >
                <p class="text-slate-400 text-xs mb-0.5">
                  Lost to flak
                </p>
                <p class="text-orange-400 font-semibold text-base tabular-nums">
                  {{ strikeResult.flakLosses }}
                </p>
              </div>
            </div>
          </UCard>

          <!-- Combat results (resolved only) -->
          <UCard
            v-if="strikeResult"
            :ui="{ body: { padding: 'px-4 py-3' } }"
          >
            <p class="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
              Combat Results — {{ strikeResult.hits.length }} hit{{ strikeResult.hits.length !== 1 ? 's' : '' }}
            </p>
            <div
              v-if="strikeResult.hits.length"
              class="space-y-1 mb-3"
            >
              <div
                v-for="(hit, i) in strikeResult.hits"
                :key="i"
                class="flex items-center gap-2 text-xs"
              >
                <div class="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                <span class="text-slate-300">
                  {{ shipName(hit.shipId) }} — {{ hit.damageType }}
                  <span
                    v-if="hit.firesStarted"
                    class="text-orange-400"
                  > · {{ hit.firesStarted }} fire{{ hit.firesStarted !== 1 ? 's' : '' }}</span>
                </span>
              </div>
            </div>
            <div
              v-if="strikeResult.narrative.length"
              class="space-y-0.5 border-t border-slate-800 pt-2"
            >
              <p
                v-for="(line, i) in strikeResult.narrative"
                :key="i"
                class="text-xs text-slate-500 leading-relaxed"
              >
                {{ line }}
              </p>
            </div>
          </UCard>
        </template>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { GameTime, StrikeResult } from '@game/types'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ flightPlanId: string | null }>()

useModalPause(open)

const forcesStore = useForcesStore()
const intelStore = useIntelligenceStore()

const plan = computed(() =>
  props.flightPlanId ? forcesStore.flightPlans.get(props.flightPlanId) ?? null : null
)

const strikeResult = computed((): StrikeResult | null => {
  if (!props.flightPlanId) return null
  const event = intelStore.combatLog.find(
    e => e.type === 'strike-resolved' && e.result.flightPlanId === props.flightPlanId
  )
  return event?.type === 'strike-resolved' ? event.result : null
})

const squadrons = computed(() =>
  (plan.value?.squadronIds ?? [])
    .map(id => forcesStore.squadrons.get(id))
    .filter((sq): sq is NonNullable<typeof sq> => sq != null)
)

const squadronNames = computed(() =>
  squadrons.value.map(sq => sq.name).join(', ')
)

const originCarrierName = computed(() => {
  const sq = squadrons.value[0]
  if (!sq) return ''
  return forcesStore.taskGroups.get(sq.taskGroupId)?.name ?? ''
})

const targetLabel = computed(() => {
  if (strikeResult.value) {
    const tg = forcesStore.taskGroups.get(strikeResult.value.targetTaskGroupId)
    if (tg) return tg.name
  }
  const hex = plan.value?.targetHex
  return hex ? `(${hex.q}, ${hex.r})` : '—'
})

const modalTitle = computed(() => {
  if (!plan.value) return 'Strike Details'
  const carrier = originCarrierName.value
  return carrier ? `Strike — ${carrier}` : 'Strike Details'
})

const missionColor = computed(() => {
  switch (plan.value?.mission) {
    case 'strike': return 'error' as const
    case 'cap': return 'warning' as const
    default: return 'neutral' as const
  }
})

const statusColor = computed(() => {
  switch (plan.value?.status) {
    case 'airborne': return 'info' as const
    case 'returning': return 'warning' as const
    case 'recovered': return 'success' as const
    case 'lost': return 'error' as const
    default: return 'neutral' as const
  }
})

function formatTime(t: GameTime): string {
  const days = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const hh = String(t.hour).padStart(2, '0')
  const mm = String(t.minute).padStart(2, '0')
  return `${days[t.day] ?? `D${t.day}`} ${hh}:${mm}`
}

function shipName(shipId: string): string {
  return forcesStore.ships.get(shipId)?.name ?? shipId
}
</script>
