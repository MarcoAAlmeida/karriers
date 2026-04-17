import type {
  ScenarioDefinition,
  ScenarioMetadata,
  Scenario,
  ScenarioForce,
  ScenarioForceDefinition,
  TaskGroupDefinition
} from '../types/scenario'
import type { Ship, TaskGroup } from '../types/ships'
import type { Squadron } from '../types/aircraft'
import { SHIP_CLASSES } from './shipClasses'
import { AIRCRAFT_TYPES } from './aircraftTypes'

export async function fetchManifest(): Promise<ScenarioMetadata[]> {
  const res = await fetch('/scenarios/manifest.json')
  if (!res.ok) throw new Error(`Failed to fetch scenario manifest: ${res.status}`)
  return res.json() as Promise<ScenarioMetadata[]>
}

export async function fetchScenario(id: string): Promise<Scenario> {
  const res = await fetch(`/scenarios/${id}.json`)
  if (!res.ok) throw new Error(`Scenario not found: ${id} (${res.status})`)
  const def = await res.json() as ScenarioDefinition
  return scenarioFromDefinition(def)
}

/**
 * Denormalises a ScenarioDefinition (raw JSON shape) into a full Scenario
 * object, deriving side/taskGroupId from nesting and appending reference data.
 * Exported so tests can exercise denormalisation without a network fetch.
 */
export function scenarioFromDefinition(def: ScenarioDefinition): Scenario {
  const forces: ScenarioForce[] = def.forces.map(forceDef => denormaliseForce(forceDef))

  return {
    id: def.id,
    name: def.name,
    date: def.date,
    description: def.description,
    difficulty: def.difficulty,
    durationHours: def.durationHours,
    ...(def.thumbnail !== undefined && { thumbnail: def.thumbnail }),
    startTime: def.startTime,
    endTime: def.endTime,
    mapBounds: def.mapBounds,
    weatherZones: def.weatherZones,
    forces,
    victoryConditions: def.victoryConditions,
    shipClasses: SHIP_CLASSES,
    aircraftTypes: AIRCRAFT_TYPES,
    alliedFuelPool: def.alliedFuelPool,
    japaneseFuelPool: def.japaneseFuelPool
  }
}

function denormaliseForce(forceDef: ScenarioForceDefinition): ScenarioForce {
  const ships: Ship[] = []
  const taskGroups: TaskGroup[] = []
  const squadrons: Squadron[] = []

  for (const tgDef of forceDef.taskGroups) {
    const { tg, tgShips, tgSquadrons } = denormaliseTaskGroup(tgDef, forceDef.side)
    taskGroups.push(tg)
    ships.push(...tgShips)
    squadrons.push(...tgSquadrons)
  }

  return { side: forceDef.side, ships, taskGroups, squadrons }
}

function denormaliseTaskGroup(
  tgDef: TaskGroupDefinition,
  side: 'allied' | 'japanese'
): { tg: TaskGroup, tgShips: Ship[], tgSquadrons: Squadron[] } {
  const shipIds: string[] = tgDef.ships.map(s => s.id)

  const tgShips: Ship[] = tgDef.ships.map(shipDef => ({
    id: shipDef.id,
    classId: shipDef.classId,
    name: shipDef.name,
    side,
    taskGroupId: tgDef.id,
    hullDamage: shipDef.hullDamage ?? 0,
    fires: shipDef.fires ?? 0,
    floodingRisk: shipDef.floodingRisk ?? 0,
    fuelLevel: shipDef.fuelLevel ?? 85,
    ammoLevel: shipDef.ammoLevel ?? 90,
    damageControlEfficiency: shipDef.damageControlEfficiency ?? 100,
    status: shipDef.status ?? 'operational'
  }))

  const tgSquadrons: Squadron[] = tgDef.squadrons.map(sqDef => ({
    id: sqDef.id,
    aircraftTypeId: sqDef.aircraftTypeId,
    name: sqDef.name,
    side,
    taskGroupId: tgDef.id,
    aircraftCount: sqDef.aircraftCount,
    maxAircraftCount: sqDef.maxAircraftCount ?? sqDef.aircraftCount,
    pilotExperience: sqDef.pilotExperience,
    deckStatus: sqDef.deckStatus ?? 'hangared',
    fuelLoad: sqDef.fuelLoad ?? 100,
    ordnanceLoaded: sqDef.ordnanceLoaded ?? 'none'
  }))

  const tg: TaskGroup = {
    id: tgDef.id,
    name: tgDef.name,
    side,
    flagshipId: tgDef.flagshipId,
    shipIds,
    position: tgDef.position,
    course: tgDef.course,
    speed: tgDef.speed,
    currentOrder: tgDef.currentOrder,
    fuelState: tgDef.fuelState,
    ...(tgDef.destination !== undefined && { destination: tgDef.destination }),
    ...(tgDef.strikeTargetHex !== undefined && { strikeTargetHex: tgDef.strikeTargetHex })
  }

  return { tg, tgShips, tgSquadrons }
}
