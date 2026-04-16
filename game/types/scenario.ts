import type { HexCoord, WeatherZone } from './map'
import type { Side, ShipClass, Ship, TaskGroup, ShipStatus, TaskGroupOrder } from './ships'
import type { AircraftType, Squadron, PilotExperience, DeckStatus, OrdnanceType } from './aircraft'

export interface GameTime {
  day: number
  hour: number
  minute: 0 | 30
}

export function gameTimeToMinutes(t: GameTime): number {
  return t.day * 24 * 60 + t.hour * 60 + t.minute
}

export function minutesToGameTime(minutes: number): GameTime {
  const day = Math.floor(minutes / (24 * 60))
  const remainder = minutes % (24 * 60)
  const hour = Math.floor(remainder / 60)
  const minute = (remainder % 60 >= 30 ? 30 : 0) as 0 | 30
  return { day, hour, minute }
}

export function advanceGameTime(t: GameTime, steps = 1): GameTime {
  return minutesToGameTime(gameTimeToMinutes(t) + steps * 30)
}

export type VictoryConditionType =
  | 'sink-carrier'
  | 'sink-ship-class'
  | 'control-hex'
  | 'survive-until'
  | 'sink-total-tonnage'

export interface VictoryCondition {
  id: string
  type: VictoryConditionType
  forSide: Side
  targetShipClassId?: number
  targetHex?: HexCoord
  targetTonnage?: number
  deadline?: GameTime
  points: number
  description: string
}

export interface ScenarioForce {
  side: Side
  ships: Ship[]
  taskGroups: TaskGroup[]
  squadrons: Squadron[]
}

export interface ScenarioMetadata {
  id: string
  name: string
  date: string           // historical date, e.g. "June 4, 1942"
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  durationHours: number
  thumbnail?: string
}

export interface Scenario extends ScenarioMetadata {
  startTime: GameTime
  endTime: GameTime
  mapBounds: {
    minQ: number
    maxQ: number
    minR: number
    maxR: number
  }
  weatherZones: WeatherZone[]
  forces: ScenarioForce[]
  victoryConditions: VictoryCondition[]
  // Reference data needed for this scenario
  shipClasses: ShipClass[]
  aircraftTypes: AircraftType[]
  // Fuel pools — loaded from JSON; consumed in Sprint 20
  alliedFuelPool?: number
  japaneseFuelPool?: number
}

// ── JSON definition types (raw shape of public/scenarios/*.json) ──────────────

/** Ship as it appears in the JSON: side and taskGroupId are derived from parent. */
export interface ShipDefinition {
  id: string
  classId: number
  name: string
  hullDamage?: number
  fires?: number
  floodingRisk?: number
  fuelLevel?: number
  ammoLevel?: number
  damageControlEfficiency?: number
  status?: ShipStatus
}

/** Squadron as it appears in the JSON: side, taskGroupId, and runtime state are derived. */
export interface SquadronDefinition {
  id: string
  name: string
  aircraftTypeId: number
  aircraftCount: number
  maxAircraftCount?: number
  pilotExperience: PilotExperience
  deckStatus?: DeckStatus
  fuelLoad?: number
  ordnanceLoaded?: OrdnanceType
}

/** Task group as it appears in the JSON: side derived from parent force; shipIds derived from nested ships. */
export interface TaskGroupDefinition {
  id: string
  name: string
  flagshipId: string
  position: HexCoord
  destination?: HexCoord
  course: number
  speed: number
  currentOrder: TaskGroupOrder
  strikeTargetHex?: HexCoord
  fuelState: number
  ships: ShipDefinition[]
  squadrons: SquadronDefinition[]
}

/** Force as it appears in the JSON. */
export interface ScenarioForceDefinition {
  side: Side
  taskGroups: TaskGroupDefinition[]
}

/** Full scenario definition as stored in public/scenarios/*.json. */
export interface ScenarioDefinition extends ScenarioMetadata {
  startTime: GameTime
  endTime: GameTime
  mapBounds: {
    minQ: number
    maxQ: number
    minR: number
    maxR: number
  }
  weatherZones: WeatherZone[]
  alliedFuelPool: number
  japaneseFuelPool: number
  forces: ScenarioForceDefinition[]
  victoryConditions: VictoryCondition[]
}
