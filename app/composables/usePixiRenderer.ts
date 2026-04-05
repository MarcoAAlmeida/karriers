import { Application, Container, Graphics, Text } from 'pixi.js'
import type { Ref } from 'vue'
import type { TaskGroup, FlightPlan, HexCoord, ContactRecord } from '@game/types'
import { hexToPixel, hexCorners, GRID_WIDTH, GRID_HEIGHT, pixelToHex } from '@game/utils/hexMath'
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
  let fogLayer: Container
  let contactLayer: Container
  let unitLayer: Container
  let flightPathLayer: Graphics
  let selectionLayer: Graphics
  let annotationLayer: Container

  // Unit token map
  const unitTokens = new Map<string, Container>()

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

    terrainLayer  = new Graphics()
    gridLayer     = new Graphics()
    fogLayer      = new Container()
    contactLayer  = new Container()
    unitLayer     = new Container()
    flightPathLayer = new Graphics()
    selectionLayer  = new Graphics()
    annotationLayer = new Container()

    world.addChild(terrainLayer, gridLayer, fogLayer, contactLayer, unitLayer, flightPathLayer, selectionLayer, annotationLayer)

    drawTerrain()
    drawGrid()
    centreViewport()
    applyViewport()

    setupPointerEvents()

    // Pixi ticker: interpolate unit positions every frame
    app.ticker.add(onTick)

    // Watch for step changes in forces store
    watch(() => forcesStore.taskGroups, onTaskGroupsChanged, { immediate: true })
    watch(() => forcesStore.flightPlans, drawFlightPaths, { immediate: true })
    watch(() => mapStore.selectedTaskGroupId, drawSelection)
    watch(() => gameStore.phase, onPhaseChanged)
    // Rebuild tokens when contact picture changes (fog-of-war)
    watch(() => intelStore.activeAlliedContacts, () => rebuildUnitTokens(forcesStore.taskGroups))
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
        if (!contact) {
          // No contact — remove token
          if (token) {
            unitLayer.removeChild(token)
            unitTokens.delete(tg.id)
          }
          continue
        }
        // Confirmed contact — render diamond at lastKnownHex
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
    const isContact = contactPos !== undefined   // only called with contactPos for enemy contact tokens

    const token = new Container()
    token.label = tg.id

    if (!isAllied && isContact) {
      // Enemy contact — orange diamond
      const g = new Graphics()
      g.poly([-12, 0, 0, -12, 12, 0, 0, 12]).fill({ color: COL.contact }).stroke({ color: COL.contactBorder, width: 1.5 })
      token.addChild(g)

      const lbl = new Text({ text: '?', style: { fill: COL.labelContact, fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold' } })
      lbl.anchor.set(0.5, 0.5)
      token.addChild(lbl)
    } else {
      // Known unit — circle
      const fillColor = isAllied ? COL.allied : COL.japanese
      const borderColor = isAllied ? COL.alliedBorder : COL.japaneseBorder
      const labelColor = isAllied ? COL.labelAllied : COL.labelJapanese

      const g = new Graphics()
      g.circle(0, 0, 13).fill({ color: fillColor }).stroke({ color: borderColor, width: 1.5 })
      token.addChild(g)

      // Carrier indicator — white dot inside if TG has a carrier
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

      const name = tg.name.length > 6 ? tg.name.slice(0, 6) : tg.name
      const lbl = new Text({ text: name, style: { fill: labelColor, fontSize: 9, fontFamily: 'sans-serif' } })
      lbl.anchor.set(0.5, 2.2)
      token.addChild(lbl)
    }

    // Pointer events
    token.eventMode = 'static'
    token.cursor = 'pointer'
    token.on('pointertap', () => mapStore.selectTaskGroup(tg.id))

    const px = hexToPixel(contactPos ?? tg.position)
    token.x = px.x
    token.y = px.y

    return token
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

    // Update selection ring + destination marker for the selected TG
    const selId = mapStore.selectedTaskGroupId
    if (selId) {
      const token = unitTokens.get(selId)
      if (token) {
        selectionLayer.clear()
        selectionLayer.circle(token.x, token.y, 18).stroke({ color: COL.selection, width: 2, alpha: 0.9 })

        // Draw destination × marker
        const tg = forcesStore.taskGroups.get(selId)
        if (tg?.destination) {
          const dest = hexToPixel(tg.destination)
          const r = 9
          selectionLayer
            .moveTo(dest.x - r, dest.y - r).lineTo(dest.x + r, dest.y + r)
            .moveTo(dest.x + r, dest.y - r).lineTo(dest.x - r, dest.y + r)
            .stroke({ color: COL.selection, width: 2, alpha: 0.75 })
        }
      }
    }
  }

  // ── Flight paths ──────────────────────────────────────────────────────────

  function drawFlightPaths(plans: Map<string, FlightPlan>): void {
    flightPathLayer.clear()

    for (const plan of plans.values()) {
      if (plan.status !== 'airborne' && plan.status !== 'inbound') continue
      if (!plan.targetHex) continue

      // Find origin TG position via first squadron's task group
      const sq = forcesStore.squadrons.get(plan.squadronIds[0] ?? '')
      if (!sq) continue
      const tg = forcesStore.taskGroups.get(sq.taskGroupId)
      if (!tg) continue

      const origin = hexToPixel(tg.position)
      const target = hexToPixel(plan.targetHex)

      // Quadratic bezier arc — control point elevated above midpoint
      const mx = (origin.x + target.x) / 2
      const my = (origin.y + target.y) / 2 - 60

      flightPathLayer.moveTo(origin.x, origin.y)
      flightPathLayer.quadraticCurveTo(mx, my, target.x, target.y)
      flightPathLayer.stroke({ color: COL.flightPath, width: 1.5, alpha: 0.7 })

      // Arrowhead at target
      const dx = target.x - mx
      const dy = target.y - my
      const angle = Math.atan2(dy, dx)
      const arrowLen = 10
      flightPathLayer.moveTo(target.x, target.y)
      flightPathLayer.lineTo(
        target.x - Math.cos(angle - 0.4) * arrowLen,
        target.y - Math.sin(angle - 0.4) * arrowLen
      )
      flightPathLayer.moveTo(target.x, target.y)
      flightPathLayer.lineTo(
        target.x - Math.cos(angle + 0.4) * arrowLen,
        target.y - Math.sin(angle + 0.4) * arrowLen
      )
      flightPathLayer.stroke({ color: COL.flightPath, width: 1.5, alpha: 0.7 })
    }
  }

  // ── Selection ring ────────────────────────────────────────────────────────

  function drawSelection(): void {
    selectionLayer.clear()
    const selId = mapStore.selectedTaskGroupId
    if (!selId) return
    const token = unitTokens.get(selId)
    if (!token) return
    selectionLayer.circle(token.x, token.y, 18).stroke({ color: COL.selection, width: 2, alpha: 0.9 })
  }

  // ── Phase change ──────────────────────────────────────────────────────────

  function onPhaseChanged(): void {
    if (gameStore.phase === 'menu') {
      // Clear all dynamic content when returning to menu
      unitLayer.removeChildren()
      unitTokens.clear()
      prevPos.clear()
      currPos.clear()
      flightPathLayer.clear()
      selectionLayer.clear()
      contactLayer.removeChildren()
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
        // If barely moved, treat as click (deselect)
        if (dist < 5) {
          const rect = canvas.getBoundingClientRect()
          const wx = (e.clientX - rect.left - vpX) / vpZoom
          const wy = (e.clientY - rect.top - vpY) / vpZoom
          // We rely on Pixi's event bubbling stopping at the token for token taps
          const hovHex = pixelToHex(wx, wy)
          mapStore.setHoveredHex(hovHex)

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
