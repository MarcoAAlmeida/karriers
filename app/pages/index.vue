<template>
  <div class="w-screen h-screen overflow-hidden bg-gray-950">

    <!-- Scenario selection — shown when no game is in progress -->
    <template v-if="gameStore.phase === 'menu'">
      <MenusScenarioSelectScreen />
    </template>

    <!-- Game view — canvas fills screen, HUD overlaid -->
    <template v-else>
      <div class="relative w-full h-full">
        <GameCanvas class="absolute inset-0" />
        <GameHUD />
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
const gameStore = useGameStore()
</script>
