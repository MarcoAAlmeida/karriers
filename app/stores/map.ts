export const useMapStore = defineStore('map', () => {
  // ── Selection ─────────────────────────────────────────────────────────────
  const selectedTaskGroupId = ref<string | null>(null)
  const hoveredHex = ref<{ q: number; r: number } | null>(null)

  // ── Flight plan interaction ───────────────────────────────────────────────
  const selectedFlightPlanId = ref<string | null>(null)
  const hoveredFlightPlanId = ref<string | null>(null)
  const hoverScreenPos = ref<{ x: number; y: number } | null>(null)
  const disambiguationPlans = ref<string[]>([])
  const disambiguationPos = ref<{ x: number; y: number } | null>(null)

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

  function selectFlightPlan(id: string | null): void {
    selectedFlightPlanId.value = id
    disambiguationPlans.value = []
    disambiguationPos.value = null
  }

  function hoverFlightPlan(id: string | null, pos: { x: number; y: number } | null): void {
    hoveredFlightPlanId.value = id
    hoverScreenPos.value = pos
  }

  function setDisambiguation(planIds: string[], pos: { x: number; y: number }): void {
    disambiguationPlans.value = planIds
    disambiguationPos.value = pos
  }

  function clearDisambiguation(): void {
    disambiguationPlans.value = []
    disambiguationPos.value = null
  }

  return {
    selectedTaskGroupId,
    hoveredHex,
    selectedFlightPlanId,
    hoveredFlightPlanId,
    hoverScreenPos,
    disambiguationPlans,
    disambiguationPos,
    viewportX,
    viewportY,
    zoom,
    selectTaskGroup,
    setHoveredHex,
    setViewport,
    selectFlightPlan,
    hoverFlightPlan,
    setDisambiguation,
    clearDisambiguation,
  }
})
