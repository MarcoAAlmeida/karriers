import { Application, Container, Graphics, Text } from 'pixi.js'
import type { Ref } from 'vue'
import type { TaskGroup, FlightPlan, HexCoord, ContactRecord } from '@game/types'
import { gameTimeToMinutes } from '@game/types'
import { hexToPixel, hexCorners, GRID_WIDTH, GRID_HEIGHT, pixelToHex, NM_PER_HEX, getHexSize } from '@game/utils/hexMath'
import { AIRCRAFT_TYPES } from '@game/data/aircraftTypes'
import { useHexMap } from './useHexMap'

// ── Colour palette ─────────────────────────────────────────────────────────

const COL = {
  ocean: 0x0d2137,
  oceanHex: 0x112845,
  gridLine: 0x1e4a6b,
  atoll: 0x2a5c35,
  atollBorder: 0x3d8a4e,
  allied: 0x2a6fcf,
  alliedBorder: 0x5599ff,
  japanese: 0xcc2200,
  japaneseBorder: 0xff5533,
  contact: 0xffaa00,
  contactBorder: 0xffdd44,
  selection: 0xffee33,
  flightPath: 0xffd070,
  fog: 0x000000,
  hover: 0xffffff,
  labelAllied: 0xaad4ff,
  labelJapanese: 0xffaa88,
  labelContact: 0xffdd88,
  midwayLabel: 0x88cc66,
  rangeSearch: 0x4499ff,    // blue search ring (IJN: red tinted via side check)
  rangeStrike: 0xffcc33,    // amber strike ring
}

// ── Known atoll/island hex positions ──────────────────────────────────────

const ATOLL_HEXES: Array<{ q: number; r: number }> = [
  { q: 35, r: 55 }  // Midway Atoll
]

// ── usePixiRenderer ────────────────────────────────────────────────────────

export function usePixiRenderer(containerRef: Ref<HTMLElement | null>) {
  useHexMap()   // ensure grid is initialised

  // Stores
  const forcesStore = useForcesStore()
  const intelStore = useIntelligenceStore()
  const mapStore = useMapStore()
  const gameStore = useGameStore()

  // PixiJS internals
  let app: Application | null = null
  let world: Container          // panned/zoomed container
  let terrainLayer: Graphics
  let gridLayer: Graphics
  let rangeRingLayer: Graphics
  let fogLayer: Container
  let contactLayer: Container
  let sunkMarkerLayer: Container
  let unitLayer: Container
  let flightPathLayer: Graphics
  let strikeDotLayer: Container
  let capLayer: Graphics
  let selectionLayer: Graphics
  let annotationLayer: Container

  // Unit token map
  const unitTokens = new Map<string, Container>()

  // Strike dot token map (one Container per active FlightPlan)
  const strikeDotTokens = new Map<string, Container>()

  // Pixel origin captured at the moment a flight plan first goes airborne.
  // Used to anchor arcs and animated dots to the carrier's launch position.
  const planOriginPx = new Map<string, { x: number; y: number }>()

  // Smooth interpolation: pixel positions before and after last step
  const prevPos = new Map<string, { x: number; y: number }>()
  const currPos = new Map<string, { x: number; y: number }>()

  // Pan/zoom state (local — not reactive, manipulated inside PixiJS)
  let vpX = 0
  let vpY = 0
  let vpZoom = 1.0
  let isDragging = false
  let dragStartX = 0
  let dragStartY = 0
  let dragVpStartX = 0
  let dragVpStartY = 0
  // Set to true when Pixi fires pointertap on a dot; checked in DOM pointerup
  // to avoid clearing disambiguation that was just set by the dot tap
  let dotTappedThisFrame = false

  // ── Init ────────────────────────────────────────────────────────────────

  onMounted(async () => {
    const el = containerRef.value
    if (!el) return

    app = new Application()
    await app.init({
      resizeTo: el,
      background: COL.ocean,
      antialias: true,
      autoDensity: true,
      resolution: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
    })

    el.appendChild(app.canvas as HTMLCanvasElement)

    // World container — all layers go inside; we translate this for pan/zoom
    world = new Container()
    app.stage.addChild(world)

    terrainLayer    = new Graphics()
    gridLayer       = new Graphics()
    rangeRingLayer  = new Graphics()
    fogLayer        = new Container()
    contactLayer    = new Container()
    sunkMarkerLayer = new Container()
    unitLayer       = new Container()
    flightPathLayer = new Graphics()
    strikeDotLayer  = new Container()
    capLayer        = new Graphics()
    selectionLayer  = new Graphics()
    annotationLayer = new Container()

    world.addChild(terrainLayer, gridLayer, rangeRingLayer, fogLayer, contactLayer, sunkMarkerLayer, unitLayer, flightPathLayer, strikeDotLayer, capLayer, selectionLayer, annotationLayer)

    drawTerrain()
    drawGrid()
    centreViewport()
    applyViewport()

    setupPointerEvents()

    // Pixi ticker: interpolate unit positions every frame
    app.ticker.add(onTick)

    // Watch for step changes in forces store
    watch(() => forcesStore.taskGroups, onTaskGroupsChanged, { immediate: true })
    watch(() => forcesStore.flightPlans, onFlightPlansChanged, { immediate: true })
    watch(() => mapStore.selectedTaskGroupId, drawSelection)
    watch(() => gameStore.phase, onPhaseChanged)
    // Rebuild tokens and range rings when contact picture changes (fog-of-war)
    watch(() => intelStore.activeAlliedContacts, () => {
      rebuildUnitTokens(forcesStore.taskGroups)
      drawRangeRings(forcesStore.taskGroups)
    })
    // Redraw sunk markers whenever new ships go down
    watch(() => intelStore.sunkMarkers, drawSunkMarkers, { immediate: true })
  })

  onUnmounted(() => {
    app?.destroy(true, { children: true, texture: true })
    app = null
  })

  // ── Terrain ──────────────────────────────────────────────────────────────

  function drawTerrain(): void {
    terrainLayer.clear()

    for (const atoll of ATOLL_HEXES) {
      const corners = hexCorners(atoll)
      const flat: number[] = corners.flatMap(c => [c.x, c.y])
      terrainLayer
        .poly(flat)
        .fill({ color: COL.atoll })
        .stroke({ color: COL.atollBorder, width: 1.5 })
    }

    // Midway label
    const midwayPx = hexToPixel({ q: 35, r: 55 })
    const label = new Text({ text: 'Midway', style: { fill: COL.midwayLabel, fontSize: 9, fontFamily: 'sans-serif' } })
    label.anchor.set(0.5, 0.5)
    label.x = midwayPx.x
    label.y = midwayPx.y
    annotationLayer.addChild(label)
  }

  function drawGrid(): void {
    gridLayer.clear()

    for (let q = 0; q < GRID_WIDTH; q++) {
      for (let r = 0; r < GRID_HEIGHT; r++) {
        const corners = hexCorners({ q, r })
        const flat: number[] = corners.flatMap(c => [c.x, c.y])
        gridLayer
          .poly(flat)
          .stroke({ color: COL.gridLine, width: 0.5, alpha: 0.6 })
      }
    }
  }

  // ── Sunk markers ─────────────────────────────────────────────────────────

  function drawSunkMarkers(): void {
    sunkMarkerLayer.removeChildren()

    for (const marker of intelStore.sunkMarkers) {
      const px = hexToPixel(marker.hex)

      const token = new Container()
      token.x = px.x
      token.y = px.y

      // Outer dark-red diamond — same shape as a contact but larger and clearly sunk
      const g = new Graphics()
      g.poly([-15, 0, 0, -15, 15, 0, 0, 15])
        .fill({ color: 0x6b0000, alpha: 0.92 })
        .stroke({ color: 0xff2200, width: 2 })
      token.addChild(g)

      // Bold ✕ centred on the diamond, large enough to read at default zoom
      const lbl = new Text({
        text: '✕',
        style: { fill: 0xff8888, fontSize: 14, fontFamily: 'monospace', fontWeight: 'bold' },
      })
      lbl.anchor.set(0.5, 0.5)
      token.addChild(lbl)

      sunkMarkerLayer.addChild(token)
    }
  }

  // ── Fog-of-war helpers ───────────────────────────────────────────────────

  function getContactForTG(tgId: string): ContactRecord | undefined {
    return intelStore.activeAlliedContacts.find(c => c.confirmedTaskGroupId === tgId)
  }

  // ── Units ────────────────────────────────────────────────────────────────

  function onTaskGroupsChanged(tgs: Map<string, TaskGroup>): void {
    // Update currPos — prevPos = old currPos
    for (const [id, pos] of currPos) {
      prevPos.set(id, { ...pos })
    }
    for (const tg of tgs.values()) {
      const px = hexToPixel(tg.position)
      currPos.set(tg.id, { x: px.x, y: px.y })
      if (!prevPos.has(tg.id)) prevPos.set(tg.id, { x: px.x, y: px.y })
    }

    rebuildUnitTokens(tgs)
    drawRangeRings(tgs)
  }

  function rebuildUnitTokens(tgs: Map<string, TaskGroup>): void {
    // Remove tokens for TGs no longer present
    for (const [id, token] of unitTokens) {
      if (!tgs.has(id)) {
        unitLayer.removeChild(token)
        unitTokens.delete(id)
      }
    }

    for (const tg of tgs.values()) {
      const isAllied = tg.side === 'allied'

      if (!isAllied) {
        // Fog-of-war: enemy TGs only render if there is a confirmed active contact
        const contact = getContactForTG(tg.id)
        let token = unitTokens.get(tg.id)

        const hasActiveSurvivors = forcesStore.shipsInGroup(tg.id).some(s => s.status !== 'sunk')
        const shouldHide = !contact || !hasActiveSurvivors

        if (shouldHide) {
          // No contact, or entire TF wiped out — remove token
          if (token) {
            unitLayer.removeChild(token)
            unitTokens.delete(tg.id)
          }
          continue
        }

        // Confirmed contact — render square at lastKnownHex
        if (!token) {
          token = buildUnitToken(tg, contact.lastKnownHex)
          unitLayer.addChild(token)
          unitTokens.set(tg.id, token)
        } else {
          token.removeChildren()
          const rebuilt = buildUnitToken(tg, contact.lastKnownHex)
          for (const child of rebuilt.children.slice()) {
            rebuilt.removeChild(child)
            token.addChild(child)
          }
          const px = hexToPixel(contact.lastKnownHex)
          token.x = px.x
          token.y = px.y
        }
        continue
      }

      // Allied TG — normal rendering
      let token = unitTokens.get(tg.id)
      if (!token) {
        token = buildUnitToken(tg)
        unitLayer.addChild(token)
        unitTokens.set(tg.id, token)
      } else {
        // Refresh appearance (status may have changed)
        token.removeChildren()
        const rebuilt = buildUnitToken(tg)
        for (const child of rebuilt.children.slice()) {
          rebuilt.removeChild(child)
          token.addChild(child)
        }
      }
    }
  }

  function buildUnitToken(tg: TaskGroup, contactPos?: HexCoord): Container {
    const isAllied = tg.side === 'allied'
    const isContact = contactPos !== undefined   // only called with contactPos for confirmed enemy contact tokens

    const token = new Container()
    token.label = tg.id

    const fillColor   = isAllied ? COL.allied    : COL.japanese
    const borderColor = isAllied ? COL.alliedBorder : COL.japaneseBorder
    const labelColor  = isAllied ? COL.labelAllied  : COL.labelJapanese

    // Square token — half-size S gives a 2S × 2S square matching ~radius-13 circle area
    const S = 11
    const g = new Graphics()
    g.rect(-S, -S, S * 2, S * 2)
      .fill({ color: fillColor })
      .stroke({ color: borderColor, width: 1.5 })
    token.addChild(g)

    // Carrier indicator — small white diamond inside the square
    const ships = forcesStore.shipsInGroup(tg.id)
    const hasCarrier = ships.some(s => {
      const sc = gameStore.engine?.['state']?.shipClasses?.get(s.classId)
      return sc?.type?.includes('carrier')
    })
    if (hasCarrier) {
      const dot = new Graphics()
      dot.circle(0, 0, 4).fill({ color: 0xffffff, alpha: 0.8 })
      token.addChild(dot)
    }

    // Label: show '?' for unconfirmed contacts, abbreviated name otherwise
    const labelText = isContact && !isAllied ? '?' : (tg.name.length > 6 ? tg.name.slice(0, 6) : tg.name)
    const lbl = new Text({ text: labelText, style: { fill: labelColor, fontSize: 9, fontFamily: 'sans-serif' } })
    lbl.anchor.set(0.5, 2.2)
    token.addChild(lbl)

    // Pointer events
    token.eventMode = 'static'
    token.cursor = 'pointer'
    token.on('pointertap', () => mapStore.selectTaskGroup(tg.id))

    const px = hexToPixel(contactPos ?? tg.position)
    token.x = px.x
    token.y = px.y

    return token
  }

  // ── Range rings ───────────────────────────────────────────────────────────

  /** Best search range (NM) achievable by any squadron in this task group. */
  function getBestSearchRangeNm(tgId: string): number {
    let best = 0
    for (const sq of forcesStore.squadrons.values()) {
      if (sq.taskGroupId !== tgId || sq.deckStatus === 'destroyed' || sq.aircraftCount === 0) continue
      const ac = AIRCRAFT_TYPES.find(a => a.id === sq.aircraftTypeId)
      if (!ac) continue
      const r = (ac.role === 'scout' || ac.role === 'patrol-bomber') ? ac.maxRange : ac.maxRange * 0.45
      if (r > best) best = r
    }
    return best
  }

  /** One-way strike range (NM) for the longest-legged attack aircraft in this task group. */
  function getBestStrikeRangeNm(tgId: string): number {
    let best = 0
    for (const sq of forcesStore.squadrons.values()) {
      if (sq.taskGroupId !== tgId || sq.deckStatus === 'destroyed' || sq.aircraftCount === 0) continue
      const ac = AIRCRAFT_TYPES.find(a => a.id === sq.aircraftTypeId)
      if (!ac || ac.role === 'fighter') continue
      // maxRange × 0.5 (round-trip) × 0.85 (fuel reserve) — same as AirOpsSystem
      const r = ac.maxRange * 0.5 * 0.85
      if (r > best) best = r
    }
    return best
  }

  function drawRangeRings(tgs: Map<string, TaskGroup>): void {
    rangeRingLayer.clear()
    const nmToPx = getHexSize() / NM_PER_HEX

    for (const tg of tgs.values()) {
      const isAllied = tg.side === 'allied'
      let px: { x: number; y: number }

      if (!isAllied) {
        // Only draw for confirmed contacts (visible to player)
        const contact = getContactForTG(tg.id)
        if (!contact) continue
        px = hexToPixel(contact.lastKnownHex)
      } else {
        px = hexToPixel(tg.position)
      }

      const searchColor = isAllied ? COL.allied    : COL.japanese
      const strikeColor = isAllied ? COL.rangeStrike : COL.rangeStrike

      const searchNm = getBestSearchRangeNm(tg.id)
      const strikeNm = getBestStrikeRangeNm(tg.id)

      if (searchNm > 0) {
        rangeRingLayer
          .circle(px.x, px.y, searchNm * nmToPx)
          .stroke({ color: searchColor, width: 1, alpha: 0.18 })
      }
      if (strikeNm > 0) {
        rangeRingLayer
          .circle(px.x, px.y, strikeNm * nmToPx)
          .stroke({ color: strikeColor, width: 1.5, alpha: 0.14 })
      }
    }
  }

  // ── Ticker: smooth interpolation ──────────────────────────────────────────

  function onTick(): void {
    if (!app) return
    const fraction = gameStore.stepFraction

    for (const [id, token] of unitTokens) {
      const tg = forcesStore.taskGroups.get(id)
      // Enemy contact tokens are static at lastKnownHex — skip interpolation
      if (tg && tg.side === 'japanese') continue

      const prev = prevPos.get(id)
      const curr = currPos.get(id)
      if (prev && curr) {
        token.x = prev.x + (curr.x - prev.x) * fraction
        token.y = prev.y + (curr.y - prev.y) * fraction
      }
    }

    // Animated strike dots — position + interactive tokens
    updateStrikeDots()

    // CAP orbit rings
    drawCAPRings()

    // ── Selection rings ───────────────────────────────────────────────────
    selectionLayer.clear()

    // Task group selection ring + destination marker + highlighted range rings
    const selId = mapStore.selectedTaskGroupId
    if (selId) {
      const token = unitTokens.get(selId)
      if (token) {
        selectionLayer.circle(token.x, token.y, 20).stroke({ color: COL.selection, width: 2, alpha: 0.9 })

        const tg = forcesStore.taskGroups.get(selId)
        if (tg?.destination) {
          const dest = hexToPixel(tg.destination)
          const r = 9
          selectionLayer
            .moveTo(dest.x - r, dest.y - r).lineTo(dest.x + r, dest.y + r)
            .moveTo(dest.x + r, dest.y - r).lineTo(dest.x - r, dest.y + r)
            .stroke({ color: COL.selection, width: 2, alpha: 0.75 })
        }

        // Highlighted range rings for selected unit
        const nmToPx = getHexSize() / NM_PER_HEX
        const searchNm = getBestSearchRangeNm(selId)
        const strikeNm = getBestStrikeRangeNm(selId)
        if (searchNm > 0) {
          selectionLayer
            .circle(token.x, token.y, searchNm * nmToPx)
            .stroke({ color: 0xffff44, width: 1.5, alpha: 0.65 })
        }
        if (strikeNm > 0) {
          selectionLayer
            .circle(token.x, token.y, strikeNm * nmToPx)
            .stroke({ color: 0xffaa22, width: 2, alpha: 0.55 })
        }
      }
    }

    // Flight plan selection ring (pulsing white ring around the selected dot)
    const selPlanId = mapStore.selectedFlightPlanId
    if (selPlanId) {
      const dotToken = strikeDotTokens.get(selPlanId)
      if (dotToken) {
        const pulse = 1 + 0.15 * Math.sin(Date.now() * 0.006)
        selectionLayer
          .circle(dotToken.x, dotToken.y, 10 * pulse)
          .stroke({ color: 0xffffff, width: 2, alpha: 0.9 })
      }
    }

    // Range rings for all in-flight squadron dots
    const nmToPx = getHexSize() / NM_PER_HEX
    for (const [planId, dotToken] of strikeDotTokens) {
      const plan = forcesStore.flightPlans.get(planId)
      if (!plan) continue
      const sq = forcesStore.squadrons.get(plan.squadronIds[0] ?? '')
      if (!sq) continue
      const ac = AIRCRAFT_TYPES.find(a => a.id === sq.aircraftTypeId)
      if (!ac) continue
      const rangeNm = ac.maxRange * 0.5 * 0.85
      const color = plan.side === 'allied' ? COL.allied : COL.japanese
      selectionLayer
        .circle(dotToken.x, dotToken.y, rangeNm * nmToPx)
        .stroke({ color, width: 1.5, alpha: 0.35 })
    }
  }

  // ── Flight paths ──────────────────────────────────────────────────────────

  /** Redraws flight paths whenever the plans map changes. */
  function onFlightPlansChanged(plans: Map<string, FlightPlan>): void {
    // Prune stale planOriginPx entries (fallback for plans without currentHex)
    for (const id of planOriginPx.keys()) {
      if (!plans.has(id)) planOriginPx.delete(id)
    }
    // Capture origin for plans that predate Sprint 22 (no currentHex set)
    for (const plan of plans.values()) {
      if (planOriginPx.has(plan.id)) continue
      if (plan.status !== 'airborne') continue
      if (!plan.targetHex) continue
      const sq = forcesStore.squadrons.get(plan.squadronIds[0] ?? '')
      if (!sq) continue
      const tg = forcesStore.taskGroups.get(sq.taskGroupId)
      if (!tg) continue
      const px = hexToPixel(tg.position)
      planOriginPx.set(plan.id, { x: px.x, y: px.y })
    }
    drawFlightPaths(plans)
  }

  /** Evaluate a quadratic bezier at parameter t (0–1). */
  function bezierPoint(
    t: number,
    p0: { x: number; y: number },
    cp: { x: number; y: number },
    p1: { x: number; y: number }
  ): { x: number; y: number } {
    const mt = 1 - t
    return {
      x: mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p1.x,
      y: mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p1.y,
    }
  }

  function drawFlightPaths(plans: Map<string, FlightPlan>): void {
    flightPathLayer.clear()

    for (const plan of plans.values()) {
      if (!plan.targetHex) continue

      const isOutbound = plan.status === 'airborne' || plan.status === 'inbound'
      const isReturning = plan.status === 'returning'
      if (!isOutbound && !isReturning) continue

      // Arc origin: use live currentHex (Sprint 22) or fall back to captured launch pixel
      const originPx = plan.currentHex
        ? hexToPixel(plan.currentHex)
        : planOriginPx.get(plan.id)
      if (!originPx) continue

      const target = hexToPixel(plan.targetHex)

      if (isOutbound) {
        // Outbound arc: current position → target
        const mx = (originPx.x + target.x) / 2
        const my = (originPx.y + target.y) / 2 - 60

        flightPathLayer.moveTo(originPx.x, originPx.y)
        flightPathLayer.quadraticCurveTo(mx, my, target.x, target.y)
        flightPathLayer.stroke({ color: COL.flightPath, width: 1.5, alpha: 0.7 })

        // Arrowhead at target
        const angle = Math.atan2(target.y - my, target.x - mx)
        const arrowLen = 10
        flightPathLayer.moveTo(target.x, target.y)
        flightPathLayer.lineTo(target.x - Math.cos(angle - 0.4) * arrowLen, target.y - Math.sin(angle - 0.4) * arrowLen)
        flightPathLayer.moveTo(target.x, target.y)
        flightPathLayer.lineTo(target.x - Math.cos(angle + 0.4) * arrowLen, target.y - Math.sin(angle + 0.4) * arrowLen)
        flightPathLayer.stroke({ color: COL.flightPath, width: 1.5, alpha: 0.7 })
      } else {
        // Return arc: current position → home carrier (carrier may have moved)
        const sq = forcesStore.squadrons.get(plan.squadronIds[0] ?? '')
        if (!sq) continue
        const tg = forcesStore.taskGroups.get(sq.taskGroupId)
        if (!tg) continue
        const carrierPx = hexToPixel(tg.position)

        const mx = (originPx.x + carrierPx.x) / 2
        const my = (originPx.y + carrierPx.y) / 2 - 60

        flightPathLayer.moveTo(originPx.x, originPx.y)
        flightPathLayer.quadraticCurveTo(mx, my, carrierPx.x, carrierPx.y)
        flightPathLayer.stroke({ color: COL.flightPath, width: 1, alpha: 0.4 })

        // Arrowhead at carrier
        const angle = Math.atan2(carrierPx.y - my, carrierPx.x - mx)
        const arrowLen = 8
        flightPathLayer.moveTo(carrierPx.x, carrierPx.y)
        flightPathLayer.lineTo(carrierPx.x - Math.cos(angle - 0.4) * arrowLen, carrierPx.y - Math.sin(angle - 0.4) * arrowLen)
        flightPathLayer.moveTo(carrierPx.x, carrierPx.y)
        flightPathLayer.lineTo(carrierPx.x - Math.cos(angle + 0.4) * arrowLen, carrierPx.y - Math.sin(angle + 0.4) * arrowLen)
        flightPathLayer.stroke({ color: COL.flightPath, width: 1, alpha: 0.4 })
      }
    }
  }

  // ── CAP orbit rings ───────────────────────────────────────────────────────

  /**
   * Draws small rotating dots orbiting each allied TF that has active CAP.
   * Redrawn every tick for smooth animation.
   */
  function drawCAPRings(): void {
    capLayer.clear()
    const t = Date.now() / 1000   // seconds

    for (const plan of forcesStore.flightPlans.values()) {
      if (plan.mission !== 'cap' || plan.status !== 'airborne') continue

      const sq = forcesStore.squadrons.get(plan.squadronIds[0] ?? '')
      if (!sq) continue
      const token = unitTokens.get(sq.taskGroupId)
      if (!token) continue

      const side = sq.side
      const color = side === 'allied' ? 0x44aaff : 0xff7744
      const orbitR = 26
      const numDots = Math.min(plan.squadronIds.length * 2 + 2, 8)

      for (let i = 0; i < numDots; i++) {
        const angle = (i / numDots) * Math.PI * 2 + t * 1.0
        const dx = Math.cos(angle) * orbitR
        const dy = Math.sin(angle) * orbitR
        capLayer
          .circle(token.x + dx, token.y + dy, 2.5)
          .fill({ color, alpha: 0.9 })
      }
    }
  }

  // ── Animated strike dots ──────────────────────────────────────────────────

  /** Build an interactive Container for a single in-flight squadron dot. */
  function buildStrikeDotToken(planId: string): Container {
    const container = new Container()
    container.label = planId

    // Visual dot (index 0) — redrawn each tick as status/selection changes
    const g = new Graphics()
    container.addChild(g)

    // Transparent hit area larger than the visual (easier to click)
    const hit = new Graphics()
    hit.circle(0, 0, 16).fill({ color: 0x000000, alpha: 0.001 })
    container.addChild(hit)

    container.eventMode = 'static'
    container.cursor = 'pointer'

    container.on('pointertap', (e) => {
      e.stopPropagation()
      dotTappedThisFrame = true
      const screenX = container.x * vpZoom + vpX
      const screenY = container.y * vpZoom + vpY

      // Find all dot tokens close enough to count as overlapping
      const OVERLAP_R = 15  // screen-space pixels
      const overlapping: string[] = []
      for (const [otherId, other] of strikeDotTokens) {
        const ox = other.x * vpZoom + vpX
        const oy = other.y * vpZoom + vpY
        if (Math.hypot(ox - screenX, oy - screenY) < OVERLAP_R * 2) {
          overlapping.push(otherId)
        }
      }

      if (overlapping.length > 1) {
        mapStore.setDisambiguation(overlapping, { x: screenX, y: screenY })
      } else {
        mapStore.selectFlightPlan(planId)
      }
    })

    container.on('pointerover', (e) => {
      mapStore.hoverFlightPlan(planId, { x: e.global.x, y: e.global.y })
    })

    container.on('pointerout', () => {
      if (mapStore.hoveredFlightPlanId === planId) {
        mapStore.hoverFlightPlan(null, null)
      }
    })

    return container
  }

  /** Update dot Container positions and visuals every tick; create/remove as plans change. */
  function updateStrikeDots(): void {
    const nowMin = gameTimeToMinutes(gameStore.currentTime) + gameStore.stepFraction * 30
    const activePlanIds = new Set<string>()

    for (const plan of forcesStore.flightPlans.values()) {
      if (!plan.targetHex) continue

      const target = hexToPixel(plan.targetHex)
      let dotPos: { x: number; y: number } | null = null

      if ((plan.status === 'airborne' || plan.status === 'inbound') && plan.eta) {
        // Arc origin: live currentHex (Sprint 22) or legacy captured origin
        const originPx = plan.currentHex
          ? hexToPixel(plan.currentHex)
          : planOriginPx.get(plan.id)
        if (!originPx) continue

        if (plan.currentHexTime && plan.currentHex) {
          // Sprint 22: animate from currentHex toward targetHex using time since currentHexTime
          const currentHexMin = gameTimeToMinutes(plan.currentHexTime)
          const etaMin = gameTimeToMinutes(plan.eta)
          const total = etaMin - currentHexMin
          if (total > 0) {
            const t = Math.min(1, Math.max(0, (nowMin - currentHexMin) / total))
            const cp = { x: (originPx.x + target.x) / 2, y: (originPx.y + target.y) / 2 - 60 }
            dotPos = bezierPoint(t, originPx, cp, target)
          } else {
            dotPos = target
          }
        } else {
          // Legacy: full-path interpolation from launch to eta
          const launchMin = gameTimeToMinutes(plan.launchTime)
          const etaMin = gameTimeToMinutes(plan.eta)
          const total = etaMin - launchMin
          if (total > 0) {
            const t = Math.min(1, Math.max(0, (nowMin - launchMin) / total))
            const cp = { x: (originPx.x + target.x) / 2, y: (originPx.y + target.y) / 2 - 60 }
            dotPos = bezierPoint(t, originPx, cp, target)
          }
        }
      } else if (plan.status === 'returning' && plan.eta && plan.returnEta) {
        const sq = forcesStore.squadrons.get(plan.squadronIds[0] ?? '')
        if (!sq) continue
        const tg = forcesStore.taskGroups.get(sq.taskGroupId)
        if (!tg) continue
        const carrierPx = hexToPixel(tg.position)

        // Arc origin: live currentHex or fall back to targetHex (strike point)
        const originPx = plan.currentHex
          ? hexToPixel(plan.currentHex)
          : target

        if (plan.currentHexTime && plan.currentHex) {
          // Sprint 22: animate from currentHex toward carrier using time since currentHexTime
          const currentHexMin = gameTimeToMinutes(plan.currentHexTime)
          const returnMin = gameTimeToMinutes(plan.returnEta)
          const total = returnMin - currentHexMin
          if (total > 0) {
            const t = Math.min(1, Math.max(0, (nowMin - currentHexMin) / total))
            const cp = { x: (originPx.x + carrierPx.x) / 2, y: (originPx.y + carrierPx.y) / 2 - 60 }
            dotPos = bezierPoint(t, originPx, cp, carrierPx)
          } else {
            dotPos = carrierPx
          }
        } else {
          // Legacy: interpolate from strike point to carrier
          const etaMin = gameTimeToMinutes(plan.eta)
          const returnMin = gameTimeToMinutes(plan.returnEta)
          const total = returnMin - etaMin
          if (total > 0) {
            const t = Math.min(1, Math.max(0, (nowMin - etaMin) / total))
            const cp = { x: (target.x + carrierPx.x) / 2, y: (target.y + carrierPx.y) / 2 - 60 }
            dotPos = bezierPoint(t, target, cp, carrierPx)
          }
        }
      }

      if (!dotPos) continue
      activePlanIds.add(plan.id)

      // Create token if not yet present
      let dotToken = strikeDotTokens.get(plan.id)
      if (!dotToken) {
        dotToken = buildStrikeDotToken(plan.id)
        strikeDotLayer.addChild(dotToken)
        strikeDotTokens.set(plan.id, dotToken)
      }

      // Update position
      dotToken.x = dotPos.x
      dotToken.y = dotPos.y

      // Redraw visual dot (index 0) to reflect current status / selection
      const isSelected = mapStore.selectedFlightPlanId === plan.id
      const isReturning = plan.status === 'returning'
      const sideColor = plan.side === 'allied' ? COL.allied : COL.japanese
      const dotColor = isReturning ? 0xaaaaaa : sideColor
      const isScout = plan.mission === 'search' || plan.mission === 'scout'
      const g = dotToken.getChildAt(0) as Graphics
      g.clear()
      if (isSelected) {
        g.circle(0, 0, 9).fill({ color: 0xffffff, alpha: 1 }).stroke({ color: COL.selection, width: 2, alpha: 1 })
      } else if (isScout) {
        // Triangle for scout/search missions
        const R = 7
        g.poly([0, -R, R * 0.866, R * 0.5, -R * 0.866, R * 0.5])
          .fill({ color: dotColor, alpha: isReturning ? 0.6 : 0.9 })
          .stroke({ color: 0xffffff, width: 1, alpha: 0.5 })
      } else {
        // Circle for strike missions
        g.circle(0, 0, 7)
          .fill({ color: dotColor, alpha: isReturning ? 0.6 : 0.95 })
          .stroke({ color: 0xffffff, width: 1, alpha: 0.6 })
      }
    }

    // Remove tokens for plans that are no longer active
    for (const [id, token] of strikeDotTokens) {
      if (!activePlanIds.has(id)) {
        strikeDotLayer.removeChild(token)
        strikeDotTokens.delete(id)
        // Clear selection if it was this plan
        if (mapStore.selectedFlightPlanId === id) mapStore.selectFlightPlan(null)
      }
    }
  }

  // ── Selection ring ────────────────────────────────────────────────────────
  // NOTE: actual drawing happens in onTick() so both TG and dot rings are
  // kept in sync on the same selectionLayer clear cycle.
  function drawSelection(): void { /* handled by onTick */ }

  // ── Phase change ──────────────────────────────────────────────────────────

  function onPhaseChanged(): void {
    if (gameStore.phase === 'menu') {
      // Clear all dynamic content when returning to menu
      unitLayer.removeChildren()
      unitTokens.clear()
      prevPos.clear()
      currPos.clear()
      rangeRingLayer.clear()
      flightPathLayer.clear()
      strikeDotLayer.removeChildren()
      strikeDotTokens.clear()
      planOriginPx.clear()
      selectionLayer.clear()
      capLayer.clear()
      contactLayer.removeChildren()
      sunkMarkerLayer.removeChildren()
      mapStore.selectFlightPlan(null)
      mapStore.hoverFlightPlan(null, null)
      mapStore.clearDisambiguation()
    }
  }

  // ── Pointer / input events ─────────────────────────────────────────────────

  function setupPointerEvents(): void {
    if (!app) return
    const canvas = app.canvas as HTMLCanvasElement

    // Mouse wheel → zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const newZoom = Math.max(0.3, Math.min(4.0, vpZoom * factor))

      // Zoom toward cursor
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      vpX = cx - (cx - vpX) * (newZoom / vpZoom)
      vpY = cy - (cy - vpY) * (newZoom / vpZoom)
      vpZoom = newZoom

      applyViewport()
      mapStore.setViewport(vpX, vpY, vpZoom)
    }, { passive: false })

    // Drag → pan
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        isDragging = true
        dragStartX = e.clientX
        dragStartY = e.clientY
        dragVpStartX = vpX
        dragVpStartY = vpY
        canvas.setPointerCapture(e.pointerId)
      }
    })

    canvas.addEventListener('pointermove', (e) => {
      if (!isDragging) return
      vpX = dragVpStartX + (e.clientX - dragStartX)
      vpY = dragVpStartY + (e.clientY - dragStartY)
      applyViewport()

      // Hover hex
      const wx = (e.clientX - canvas.getBoundingClientRect().left - vpX) / vpZoom
      const wy = (e.clientY - canvas.getBoundingClientRect().top - vpY) / vpZoom
      mapStore.setHoveredHex(pixelToHex(wx, wy))
    })

    canvas.addEventListener('pointerup', (e) => {
      if (e.button === 0) {
        const dist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY)
        isDragging = false
        // If barely moved, treat as click
        if (dist < 5) {
          const rect = canvas.getBoundingClientRect()
          const wx = (e.clientX - rect.left - vpX) / vpZoom
          const wy = (e.clientY - rect.top - vpY) / vpZoom
          // We rely on Pixi's event bubbling stopping at the token for token taps
          const hovHex = pixelToHex(wx, wy)
          mapStore.setHoveredHex(hovHex)
          // Clear disambiguation only if the tap didn't land on a dot
          // (Pixi fires pointertap synchronously before this DOM handler runs)
          if (!dotTappedThisFrame) mapStore.clearDisambiguation()
          dotTappedThisFrame = false

          // If an allied TG is selected, set destination to the clicked hex
          const selId = mapStore.selectedTaskGroupId
          if (selId) {
            const tg = forcesStore.taskGroups.get(selId)
            if (tg?.side === 'allied') {
              gameStore.issueOrder({ type: 'set-destination', taskGroupId: selId, destination: hovHex })
            }
          }
        }
      }
    })
  }

  // ── Viewport helpers ──────────────────────────────────────────────────────

  function applyViewport(): void {
    if (!world) return
    world.x = vpX
    world.y = vpY
    world.scale.set(vpZoom)
  }

  function centreViewport(): void {
    if (!app) return
    const sw = app.screen.width
    const sh = app.screen.height
    // Start zoomed on the main battle area so tokens are visible.
    // The player can zoom out with the scroll wheel to see the full grid.
    // 0.65× → each hex ~26px wide, token radius ~8px (visible and clickable).
    vpZoom = 0.65
    // q=36,r=51 centres between US carriers (q=43-44,r=49-50) and KB (q=27,r=51)
    const center = hexToPixel({ q: 36, r: 51 })
    vpX = sw / 2 - center.x * vpZoom
    vpY = sh / 2 - center.y * vpZoom
  }

  function computeGridBounds(): { width: number; height: number } {
    const bottomRight = hexToPixel({ q: GRID_WIDTH - 1, r: GRID_HEIGHT - 1 })
    return { width: bottomRight.x + 60, height: bottomRight.y + 60 }
  }
}
