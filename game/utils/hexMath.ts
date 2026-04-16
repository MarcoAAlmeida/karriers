import { defineHex, Grid, rectangle, Orientation, Direction } from 'honeycomb-grid'
import type { HexCoord } from '../types'

// ── Constants ──────────────────────────────────────────────────────────────

export const GRID_WIDTH = 72
export const GRID_HEIGHT = 84
export const NM_PER_HEX = 20
export const STEP_MINUTES = 30

// Valid neighbor directions for flat-top hexes (N and S fall between hexes)
export const FLAT_DIRECTIONS = [
  Direction.NE, Direction.E, Direction.SE,
  Direction.SW, Direction.W, Direction.NW
] as const

// ── Grid singleton ─────────────────────────────────────────────────────────

type KarrierHex = InstanceType<ReturnType<typeof buildHexClass>>

function buildHexClass(hexSize: number) {
  return defineHex({
    dimensions: hexSize,
    orientation: Orientation.FLAT,
    origin: 'topLeft'
  })
}

let _HexClass: ReturnType<typeof buildHexClass> | null = null
let _grid: Grid<KarrierHex> | null = null
let _hexSize = 40

export function initGrid(hexSize = 40): Grid<KarrierHex> {
  _hexSize = hexSize
  _HexClass = buildHexClass(hexSize)
  _grid = new Grid(_HexClass, rectangle({ width: GRID_WIDTH, height: GRID_HEIGHT }))
  return _grid as Grid<KarrierHex>
}

function grid(): Grid<KarrierHex> {
  if (!_grid) initGrid()
  return _grid as Grid<KarrierHex>
}

function HexClass() {
  if (!_HexClass) initGrid()
  return _HexClass!
}

export function getHexSize(): number {
  return _hexSize
}

// ── Coordinate utilities ───────────────────────────────────────────────────

/** Stable string key for use in Maps and Sets */
export function coordKey(c: HexCoord): string {
  return `${c.q},${c.r}`
}

export function keyToCoord(key: string): HexCoord {
  const parts = key.split(',')
  return { q: Number(parts[0]), r: Number(parts[1]) }
}

// ── Hex ↔ pixel ────────────────────────────────────────────────────────────

/** Returns the pixel center of a hex. */
export function hexToPixel(coord: HexCoord): { x: number; y: number } {
  const Hex = HexClass()
  const h = new Hex({ q: coord.q, r: coord.r })
  return { x: h.x, y: h.y }
}

/** Returns the hex at a given pixel coordinate. */
export function pixelToHex(x: number, y: number): HexCoord {
  const h = grid().pointToHex({ x, y }, { allowOutside: true })
  return { q: h.q, r: h.r }
}

/** Returns the 6 corner points of a hex (useful for drawing). */
export function hexCorners(coord: HexCoord): { x: number; y: number }[] {
  const Hex = HexClass()
  const h = new Hex({ q: coord.q, r: coord.r })
  return h.corners
}

// ── Grid queries ───────────────────────────────────────────────────────────

export function isInBounds(coord: HexCoord): boolean {
  return grid().getHex({ q: coord.q, r: coord.r }) !== undefined
}

/** Hex distance (number of hex steps between two coords). */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  // Cube coordinate distance: max(|dq|, |dr|, |ds|)
  const dq = a.q - b.q
  const dr = a.r - b.r
  const ds = dq + dr
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds))
}

/**
 * Linearly interpolates between two hex coordinates at fraction t (0–1).
 * Used by the engine to compute the in-flight position of airborne squadrons.
 */
export function lerpHex(a: HexCoord, b: HexCoord, t: number): HexCoord {
  return {
    q: Math.round(a.q + (b.q - a.q) * t),
    r: Math.round(a.r + (b.r - a.r) * t),
  }
}

/** All valid in-bounds neighbors of a hex. */
export function hexNeighbors(coord: HexCoord): HexCoord[] {
  const g = grid()
  const neighbors: HexCoord[] = []
  for (const dir of FLAT_DIRECTIONS) {
    const n = g.neighborOf(
      { q: coord.q, r: coord.r, s: -coord.q - coord.r },
      dir,
      { allowOutside: false }
    )
    if (n !== undefined) {
      neighbors.push({ q: n.q, r: n.r })
    }
  }
  return neighbors
}

/**
 * Returns all hexes in a straight line from `from` to `to` using linear
 * interpolation and rounding (standard hex line-drawing algorithm).
 */
export function hexLine(from: HexCoord, to: HexCoord): HexCoord[] {
  const dist = hexDistance(from, to)
  if (dist === 0) return [{ ...from }]

  const fromS = -from.q - from.r
  const toS = -to.q - to.r

  const coords: HexCoord[] = []
  for (let i = 0; i <= dist; i++) {
    const t = i / dist
    const fq = from.q + (to.q - from.q) * t
    const fr = from.r + (to.r - from.r) * t
    const fs = fromS + (toS - fromS) * t

    // Cube rounding
    let rq = Math.round(fq)
    let rr = Math.round(fr)
    const rs = Math.round(fs)
    const dq = Math.abs(rq - fq)
    const dr = Math.abs(rr - fr)
    const ds = Math.abs(rs - fs)
    if (dq > dr && dq > ds) rq = -rr - rs
    else if (dr > ds) rr = -rq - rs

    coords.push({ q: rq, r: rr })
  }
  return coords
}

/** All hexes within `radius` steps of `center`. */
export function hexesInRange(center: HexCoord, radius: number): HexCoord[] {
  const results: HexCoord[] = []
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius)
    const r2 = Math.min(radius, -q + radius)
    for (let r = r1; r <= r2; r++) {
      const coord = { q: center.q + q, r: center.r + r }
      if (isInBounds(coord)) results.push(coord)
    }
  }
  return results
}

// ── Speed conversion ───────────────────────────────────────────────────────

/**
 * How many hexes a unit moving at `speedKnots` covers in one 30-min step.
 * Returns a fractional value — accumulate over steps.
 * At 20 kt → 10 NM / step → 0.5 hexes/step
 * At 30 kt → 15 NM / step → 0.75 hexes/step
 */
export function speedToHexesPerStep(speedKnots: number): number {
  const nmPerStep = speedKnots * (STEP_MINUTES / 60)
  return nmPerStep / NM_PER_HEX
}

/**
 * Returns the cardinal direction (degrees) from `from` to `to`.
 * 0° = North, 90° = East, etc.
 */
export function bearingBetween(from: HexCoord, to: HexCoord): number {
  const fp = hexToPixel(from)
  const tp = hexToPixel(to)
  const dx = tp.x - fp.x
  const dy = tp.y - fp.y
  return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360
}
