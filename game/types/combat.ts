import type { HexCoord } from './map'
import type { Side } from './ships'
import type { GameTime } from './scenario'

export type CombatPhase = 'air-to-air' | 'flak' | 'bombing' | 'torpedo' | 'surface'

export type DamageType = 'bomb' | 'torpedo' | 'shell' | 'fire' | 'flood' | 'collision'

export interface HitResult {
  shipId: string
  damageType: DamageType
  hullDamageDealt: number   // 0–100 points
  firesStarted: number
  floodingInduced: number   // 0–100 risk added
  crewCasualties: number    // percentage of crew lost
  systemsDisabled: string[] // e.g. ['flight-deck', 'engine-room', 'fire-control']
}

export interface AirCombatResult {
  attackerSquadronId: string
  defenderSquadronId: string  // CAP or interceptors
  attackerLosses: number
  defenderLosses: number
  attackerPenetrated: boolean  // did attackers break through CAP?
}

export interface StrikeResult {
  flightPlanId: string
  targetTaskGroupId: string
  resolvedAt: GameTime
  airCombat?: AirCombatResult
  flakLosses: number          // aircraft lost to AA fire
  hits: HitResult[]
  aircraftReturning: number
  aircraftLost: number
  narrative: string[]         // human-readable event descriptions
}

export interface SurfaceCombatResult {
  resolvedAt: GameTime
  location: HexCoord
  alliedTaskGroupId: string
  japaneseTaskGroupId: string
  rounds: SurfaceCombatRound[]
  alliedShipsSunk: string[]
  japaneseShipsSunk: string[]
  narrative: string[]
}

export interface SurfaceCombatRound {
  roundNumber: number
  alliedFires: number    // shells fired
  japaneseFires: number
  alliedHits: HitResult[]
  japaneseHits: HitResult[]
}

export type CombatEvent =
  | { type: 'strike-launched'; flightPlanId: string; at: GameTime }
  | { type: 'strike-resolved'; result: StrikeResult }
  | { type: 'surface-combat'; result: SurfaceCombatResult }
  | { type: 'ship-damaged'; shipId: string; damageType: DamageType; at: GameTime }
  | { type: 'ship-sunk'; shipId: string; taskGroupId: string; side: Side; at: GameTime }
  | { type: 'fire-controlled'; shipId: string; at: GameTime }
  | { type: 'fire-out-of-control'; shipId: string; at: GameTime }
