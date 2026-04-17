<template>
  <div class="w-screen h-screen overflow-hidden">
    <!-- Scenario selection — full screen, layout unchanged -->
    <template v-if="gameStore.phase === 'menu'">
      <MenusScenarioSelectScreen />
    </template>

    <!-- Game shell — top bar + left nav + canvas + right events panel -->
    <template v-else>
      <div class="flex flex-col h-full bg-slate-950">
        <ShellTopStatusBar
          :nav-expanded="navExpanded"
          @toggle-nav="navExpanded = !navExpanded"
        />

        <div class="flex flex-1 overflow-hidden">
          <ShellNavSidebar :expanded="navExpanded" />

          <!-- Canvas area — GameHUD floats over this -->
          <div class="relative flex-1 overflow-hidden">
            <GameCanvas class="absolute inset-0" />
            <GameHUD />
          </div>

          <GameEngagementEventsPanel
            :open="eventsOpen"
            @toggle="eventsOpen = !eventsOpen"
            @view-strike="openStrikeDetail"
          />
        </div>
      </div>

      <!-- Strike detail modal — outside shell to avoid stacking context issues -->
      <GameStrikeDetailModal
        v-model:open="strikeModalOpen"
        :flight-plan-id="selectedStrikePlanId"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
const gameStore = useGameStore()
const mapStore = useMapStore()
const navExpanded = ref(false)
const eventsOpen = ref(false)

const strikeModalOpen = ref(false)
const selectedStrikePlanId = ref<string | null>(null)

function openStrikeDetail(planId: string) {
  selectedStrikePlanId.value = planId
  strikeModalOpen.value = true
  // Keep map store selection in sync so Escape (via GameHUD) can close this modal.
  // Vue won't re-trigger the selectedFlightPlanId watcher if the value is unchanged.
  mapStore.selectFlightPlan(planId)
}

// Open modal when a flight plan is selected; close it when selection is cleared
watch(() => mapStore.selectedFlightPlanId, (id) => {
  if (id) {
    openStrikeDetail(id)
  } else if (strikeModalOpen.value) {
    strikeModalOpen.value = false
  }
})

// Clear the map selection when modal is dismissed
watch(strikeModalOpen, (open) => {
  if (!open) mapStore.selectFlightPlan(null)
})
</script>
