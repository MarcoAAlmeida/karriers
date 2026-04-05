<template>
  <div ref="containerRef" data-testid="game-canvas" class="w-full h-full overflow-hidden" />
</template>

<script setup lang="ts">
const containerRef = ref<HTMLElement | null>(null)

usePixiRenderer(containerRef)
useGameLoop()
</script>
