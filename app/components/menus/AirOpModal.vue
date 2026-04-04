<template>
  <UModal v-model:open="open" title="Air Operations" :ui="{ width: 'sm:max-w-lg' }">
    <template #content>
      <div class="p-4">
        <UTabs :items="tabs" class="w-full">

          <!-- Deck Status tab -->
          <template #deck>
            <div class="mt-3 space-y-1">
              <div v-if="!squadrons.length" class="text-sm text-gray-500 text-center py-4">
                No squadrons assigned.
              </div>
              <div
                v-for="sq in squadrons"
                :key="sq.id"
                class="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-900 text-sm"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-white font-medium truncate">{{ sq.name }}</p>
                  <p class="text-gray-500 text-xs">{{ sq.aircraftCount }} aircraft · {{ sq.pilotExperience }}</p>
                </div>
                <UBadge :color="deckStatusColor(sq.deckStatus)" variant="subtle" size="sm">
                  {{ sq.deckStatus }}
                </UBadge>
              </div>
            </div>
          </template>

          <!-- Airborne tab -->
          <template #airborne>
            <div class="mt-3 space-y-1">
              <div v-if="!flightPlans.length" class="text-sm text-gray-500 text-center py-4">
                No active missions.
              </div>
              <div
                v-for="plan in flightPlans"
                :key="plan.id"
                class="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-900 text-sm"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-white font-medium uppercase">{{ plan.mission }}</p>
                  <p class="text-gray-500 text-xs">
                    {{ plan.squadronIds.length }} squadron(s)
                    <span v-if="plan.targetHex"> · target {{ plan.targetHex.q }},{{ plan.targetHex.r }}</span>
                  </p>
                </div>
                <UBadge :color="missionStatusColor(plan.status)" variant="subtle" size="sm">
                  {{ plan.status }}
                </UBadge>
                <UButton
                  v-if="plan.status === 'airborne'"
                  label="Recall"
                  size="xs"
                  color="warning"
                  variant="ghost"
                  @click="recallMission(plan.id)"
                />
              </div>
            </div>
          </template>

          <!-- CAP tab -->
          <template #cap>
            <div class="mt-3 space-y-1">
              <div v-if="!capSquadrons.length" class="text-sm text-gray-500 text-center py-4">
                No CAP assigned. Select a fighter squadron and issue a CAP order.
              </div>
              <div
                v-for="sq in capSquadrons"
                :key="sq.id"
                class="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-900 text-sm"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-white font-medium">{{ sq.name }}</p>
                  <p class="text-gray-500 text-xs">{{ sq.aircraftCount }} aircraft on CAP</p>
                </div>
              </div>
            </div>
          </template>

        </UTabs>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { DeckStatus } from '@game/types'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ taskGroupId: string | null }>()

const gameStore = useGameStore()
const forcesStore = useForcesStore()

const tabs = [
  { label: 'Deck Status', slot: 'deck' as const },
  { label: 'Airborne',    slot: 'airborne' as const },
  { label: 'CAP',         slot: 'cap' as const }
]

const squadrons = computed(() =>
  props.taskGroupId ? forcesStore.squadronsInGroup(props.taskGroupId) : []
)

const flightPlans = computed(() => {
  if (!props.taskGroupId) return []
  const sqIds = new Set(squadrons.value.map(s => s.id))
  return [...forcesStore.flightPlans.values()].filter(fp =>
    fp.squadronIds.some(id => sqIds.has(id)) && fp.status !== 'recovered'
  )
})

const capSquadrons = computed(() =>
  squadrons.value.filter(sq => sq.currentMission?.mission === 'cap')
)

function deckStatusColor(status: DeckStatus): 'success' | 'warning' | 'error' | 'neutral' | 'info' {
  switch (status) {
    case 'spotted':    return 'success'
    case 'airborne':   return 'info'
    case 'recovering': return 'warning'
    case 'rearming':   return 'warning'
    case 'hangared':   return 'neutral'
    default:           return 'neutral'
  }
}

function missionStatusColor(status: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  switch (status) {
    case 'airborne':   return 'info'
    case 'returning':  return 'warning'
    case 'recovered':  return 'success'
    case 'lost':       return 'error'
    default:           return 'neutral'
  }
}

function recallMission(flightPlanId: string): void {
  gameStore.issueOrder({ type: 'recall-mission', flightPlanId })
}
</script>
