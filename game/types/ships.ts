import type { HexCoord } from './map'
import type { GameTime } from './scenario'

export type Side = 'allied' | 'japanese'

export type ShipType
  = | 'fleet-carrier'
    | 'light-carrier'
    | 'escort-carrier'
    | 'battleship'
    | 'heavy-cruiser'
    | 'light-cruiser'
    | 'destroyer'
    | 'submarine'
    | 'transport'
    | 'oiler'

export type ShipStatus = 'operational' | 'damaged' | 'on-fire' | 'sinking' | 'sunk'

export type TaskGroupOrder
  = | 'standby'
    | 'patrol'
    | 'strike'
    | 'search'
    | 'escort'
    | 'retire'
    | 'intercept'
    | 'refuel'

export interface ShipClass {
  id: number // 1–63
  name: string
  type: ShipType
  side: Side
  displacement: number // tons
  maxSpeed: number // knots
  aaStrength: number // anti-aircraft rating 0–100
  armorRating: number // 0–100
  hullPoints: number
  damageControlRating: number // 0–100
  flightDeckCapacity?: number // aircraft spots (carriers only)
  hangarCapacity?: number // aircraft in hangar (carriers only)
  fuelPayload?: number // fuel units carried (oilers only); deducted from side pool on sinking
}

export interface Ship {
  id: string
  classId: number
  name: string
  side: Side
  taskGroupId: string
  hullDamage: number // 0–100 (100 = sunk)
  fires: number // active fire count
  floodingRisk: number // 0–100
  fuelLevel: number // percentage 0–100
  ammoLevel: number // percentage 0–100
  damageControlEfficiency: number // 0–100, degrades with crew casualties
  status: ShipStatus
}

export interface TaskGroup {
  id: string
  name: string
  side: Side
  flagshipId: string
  shipIds: string[]
  position: HexCoord
  destination?: HexCoord
  course: number // degrees 0–359
  speed: number // knots (actual speed, may differ from max)
  currentOrder: TaskGroupOrder
  strikeTargetHex?: HexCoord
  escortTargetId?: string
  searchSector?: number // 0–7 (8 sectors)
  detectedBySide?: Side
  lastSightedAt?: GameTime
  fuelState: number // percentage 0–100 (average of tankers/oilers)
}
