import {
  initGrid,
  hexToPixel as _hexToPixel,
  pixelToHex as _pixelToHex,
  hexCorners as _hexCorners,
  getHexSize,
  GRID_WIDTH,
  GRID_HEIGHT,
  NM_PER_HEX
} from '@game/utils/hexMath'
import type { HexCoord } from '@game/types'

// ── Constants ──────────────────────────────────────────────────────────────

/** Default hex circumradius in pixels. Can be changed by calling initGrid(). */
export const DEFAULT_HEX_SIZE = 40

// ── Composable ─────────────────────────────────────────────────────────────

let _initialised = false

export function useHexMap(hexSize = DEFAULT_HEX_SIZE) {
  if (!_initialised) {
    initGrid(hexSize)
    _initialised = true
  }

  function hexToPixel(coord: HexCoord): { x: number; y: number } {
    return _hexToPixel(coord)
  }

  function pixelToHex(x: number, y: number): HexCoord {
    return _pixelToHex(x, y)
  }

  function hexCornerPoints(coord: HexCoord): { x: number; y: number }[] {
    return _hexCorners(coord)
  }

  /** Total canvas size in pixels that fits the entire grid. */
  function gridPixelSize(): { width: number; height: number } {
    const size = getHexSize()
    // flat-top hex: col width = size * 1.5 per hex (except last), row height = size * sqrt(3)
    const w = size * 1.5 * (GRID_WIDTH - 1) + size * 2
    const h = size * Math.sqrt(3) * GRID_HEIGHT + size * Math.sqrt(3) * 0.5
    return { width: Math.ceil(w), height: Math.ceil(h) }
  }

  return {
    hexToPixel,
    pixelToHex,
    hexCornerPoints,
    gridPixelSize,
    GRID_WIDTH,
    GRID_HEIGHT,
    NM_PER_HEX,
    hexSize: getHexSize
  }
}
