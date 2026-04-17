import type { HexCoord, WeatherZone } from './map'
import type { Side, ShipClass, Ship, TaskGroup, ShipStatus, TaskGroupOrder } from './ships'
import type { AircraftType, Squadron, PilotExperience, DeckStatus, OrdnanceType } from './aircraft'

// ── ScenarioParams ─────────────────────────────────────────────────────────

/**
 * Tuneable engine parameters extracted from hardcoded constants.
 * Passed to GameEngine at construction; all subsystems read from here instead
 * of local magic numbers. Designed as a flat, serialisable genome for the
 * evolutionary trainer (Sprint 27).
 */
export interface ScenarioParams {
  // ── Replay / training ────────────────────────────────────────────────────
  /** RNG seed. 0 = use Date.now() at engine construction. */
  seed: number
  /** How task group starting positions are determined. */
  spawnMode: 'fixed' | 'random' | 'seeded'
  /** Override game duration: step count * 30 min. 0 = use scenario endTime. */
  durationSteps: number

  // ── Ship fuel (bunker oil) ───────────────────────────────────────────────
  /** % of fuelLevel consumed per 30-min step at full speed. */
  shipFuelPerStepFull: number

  // ── Aviation fuel rates (per aircraft per hex flown) ─────────────────────
  scoutFuelRate: number
  searchFuelRate: number
  capFuelRate: number
  strikeFuelRate: number
  escortFuelRate: number
  aswFuelRate: number
  /** Virtual range (hexes) for CAP fuel cost (no fixed target). */
  capOrbitRangeHexes: number

  // ── Air ops timing ───────────────────────────────────────────────────────
  /** Minimum fuel fraction kept in reserve for return leg. */
  fuelReserve: number
  /** CAP orbit window before forced return (minutes). */
  capOrbitMinutes: number
  /** Deck occupancy fraction above which incoming planes ditch. */
  overcapHardLimit: number
  /** Extra rearm minutes when recovering to an over-capacity deck. */
  overcapPenaltyMinutes: number
  /** Rearm/refuel minutes after a CAP or intercept sortie. */
  capRearmMinutes: number
  /** Rearm/refuel minutes after a strike or escort sortie. */
  strikeRearmMinutes: number
  /** Rearm/refuel minutes after a scout, search, or ASW sortie. */
  scoutRearmMinutes: number
  /** Extra rearm minutes when a recovering squadron's carrier takes a hit. */
  strikeRearmPenaltyMinutes: number

  // ── Combat: damage multipliers ───────────────────────────────────────────
  /** Scales hull damage dealt by bomb hits. */
  bombDamageMultiplier: number
  /** Scales hull damage dealt by torpedo hits. */
  torpedoDamageMultiplier: number
  /** Scales fires started on hit. */
  fireDamageMultiplier: number
  /** Scales flooding risk induced by torpedo hits. */
  floodingMultiplier: number

  // ── Combat: CAP effectiveness ────────────────────────────────────────────
  /** Scales attacker losses during CAP intercept (>1 = stronger CAP). */
  capEffectivenessMultiplier: number

  // ── Damage per step ──────────────────────────────────────────────────────
  /** Hull damage per active fire per 30-min step. */
  fireDamagePerStep: number
  /** Probability a fire spreads to an adjacent compartment each step. */
  fireSpreadChance: number
  /** Hull damage per unit of flooding risk per step. */
  floodDamageRate: number

  // ── Search / detection ───────────────────────────────────────────────────
  /** Scales effective search range for all aircraft. */
  detectionRangeMultiplier: number
}

/** Default values matching current hardcoded engine constants. */
export const DEFAULT_SCENARIO_PARAMS: ScenarioParams = {
  seed: 0,
  spawnMode: 'fixed',
  durationSteps: 0,

  shipFuelPerStepFull: 0.5,

  scoutFuelRate: 1,
  searchFuelRate: 1,
  capFuelRate: 2,
  strikeFuelRate: 2,
  escortFuelRate: 1,
  aswFuelRate: 1,
  capOrbitRangeHexes: 5,

  fuelReserve: 0.15,
  capOrbitMinutes: 90,
  overcapHardLimit: 1.2,
  overcapPenaltyMinutes: 60,
  capRearmMinutes: 30,
  strikeRearmMinutes: 60,
  scoutRearmMinutes: 30,
  strikeRearmPenaltyMinutes: 60,

  bombDamageMultiplier: 1.0,
  torpedoDamageMultiplier: 1.0,
  fireDamageMultiplier: 1.0,
  floodingMultiplier: 1.0,

  capEffectivenessMultiplier: 1.0,

  fireDamagePerStep: 4,
  fireSpreadChance: 0.22,
  floodDamageRate: 0.08,

  detectionRangeMultiplier: 1.0,
}

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
