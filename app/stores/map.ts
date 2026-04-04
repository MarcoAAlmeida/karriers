export const useMapStore = defineStore('map', () => {
  // ── Selection ─────────────────────────────────────────────────────────────
  const selectedTaskGroupId = ref<string | null>(null)
  const hoveredHex = ref<{ q: number; r: number } | null>(null)

  // ── Viewport ──────────────────────────────────────────────────────────────
  /** World-space pixel offset of the viewport origin. */
  const viewportX = ref(0)
  const viewportY = ref(0)
  /** Zoom scale factor (1.0 = 1:1 pixels). */
  const zoom = ref(1.0)

  // ── Actions ───────────────────────────────────────────────────────────────

  function selectTaskGroup(id: string | null): void {
    selectedTaskGroupId.value = id
  }

  function setHoveredHex(hex: { q: number; r: number } | null): void {
    hoveredHex.value = hex
  }

  function setViewport(x: number, y: number, z: number): void {
    viewportX.value = x
    viewportY.value = y
    zoom.value = z
  }

  return {
    selectedTaskGroupId,
    hoveredHex,
    viewportX,
    viewportY,
    zoom,
    selectTaskGroup,
    setHoveredHex,
    setViewport
  }
})
