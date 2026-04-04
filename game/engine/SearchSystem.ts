import type { GameTime, WeatherZone } from '../types'
import type { Side, TaskGroup } from '../types'
import type { AircraftType, Squadron } from '../types'
import type { SightingReport, ContactType } from '../types'
import type { Rng } from '../utils/dice'
import { rollD100, chance } from '../utils/dice'
import { hexDistance, hexesInRange, coordKey, NM_PER_HEX } from '../utils/hexMath'
import type { HexCoord } from '../types'
import { AIRCRAFT_TYPES } from '../data/aircraftTypes'

// ── Constants ──────────────────────────────────────────────────────────────

/** Maximum base detection probability at point-blank range in perfect conditions. */
const MAX_DETECT_PROBABILITY = 0.85

/** Probability of a false report by experience level. */
const FALSE_REPORT_CHANCE: Record<string, number> = {
  ace: 0.03,
  veteran: 0.08,
  trained: 0.18,
  green: 0.28
}

/** Probability of correct contact type identification by experience. */
const ID_ACCURACY: Record<string, number> = {
  ace: 0.97,
  veteran: 0.82,
  trained: 0.62,
  green: 0.40
}

/** Default visibility (NM) when no weather zone applies. */
const DEFAULT_VISIBILITY_NM = 80

// ── SearchSystem ───────────────────────────────────────────────────────────

export class SearchSystem {
  private rng: Rng
  private aircraftTypes: Map<number, AircraftType>

  constructor(rng: Rng, aircraftTypes: Map<number, AircraftType>) {
    this.rng = rng
    this.aircraftTypes = aircraftTypes
  }

  /**
   * Process one 30-minute search step.
   * Returns all sighting reports generated this step (including false ones).
   */
  processStep(
    taskGroups: ReadonlyMap<string, TaskGroup>,
    squadrons: ReadonlyMap<string, Squadron>,
    weatherZones: WeatherZone[],
    currentTime: GameTime
  ): SightingReport[] {
    const reports: SightingReport[] = []
    let reportCounter = 0

    for (const searcher of taskGroups.values()) {
      if (searcher.currentOrder !== 'search') continue

      const searchSquadrons = this.getSearchSquadrons(searcher.id, squadrons)
      if (searchSquadrons.length === 0) continue

      const { bestRange, bestAircraft, bestSquadron } = this.getBestSearchCapability(searchSquadrons)
      if (!bestAircraft || !bestSquadron) continue

      const enemySide: Side = searcher.side === 'allied' ? 'japanese' : 'allied'

      for (const target of taskGroups.values()) {
        if (target.side !== enemySide) continue

        const distHexes = hexDistance(searcher.position, target.position)
        const distNm = distHexes * NM_PER_HEX

        if (distNm > bestRange) continue

        const visibility = this.getVisibility(target.position, weatherZones)
        const probability = this.contactProbability(
          distNm,
          bestRange,
          visibility,
          bestAircraft,
          bestSquadron
        )

        if (!chance(this.rng, probability)) continue

        const isFalse = chance(this.rng, FALSE_REPORT_CHANCE[bestSquadron.pilotExperience] ?? 0.2)
        const contactType = this.identifyContactType(target, taskGroups, isFalse)
        const reportHex = isFalse
          ? this.randomNearbyHex(target.position, 4)
          : { ...target.position }

        const confidence = Math.round(
          probability * (isFalse ? 40 : 100) * (ID_ACCURACY[bestSquadron.pilotExperience] ?? 0.6)
        )

        const report: SightingReport = {
          id: `rpt-${currentTime.day}-${currentTime.hour}-${currentTime.minute}-${reportCounter++}`,
          reportedAt: currentTime,
          reportedBy: searcher.side,
          detectedBy: 'aircraft',
          contactHex: reportHex,
          reportedContactType: contactType,
          actualTaskGroupId: isFalse ? undefined : target.id,
          estimatedCourse: isFalse ? undefined : this.estimateCourse(target.course),
          estimatedSpeed: isFalse ? undefined : this.estimateSpeed(target.speed, bestSquadron.pilotExperience),
          confidence: Math.min(confidence, 100),
          isFalseReport: isFalse
        }

        reports.push(report)
      }
    }

    return reports
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getSearchSquadrons(
    taskGroupId: string,
    squadrons: ReadonlyMap<string, Squadron>
  ): Squadron[] {
    return [...squadrons.values()].filter(s =>
      s.taskGroupId === taskGroupId
      && s.deckStatus !== 'destroyed'
      && s.aircraftCount > 0
    )
  }

  private getBestSearchCapability(squadrons: Squadron[]): {
    bestRange: number
    bestAircraft: AircraftType | null
    bestSquadron: Squadron | null
  } {
    let bestRange = 0
    let bestAircraft: AircraftType | null = null
    let bestSquadron: Squadron | null = null

    for (const sq of squadrons) {
      const aircraft = this.aircraftTypes.get(sq.aircraftTypeId) ?? AIRCRAFT_TYPES.find(a => a.id === sq.aircraftTypeId)
      if (!aircraft) continue

      // Scouts and patrol bombers have full range; other types use half
      const effectiveRange = (aircraft.role === 'scout' || aircraft.role === 'patrol-bomber')
        ? aircraft.maxRange
        : aircraft.maxRange * 0.45

      if (effectiveRange > bestRange) {
        bestRange = effectiveRange
        bestAircraft = aircraft
        bestSquadron = sq
      }
    }

    return { bestRange, bestAircraft, bestSquadron }
  }

  private contactProbability(
    distNm: number,
    rangeNm: number,
    visibilityNm: number,
    aircraft: AircraftType,
    squadron: Squadron
  ): number {
    // Distance factor: 1.0 at 0 NM, 0.0 at max range
    const distFactor = Math.max(0, 1 - (distNm / rangeNm))

    // Visibility factor: full at 80+ NM vis, zero at 0 NM
    const visFactor = Math.min(visibilityNm / DEFAULT_VISIBILITY_NM, 1.0)

    // Experience modifier from aircraft type table
    const expMod = aircraft.experienceModifiers[squadron.pilotExperience] ?? 1.0

    return Math.min(
      MAX_DETECT_PROBABILITY * distFactor * visFactor * Math.min(expMod, 1.5),
      MAX_DETECT_PROBABILITY
    )
  }

  private getVisibility(position: HexCoord, weatherZones: WeatherZone[]): number {
    const key = coordKey(position)
    for (const zone of weatherZones) {
      if (zone.hexes.some(h => coordKey(h) === key)) {
        return zone.condition.visibility
      }
    }
    return DEFAULT_VISIBILITY_NM
  }

  private identifyContactType(
    target: TaskGroup,
    allGroups: ReadonlyMap<string, TaskGroup>,
    isFalse: boolean
  ): ContactType {
    if (isFalse) {
      const falseTypes: ContactType[] = ['unknown-warships', 'surface-force', 'transport-convoy', 'unknown']
      return falseTypes[Math.floor(this.rng() * falseTypes.length)]!
    }

    // Determine true contact type based on what's in the task group
    const trueType = this.trueContactType(target)

    // Misidentification chance
    const idAcc = ID_ACCURACY[this.getBestExperience(target, allGroups)] ?? 0.6
    if (chance(this.rng, idAcc)) return trueType

    // Misidentify
    return this.misidentify(trueType)
  }

  private trueContactType(tg: TaskGroup): ContactType {
    // We can't access ships here, so use the task group order as proxy
    if (tg.currentOrder === 'strike' || tg.currentOrder === 'search') return 'carrier-force'
    if (tg.currentOrder === 'patrol') return 'surface-force'
    return 'surface-force'
  }

  private getBestExperience(tg: TaskGroup, _allGroups: ReadonlyMap<string, TaskGroup>): string {
    // Without full ship→squadron lookup here, default to 'trained'
    return 'trained'
  }

  private misidentify(type: ContactType): ContactType {
    const alternatives: Record<ContactType, ContactType[]> = {
      'carrier-force': ['surface-force', 'battleship-force'],
      'battleship-force': ['surface-force', 'carrier-force'],
      'surface-force': ['carrier-force', 'unknown-warships'],
      'submarine': ['unknown'],
      'transport-convoy': ['surface-force', 'unknown'],
      'unknown-warships': ['surface-force', 'carrier-force'],
      'unknown': ['surface-force']
    }
    const opts = alternatives[type] ?? ['unknown']
    return opts[Math.floor(this.rng() * opts.length)]!
  }

  private randomNearbyHex(center: HexCoord, radius: number): HexCoord {
    const candidates = hexesInRange(center, radius).filter(
      h => !(h.q === center.q && h.r === center.r)
    )
    if (candidates.length === 0) return { ...center }
    return candidates[Math.floor(this.rng() * candidates.length)]!
  }

  private estimateCourse(trueCourse: number): number {
    // Add ±30° random error
    return (trueCourse + (this.rng() - 0.5) * 60 + 360) % 360
  }

  private estimateSpeed(trueSpeed: number, experience: string): number {
    const error = experience === 'ace' ? 2 : experience === 'veteran' ? 5 : 8
    return Math.max(5, trueSpeed + (this.rng() - 0.5) * error * 2)
  }
}
