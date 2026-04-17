import type { SidedSnapshot } from '../engine/GameEngine'
import type { Side, TaskGroupOrder, MissionType, DeckStatus, PilotExperience, AircraftRole, FlightStatus } from '../types'
import { gameTimeToMinutes } from '../types'

// ── Layout (frozen — changing invalidates stored training data) ────────────

const TG_SLOTS = 4
const TG_FEATURES = 8
const CONTACT_SLOTS = 8
const CONTACT_FEATURES = 6
const SQUADRON_SLOTS = 16
const SQUADRON_FEATURES = 8
const PLAN_SLOTS = 8
const PLAN_FEATURES = 6
const GLOBAL_FEATURES = 8

export const FEATURE_VECTOR_SIZE
  = TG_SLOTS * TG_FEATURES // 32
    + CONTACT_SLOTS * CONTACT_FEATURES // 48
    + SQUADRON_SLOTS * SQUADRON_FEATURES // 128
    + PLAN_SLOTS * PLAN_FEATURES // 48
    + GLOBAL_FEATURES // 8
// Total: 264

// ── Normalisation constants ────────────────────────────────────────────────

const MAP_Q_MAX = 80
const MAP_R_MAX = 80
const MAX_SPEED_KTS = 35
const MAX_SHIPS = 10
const MAX_AIRCRAFT = 36
const CONTACT_DECAY_MIN = 240
const MAX_EVENTS = 20
const MAX_FUEL = 10_000

const ORDER_CODES: Record<TaskGroupOrder, number> = {
  standby: 0 / 7, patrol: 1 / 7, strike: 2 / 7, search: 3 / 7,
  escort: 4 / 7, retire: 5 / 7, intercept: 6 / 7, refuel: 7 / 7
}

const MISSION_CODES: Record<MissionType, number> = {
  strike: 1 / 6, search: 2 / 6, cap: 3 / 6, scout: 4 / 6, asw: 5 / 6, intercept: 6 / 6,
  escort: 0
}

const DECK_CODES: Record<DeckStatus, number> = {
  hangared: 0, spotted: 1 / 6, airborne: 2 / 6, recovering: 3 / 6,
  rearming: 4 / 6, fueling: 5 / 6, destroyed: 6 / 6
}

const EXP_CODES: Record<PilotExperience, number> = {
  green: 0, trained: 1 / 3, veteran: 2 / 3, ace: 1
}

const _ROLE_CODES: Record<AircraftRole, number> = {
  'fighter': 0, 'dive-bomber': 1 / 4, 'torpedo-bomber': 2 / 4, 'scout': 3 / 4, 'patrol-bomber': 1
}

const STATUS_CODES: Record<FlightStatus, number> = {
  planned: 0, airborne: 1 / 5, inbound: 2 / 5, returning: 3 / 5, recovered: 4 / 5, lost: 1
}

const CONTACT_TYPE_CODES: Record<string, number> = {
  'carrier-force': 1, 'battleship-force': 0.85, 'surface-force': 0.7,
  'submarine': 0.5, 'transport-convoy': 0.35, 'unknown-warships': 0.2, 'unknown': 0
}

function clamp01(v: number): number {
  return isNaN(v) || !isFinite(v) ? 0 : Math.max(0, Math.min(1, v))
}

function normFuel(pool: number): number {
  return pool === Infinity ? 1 : clamp01(pool / MAX_FUEL)
}

// ── Builder ────────────────────────────────────────────────────────────────

export function toFeatureVector(obs: SidedSnapshot, _side: Side): Float32Array {
  const v = new Float32Array(FEATURE_VECTOR_SIZE)
  let i = 0

  // ── Own task groups (4 × 8) ──────────────────────────────────────────────
  const tgs = [...obs.ownTaskGroups.values()].slice(0, TG_SLOTS)
  for (let s = 0; s < TG_SLOTS; s++) {
    const tg = tgs[s]
    if (!tg) {
      i += TG_FEATURES
      continue
    }
    const ships = [...obs.ownShips.values()].filter(sh => sh.taskGroupId === tg.id)
    const carriers = ships.filter((_sh) => {
      // approximate carrier check via deckStatus on squadrons
      return obs.ownSquadrons && [...obs.ownSquadrons.values()].some(sq => sq.taskGroupId === tg.id)
    })
    v[i++] = 1 // active
    v[i++] = clamp01(tg.position.q / MAP_Q_MAX) // q
    v[i++] = clamp01(tg.position.r / MAP_R_MAX) // r
    v[i++] = clamp01(tg.speed / MAX_SPEED_KTS) // speed
    v[i++] = clamp01(tg.fuelState) // fuelState
    v[i++] = clamp01(ships.length / MAX_SHIPS) // shipCount
    v[i++] = ORDER_CODES[tg.currentOrder] ?? 0 // order
    v[i++] = clamp01(carriers.length / 3) // carrier proxy
  }

  // ── Enemy contacts (8 × 6) ──────────────────────────────────────────────
  const contacts = [...obs.enemyContacts.values()]
    .filter(c => c.isActive)
    .slice(0, CONTACT_SLOTS)
  for (let s = 0; s < CONTACT_SLOTS; s++) {
    const c = contacts[s]
    if (!c) {
      i += CONTACT_FEATURES
      continue
    }
    const nowMin = gameTimeToMinutes(obs.time)
    const ageMin = nowMin - gameTimeToMinutes(c.lastSeenAt)
    v[i++] = 1 // active
    v[i++] = clamp01(c.lastKnownHex.q / MAP_Q_MAX) // q
    v[i++] = clamp01(c.lastKnownHex.r / MAP_R_MAX) // r
    v[i++] = CONTACT_TYPE_CODES[c.contactType] ?? 0 // contactType
    v[i++] = clamp01(ageMin / CONTACT_DECAY_MIN) // age
    v[i++] = clamp01((c.estimatedCourse ?? 0) / 360) // course
  }

  // ── Own squadrons (16 × 8) ──────────────────────────────────────────────
  const squadrons = [...obs.ownSquadrons.values()].slice(0, SQUADRON_SLOTS)
  for (let s = 0; s < SQUADRON_SLOTS; s++) {
    const sq = squadrons[s]
    if (!sq) {
      i += SQUADRON_FEATURES
      continue
    }
    const plan = sq.currentMissionId
      ? obs.ownFlightPlans.get(sq.currentMissionId)
      : undefined
    v[i++] = 1 // present
    v[i++] = clamp01(sq.aircraftCount / MAX_AIRCRAFT) // aircraftCount
    v[i++] = clamp01(sq.fuelLoad / 100) // fuelLoad
    v[i++] = DECK_CODES[sq.deckStatus] ?? 0 // deckStatus
    v[i++] = plan ? (MISSION_CODES[plan.mission] ?? 0) : 0 // missionType
    v[i++] = EXP_CODES[sq.pilotExperience] ?? 0 // experience
    v[i++] = 0 // role (no aircraftType lookup in snapshot)
    v[i++] = sq.deckStatus === 'airborne' ? 1 : 0 // isAirborne
  }

  // ── Own flight plans (8 × 6) ────────────────────────────────────────────
  const plans = [...obs.ownFlightPlans.values()]
    .filter(fp => fp.status === 'airborne' || fp.status === 'inbound' || fp.status === 'returning')
    .slice(0, PLAN_SLOTS)
  for (let s = 0; s < PLAN_SLOTS; s++) {
    const fp = plans[s]
    if (!fp) {
      i += PLAN_FEATURES
      continue
    }
    const nowMin = gameTimeToMinutes(obs.time)
    const launchMin = gameTimeToMinutes(fp.launchTime)
    const etaMin = fp.eta ? gameTimeToMinutes(fp.eta) : nowMin
    const totalDur = Math.max(1, etaMin - launchMin)
    v[i++] = 1 // active
    v[i++] = clamp01((fp.targetHex?.q ?? 0) / MAP_Q_MAX) // targetQ
    v[i++] = clamp01((fp.targetHex?.r ?? 0) / MAP_R_MAX) // targetR
    v[i++] = MISSION_CODES[fp.mission] ?? 0 // mission
    v[i++] = STATUS_CODES[fp.status] ?? 0 // status
    v[i++] = clamp01((nowMin - launchMin) / totalDur) // elapsed fraction
  }

  // ── Scalar globals (8) ──────────────────────────────────────────────────
  v[i++] = normFuel(obs.alliedFuelPool)
  v[i++] = normFuel(obs.japaneseFuelPool)
  v[i++] = obs.side === 'allied' ? normFuel(obs.alliedFuelPool) : normFuel(obs.japaneseFuelPool)
  v[i++] = obs.side === 'allied' ? normFuel(obs.japaneseFuelPool) : normFuel(obs.alliedFuelPool)
  v[i++] = clamp01(obs.combatEvents.length / MAX_EVENTS)
  v[i++] = clamp01(obs.sightingReports.length / MAX_EVENTS)
  v[i++] = clamp01(obs.ownFlightPlans.size / PLAN_SLOTS)
  v[i++] = 0 // reserved

  return v
}
