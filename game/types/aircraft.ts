import type { HexCoord } from './map'
import type { Side } from './ships'
import type { GameTime } from './scenario'

export type AircraftRole = 'fighter' | 'dive-bomber' | 'torpedo-bomber' | 'scout' | 'patrol-bomber'

export type PilotExperience = 'ace' | 'veteran' | 'trained' | 'green'

export type DeckStatus = 'hangared' | 'spotted' | 'airborne' | 'recovering' | 'rearming' | 'fueling' | 'destroyed'

export type OrdnanceType = 'none' | 'bombs-ap' | 'bombs-gp' | 'torpedoes' | 'depth-charges'

export type MissionType = 'strike' | 'search' | 'cap' | 'scout' | 'asw' | 'intercept' | 'escort'

export type FlightStatus = 'planned' | 'airborne' | 'inbound' | 'returning' | 'recovered' | 'lost'

export interface AircraftType {
  id: number               // 1–63
  name: string
  side: Side
  role: AircraftRole
  maxRange: number         // nautical miles (one-way)
  cruiseSpeed: number      // knots
  maxSpeed: number         // knots
  climbRate: number        // feet per minute
  bombLoad: number         // lbs (max)
  torpedoCapable: boolean
  aaRating: number         // effectiveness vs enemy aircraft 0–100
  bombingAccuracy: number  // base accuracy 0–100, modified by experience
  experienceModifiers: Record<PilotExperience, number>  // multiplier on hit probability
}

export interface Squadron {
  id: string
  aircraftTypeId: number
  name: string
  side: Side
  taskGroupId: string        // carrier or land base they're assigned to
  aircraftCount: number      // current operational aircraft
  maxAircraftCount: number   // full complement
  pilotExperience: PilotExperience
  deckStatus: DeckStatus
  fuelLoad: number           // percentage 0–100
  ordnanceLoaded: OrdnanceType
  currentMissionId?: string
  readyTime?: GameTime       // when this squadron will be ready again
}

export interface FlightPlan {
  id: string
  squadronIds: string[]
  mission: MissionType
  side: Side
  targetHex?: HexCoord       // strike target or CAP station — updated live each step
  searchSector?: number      // 0–7
  launchTime: GameTime
  eta?: GameTime             // estimated time on target
  returnEta?: GameTime
  escortMissionId?: string   // if this is a strike, fighters may escort
  status: FlightStatus
  aircraftLost: number       // cumulative losses on this mission
  isOneWay?: boolean         // aircraft are not expected to return after striking
  /** Carrier hex at the moment of launch (fixed). Used to compute outbound flight progress. */
  launchHex?: HexCoord
  /** Live in-flight hex position — updated by the engine every step. */
  currentHex?: HexCoord
  /** Game time when currentHex was last set (used by renderer for smooth dot animation). */
  currentHexTime?: GameTime
  /** ID of the target task group (for live position tracking; undefined for non-strike missions). */
  targetTaskGroupId?: string
}
