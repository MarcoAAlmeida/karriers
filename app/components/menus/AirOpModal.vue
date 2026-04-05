<template>
  <UModal v-model:open="open" title="Air Operations" :ui="{ width: 'sm:max-w-xl' }">
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

          <!-- Launch Strike tab -->
          <template #strike>
            <div class="mt-3 space-y-4">

              <!-- Squadron selection -->
              <div>
                <p class="text-xs text-gray-400 mb-2 uppercase tracking-wide">Select Squadrons</p>
                <div v-if="!availableForStrike.length" class="text-sm text-gray-500 text-center py-2">
                  No squadrons available (must be hangared or spotted).
                </div>
                <div
                  v-for="sq in availableForStrike"
                  :key="sq.id"
                  class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
                  :class="strikeSelected.has(sq.id) ? 'bg-blue-900/40 ring-1 ring-blue-500' : 'bg-gray-900 hover:bg-gray-800'"
                  @click="toggleStrikeSquadron(sq.id)"
                >
                  <div class="w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center"
                    :class="strikeSelected.has(sq.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-600'">
                    <span v-if="strikeSelected.has(sq.id)" class="text-white text-xs leading-none">✓</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-white font-medium truncate">{{ sq.name }}</p>
                    <p class="text-gray-500 text-xs">{{ sq.aircraftCount }} ac · {{ sq.pilotExperience }} · {{ aircraftTypeName(sq.aircraftTypeId) }}</p>
                  </div>
                  <UBadge :color="deckStatusColor(sq.deckStatus)" variant="subtle" size="sm">
                    {{ sq.deckStatus }}
                  </UBadge>
                </div>
              </div>

              <!-- Target picker -->
              <div>
                <p class="text-xs text-gray-400 mb-2 uppercase tracking-wide">Target</p>
                <div v-if="contactOptions.length">
                  <select
                    v-model="strikeTargetContactId"
                    class="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select contact —</option>
                    <option v-for="opt in contactOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </div>
                <div class="flex gap-2 mt-2 items-center">
                  <span class="text-xs text-gray-500 flex-shrink-0">Manual hex:</span>
                  <input
                    v-model.number="manualQ"
                    type="number"
                    placeholder="Q"
                    class="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    v-model.number="manualR"
                    type="number"
                    placeholder="R"
                    class="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <!-- Range warning -->
              <div
                v-if="rangeWarning"
                class="flex gap-2 items-start px-3 py-2 rounded-lg bg-yellow-900/30 border border-yellow-700/50 text-sm text-yellow-300"
              >
                <span class="flex-shrink-0">⚠</span>
                <span>{{ rangeWarning }}</span>
              </div>

              <!-- Launch button -->
              <UButton
                label="Launch Strike"
                color="error"
                block
                :disabled="!canLaunchStrike"
                @click="launchStrike"
              />
            </div>
          </template>

        </UTabs>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { DeckStatus } from '@game/types'
import { AIRCRAFT_TYPES } from '@game/data/aircraftTypes'
import { hexDistance } from '@game/utils/hexMath'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ taskGroupId: string | null }>()

const gameStore = useGameStore()
const forcesStore = useForcesStore()
const intelStore = useIntelligenceStore()

const tabs = [
  { label: 'Deck Status', slot: 'deck' as const },
  { label: 'Airborne',    slot: 'airborne' as const },
  { label: 'CAP',         slot: 'cap' as const },
  { label: 'Strike',      slot: 'strike' as const },
]

// ── Strike tab state ──────────────────────────────────────────────────────

const strikeSelected = ref<Set<string>>(new Set())
const strikeTargetContactId = ref<string>('')
const manualQ = ref<number | null>(null)
const manualR = ref<number | null>(null)

// Reset strike state when modal closes or TG changes
watch([open, () => props.taskGroupId], () => {
  strikeSelected.value = new Set()
  strikeTargetContactId.value = ''
  manualQ.value = null
  manualR.value = null
})

// ── Shared computed ───────────────────────────────────────────────────────

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

// ── Strike tab ────────────────────────────────────────────────────────────

const availableForStrike = computed(() =>
  squadrons.value.filter(sq =>
    (sq.deckStatus === 'hangared' || sq.deckStatus === 'spotted') &&
    !sq.currentMissionId
  )
)

const contactOptions = computed(() =>
  intelStore.activeAlliedContacts.map(c => ({
    label: `${c.contactType} @ (${c.lastKnownHex.q}, ${c.lastKnownHex.r})`,
    value: c.id,
  }))
)

const strikeTargetHex = computed((): { q: number; r: number } | null => {
  if (strikeTargetContactId.value) {
    const contact = intelStore.activeAlliedContacts.find(c => c.id === strikeTargetContactId.value)
    if (contact) return contact.lastKnownHex
  }
  if (manualQ.value !== null && manualR.value !== null) {
    return { q: manualQ.value, r: manualR.value }
  }
  return null
})

const rangeWarning = computed((): string | null => {
  if (!strikeTargetHex.value || !props.taskGroupId) return null
  const tg = forcesStore.taskGroupById(props.taskGroupId)
  if (!tg) return null
  const dist = hexDistance(tg.position, strikeTargetHex.value)
  const distNM = dist * 20

  const outOfRange = [...strikeSelected.value].filter(id => {
    const sq = forcesStore.squadrons.get(id)
    if (!sq) return false
    const ac = AIRCRAFT_TYPES.find(t => t.id === sq.aircraftTypeId)
    return ac ? distNM > ac.maxRange : false
  })

  if (outOfRange.length > 0) {
    return `${outOfRange.length} squadron(s) may be out of range (${distNM} NM to target).`
  }
  return null
})

const canLaunchStrike = computed(() =>
  strikeSelected.value.size > 0 && strikeTargetHex.value !== null && !!props.taskGroupId
)

function toggleStrikeSquadron(id: string): void {
  const s = new Set(strikeSelected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  strikeSelected.value = s
}

function aircraftTypeName(typeId: number): string {
  return AIRCRAFT_TYPES.find(t => t.id === typeId)?.name ?? `type ${typeId}`
}

function launchStrike(): void {
  if (!canLaunchStrike.value || !props.taskGroupId || !strikeTargetHex.value) return
  gameStore.issueOrder({
    type: 'launch-strike',
    taskGroupId: props.taskGroupId,
    squadronIds: [...strikeSelected.value],
    targetHex: strikeTargetHex.value,
  })
  // Reset after launch
  strikeSelected.value = new Set()
  strikeTargetContactId.value = ''
  manualQ.value = null
  manualR.value = null
}
</script>
