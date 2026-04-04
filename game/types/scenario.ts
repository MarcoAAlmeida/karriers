import type { HexCoord, WeatherZone } from './map'
import type { Side, ShipClass, Ship, TaskGroup } from './ships'
import type { AircraftType, Squadron } from './aircraft'

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
}
