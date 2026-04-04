import type { HexCoord, TerrainType } from '../types'
import { coordKey, hexNeighbors, hexDistance } from './hexMath'

// ── Terrain passability ────────────────────────────────────────────────────

export type TerrainMap = Map<string, TerrainType>

/** Surface ships cannot traverse land or atoll hexes. */
export function isSurfacePassable(coord: HexCoord, terrain: TerrainMap): boolean {
  const t = terrain.get(coordKey(coord))
  // Undefined terrain = open sea (default)
  return !t || t === 'deep-sea' || t === 'shallow'
}

/** Submarines can pass through same hexes as surface ships. */
export function isSubmarinePassable(coord: HexCoord, terrain: TerrainMap): boolean {
  return isSurfacePassable(coord, terrain)
}

// ── A* pathfinding ─────────────────────────────────────────────────────────

interface AStarNode {
  coord: HexCoord
  g: number   // cost from start
  f: number   // g + heuristic
}

/**
 * Finds the shortest hex path from `from` to `to` avoiding impassable terrain.
 * Returns an ordered array of HexCoords (including start and end),
 * or null if no path exists.
 *
 * `passable` should be `isSurfacePassable` for surface ships,
 * `isSubmarinePassable` for submarines.
 */
export function findPath(
  from: HexCoord,
  to: HexCoord,
  terrain: TerrainMap,
  passable: (coord: HexCoord, terrain: TerrainMap) => boolean = isSurfacePassable
): HexCoord[] | null {
  const fromKey = coordKey(from)
  const toKey = coordKey(to)

  if (fromKey === toKey) return [{ ...from }]

  // Destination must be passable
  if (!passable(to, terrain)) return null

  const open = new Map<string, AStarNode>()
  const closed = new Set<string>()
  const cameFrom = new Map<string, string>()  // key → parent key
  const coordCache = new Map<string, HexCoord>()

  const startNode: AStarNode = {
    coord: from,
    g: 0,
    f: hexDistance(from, to)
  }
  open.set(fromKey, startNode)
  coordCache.set(fromKey, from)

  while (open.size > 0) {
    // Pop node with lowest f score
    let bestKey = ''
    let bestF = Infinity
    for (const [key, node] of open) {
      if (node.f < bestF) {
        bestF = node.f
        bestKey = key
      }
    }

    const current = open.get(bestKey)!
    open.delete(bestKey)
    closed.add(bestKey)

    if (bestKey === toKey) {
      return reconstructPath(bestKey, cameFrom, coordCache)
    }

    for (const neighbor of hexNeighbors(current.coord)) {
      const nKey = coordKey(neighbor)
      if (closed.has(nKey)) continue
      if (!passable(neighbor, terrain)) continue

      const tentativeG = current.g + 1

      const existing = open.get(nKey)
      if (existing && tentativeG >= existing.g) continue

      cameFrom.set(nKey, bestKey)
      coordCache.set(nKey, neighbor)
      const node: AStarNode = {
        coord: neighbor,
        g: tentativeG,
        f: tentativeG + hexDistance(neighbor, to)
      }
      open.set(nKey, node)
    }
  }

  return null  // No path found
}

function reconstructPath(
  endKey: string,
  cameFrom: Map<string, string>,
  coordCache: Map<string, HexCoord>
): HexCoord[] {
  const path: HexCoord[] = []
  let key = endKey
  while (cameFrom.has(key)) {
    path.unshift(coordCache.get(key)!)
    key = cameFrom.get(key)!
  }
  path.unshift(coordCache.get(key)!)  // start node
  return path
}

// ── Path utilities ─────────────────────────────────────────────────────────

/**
 * Advance along a pre-computed path by `hexes` steps.
 * Returns { position, remainingPath, overflow } where overflow is the
 * fractional hex distance that didn't fit into a whole hex.
 */
export function advanceAlongPath(
  path: HexCoord[],
  hexes: number
): { position: HexCoord; remainingPath: HexCoord[]; overflow: number } {
  let remaining = hexes
  let i = 0

  while (i < path.length - 1 && remaining >= 1) {
    i++
    remaining--
  }

  const position = path[i] ?? path[path.length - 1]!
  return {
    position,
    remainingPath: path.slice(i),
    overflow: remaining
  }
}
