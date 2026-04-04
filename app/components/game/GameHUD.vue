<template>
  <!-- Pointer-events disabled globally; interactive controls re-enable per element -->
  <div class="absolute inset-0 pointer-events-none select-none z-10 flex flex-col">

    <!-- ── Top bar ─────────────────────────────────────────────────────── -->
    <GameTimeControls />

    <!-- ── Task group panel ──────────────────────────────────────────── -->
    <GameTaskGroupPanel
      @open-order-modal="showOrderModal = true"
      @open-air-ops-modal="showAirOpsModal = true"
    />

    <!-- ── Intel log ─────────────────────────────────────────────────── -->
    <GameMiniLog />

    <!-- ── Command palette ───────────────────────────────────────────── -->
    <div v-if="showCommandPalette" class="pointer-events-auto absolute inset-0 flex items-start justify-center pt-24 bg-black/40 backdrop-blur-sm z-50" @click.self="showCommandPalette = false">
      <div class="w-full max-w-md" @keydown.escape="showCommandPalette = false">
        <UCommandPalette
          autofocus
          :groups="commandGroups"
          placeholder="Issue order or change speed…"
          @update:model-value="onCommandSelect"
        />
      </div>
    </div>

    <!-- ── Victory overlay ────────────────────────────────────────────── -->
    <Transition name="fade">
      <div
        v-if="gameStore.phase === 'ended'"
        class="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <div class="text-center space-y-4 p-8 rounded-2xl bg-gray-900/90 border border-gray-700 max-w-sm mx-4">
          <h2 class="text-3xl font-bold text-amber-400 tracking-widest uppercase">
            Scenario Ended
          </h2>
          <p class="text-gray-300 text-sm leading-relaxed">
            The battle is over. Review the map, then return to the main menu.
          </p>
          <UButton label="Back to Menu" color="primary" size="lg" @click="gameStore.returnToMenu()" />
        </div>
      </div>
    </Transition>

  </div>

  <!-- ── Modals (outside the pointer-events:none wrapper) ──────────────── -->
  <MenusOrderModal
    v-model:open="showOrderModal"
    :task-group-id="mapStore.selectedTaskGroupId"
  />
  <MenusAirOpModal
    v-model:open="showAirOpsModal"
    :task-group-id="mapStore.selectedTaskGroupId"
  />
</template>

<script setup lang="ts">
import type { CommandPaletteItem } from '@nuxt/ui'
import type { TaskGroupOrder } from '@game/types'
import type { TimeScale } from '@game/engine/TimeSystem'

const gameStore = useGameStore()
const forcesStore = useForcesStore()
const mapStore = useMapStore()

// ── Modal visibility ──────────────────────────────────────────────────────
const showOrderModal = ref(false)
const showAirOpsModal = ref(false)
const showCommandPalette = ref(false)

// ── Game event toasts ─────────────────────────────────────────────────────
useGameEvents()

// ── Keyboard shortcuts ────────────────────────────────────────────────────
defineShortcuts({
  space: {
    handler: () => gameStore.togglePause(),
    usingInput: false
  },
  '1': { handler: () => gameStore.setTimeScale(1 as TimeScale), usingInput: false },
  '2': { handler: () => gameStore.setTimeScale(2 as TimeScale), usingInput: false },
  '4': { handler: () => gameStore.setTimeScale(4 as TimeScale), usingInput: false },
  '8': { handler: () => gameStore.setTimeScale(8 as TimeScale), usingInput: false },
  k: {
    handler: () => { showCommandPalette.value = !showCommandPalette.value },
    usingInput: false
  },
  n: { handler: () => cycleTaskGroup(1), usingInput: false },
  p: { handler: () => cycleTaskGroup(-1), usingInput: false },
  escape: {
    handler: () => {
      if (showCommandPalette.value) { showCommandPalette.value = false; return }
      if (showOrderModal.value) { showOrderModal.value = false; return }
      if (showAirOpsModal.value) { showAirOpsModal.value = false; return }
      mapStore.selectTaskGroup(null)
    },
    usingInput: false
  }
})

// ── Command palette ───────────────────────────────────────────────────────

const ORDER_COMMANDS: { id: string; label: string; icon: string; order: TaskGroupOrder }[] = [
  { id: 'order-standby',   label: 'Standby',   icon: 'i-heroicons-pause-circle',        order: 'standby' },
  { id: 'order-patrol',    label: 'Patrol',    icon: 'i-heroicons-arrow-path',           order: 'patrol' },
  { id: 'order-search',    label: 'Search',    icon: 'i-heroicons-magnifying-glass',     order: 'search' },
  { id: 'order-strike',    label: 'Strike',    icon: 'i-heroicons-bolt',                 order: 'strike' },
  { id: 'order-intercept', label: 'Intercept', icon: 'i-heroicons-arrow-trending-up',    order: 'intercept' },
  { id: 'order-escort',    label: 'Escort',    icon: 'i-heroicons-shield-check',         order: 'escort' },
  { id: 'order-refuel',    label: 'Refuel',    icon: 'i-heroicons-beaker',               order: 'refuel' },
  { id: 'order-retire',    label: 'Retire',    icon: 'i-heroicons-arrow-uturn-left',     order: 'retire' }
]

const SPEED_COMMANDS: CommandPaletteItem[] = [15, 20, 25, 30].map(spd => ({
  id: `speed-${spd}`,
  label: `Set Speed ${spd} kt`,
  icon: 'i-heroicons-arrow-right',
  onSelect: () => {
    const id = mapStore.selectedTaskGroupId
    if (id) gameStore.issueOrder({ type: 'set-speed', taskGroupId: id, speedKnots: spd })
    showCommandPalette.value = false
  }
}))

const commandGroups = computed(() => {
  const selectedTG = mapStore.selectedTaskGroupId
    ? forcesStore.taskGroups.get(mapStore.selectedTaskGroupId)
    : null

  const groups = []

  if (selectedTG) {
    groups.push({
      id: 'orders',
      label: `Orders for ${selectedTG.name}`,
      items: ORDER_COMMANDS.map(cmd => ({
        ...cmd,
        suffix: selectedTG.currentOrder === cmd.order ? 'current' : undefined,
        onSelect: () => {
          gameStore.issueOrder({ type: 'set-order', taskGroupId: selectedTG.id, order: cmd.order })
          showCommandPalette.value = false
        }
      }))
    })
    groups.push({ id: 'speed', label: 'Speed', items: SPEED_COMMANDS })
  }

  // Navigation group — always available
  groups.push({
    id: 'navigation',
    label: 'Task Forces',
    items: forcesStore.alliedTaskGroups.map(tg => ({
      id: `nav-${tg.id}`,
      label: tg.name,
      suffix: tg.currentOrder,
      icon: 'i-heroicons-map-pin',
      onSelect: () => {
        mapStore.selectTaskGroup(tg.id)
        showCommandPalette.value = false
      }
    }))
  })

  return groups
})

function onCommandSelect(item: CommandPaletteItem | null) {
  if (item?.onSelect) item.onSelect(new Event('select'))
}

// ── TG cycling (N / P keys) ───────────────────────────────────────────────
function cycleTaskGroup(dir: 1 | -1) {
  const groups = forcesStore.alliedTaskGroups
  if (!groups.length) return
  const currentId = mapStore.selectedTaskGroupId
  const idx = groups.findIndex(tg => tg.id === currentId)
  const nextIdx = ((idx === -1 ? 0 : idx) + dir + groups.length) % groups.length
  mapStore.selectTaskGroup(groups[nextIdx].id)
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.4s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
