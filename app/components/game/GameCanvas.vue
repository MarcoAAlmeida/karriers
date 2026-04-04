<template>
  <div ref="containerRef" class="w-full h-full overflow-hidden" />
</template>

<script setup lang="ts">
const containerRef = ref<HTMLElement | null>(null)

usePixiRenderer(containerRef)
useGameLoop()
</script>
