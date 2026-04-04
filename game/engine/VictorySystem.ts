import type {
  GameTime,
  Ship,
  TaskGroup,
  VictoryCondition,
  ShipClass,
  Side
} from '../types'
import { gameTimeToMinutes } from '../types'
import { coordKey } from '../utils/hexMath'

// ── Types ──────────────────────────────────────────────────────────────────

export interface VictoryState {
  winner: Side | 'draw' | null
  alliedPoints: number
  japanesePoints: number
  metConditions: string[]
  failedConditions: string[]
}

// ── VictorySystem ──────────────────────────────────────────────────────────

export class VictorySystem {
  private shipClasses: Map<number, ShipClass>

  constructor(shipClasses: Map<number, ShipClass>) {
    this.shipClasses = shipClasses
  }

  /**
   * Evaluate all victory conditions after each step.
   * Returns the current victory state. winner is non-null only when
   * the scenario is decided.
   */
  evaluate(
    conditions: VictoryCondition[],
    ships: ReadonlyMap<string, Ship>,
    taskGroups: ReadonlyMap<string, TaskGroup>,
    currentTime: GameTime,
    endTime: GameTime
  ): VictoryState {
    let alliedPoints = 0
    let japanesePoints = 0
    const metConditions: string[] = []
    const failedConditions: string[] = []

    const timeExpired = gameTimeToMinutes(currentTime) >= gameTimeToMinutes(endTime)

    for (const cond of conditions) {
      const result = this.evaluateCondition(cond, ships, taskGroups, currentTime)

      if (result === 'met') {
        metConditions.push(cond.id)
        if (cond.forSide === 'allied') alliedPoints += cond.points
        else japanesePoints += cond.points
      } else if (result === 'failed') {
        failedConditions.push(cond.id)
      }
    }

    const winner = this.determineWinner(alliedPoints, japanesePoints, metConditions, failedConditions, conditions, timeExpired)

    return { winner, alliedPoints, japanesePoints, metConditions, failedConditions }
  }

  // ── Individual condition evaluation ──────────────────────────────────────

  private evaluateCondition(
    cond: VictoryCondition,
    ships: ReadonlyMap<string, Ship>,
    taskGroups: ReadonlyMap<string, TaskGroup>,
    currentTime: GameTime
  ): 'met' | 'failed' | 'pending' {
    switch (cond.type) {
      case 'sink-carrier':
        return this.checkSinkCarrier(cond.forSide === 'allied' ? 'japanese' : 'allied', ships)

      case 'sink-ship-class':
        if (!cond.targetShipClassId) return 'pending'
        return this.checkSinkShipClass(cond.targetShipClassId, cond.forSide === 'allied' ? 'japanese' : 'allied', ships)

      case 'control-hex':
        if (!cond.targetHex) return 'pending'
        return this.checkControlHex(cond.targetHex, cond.forSide, taskGroups)

      case 'survive-until':
        if (!cond.deadline) return 'pending'
        if (gameTimeToMinutes(currentTime) >= gameTimeToMinutes(cond.deadline)) {
          return 'met'
        }
        // Check if the side has any carriers left to survive
        return this.checkHasCarriers(cond.forSide, ships) ? 'pending' : 'failed'

      case 'sink-total-tonnage':
        if (!cond.targetTonnage) return 'pending'
        return this.checkTonnageSunk(cond.forSide === 'allied' ? 'japanese' : 'allied', cond.targetTonnage, ships)

      default:
        return 'pending'
    }
  }

  // ── Condition checks ──────────────────────────────────────────────────────

  private checkSinkCarrier(targetSide: Side, ships: ReadonlyMap<string, Ship>): 'met' | 'pending' {
    const carrierTypes = ['fleet-carrier', 'light-carrier']
    let allSunk = true
    let found = false

    for (const ship of ships.values()) {
      if (ship.side !== targetSide) continue
      const sc = this.shipClasses.get(ship.classId)
      if (!sc || !carrierTypes.includes(sc.type)) continue
      found = true
      if (ship.status !== 'sunk') {
        allSunk = false
        break
      }
    }

    return (found && allSunk) ? 'met' : 'pending'
  }

  private checkSinkShipClass(classId: number, targetSide: Side, ships: ReadonlyMap<string, Ship>): 'met' | 'pending' {
    for (const ship of ships.values()) {
      if (ship.side !== targetSide || ship.classId !== classId) continue
      if (ship.status !== 'sunk') return 'pending'
    }
    return 'met'
  }

  private checkControlHex(
    hex: { q: number; r: number },
    forSide: Side,
    taskGroups: ReadonlyMap<string, TaskGroup>
  ): 'met' | 'pending' {
    const key = coordKey(hex)
    for (const tg of taskGroups.values()) {
      if (tg.side === forSide && coordKey(tg.position) === key) return 'met'
    }
    return 'pending'
  }

  private checkHasCarriers(side: Side, ships: ReadonlyMap<string, Ship>): boolean {
    const carrierTypes = ['fleet-carrier', 'light-carrier']
    for (const ship of ships.values()) {
      if (ship.side !== side) continue
      const sc = this.shipClasses.get(ship.classId)
      if (sc && carrierTypes.includes(sc.type) && ship.status !== 'sunk') return true
    }
    return false
  }

  private checkTonnageSunk(targetSide: Side, targetTonnage: number, ships: ReadonlyMap<string, Ship>): 'met' | 'pending' {
    let sunkTonnage = 0
    for (const ship of ships.values()) {
      if (ship.side !== targetSide || ship.status !== 'sunk') continue
      const sc = this.shipClasses.get(ship.classId)
      if (sc) sunkTonnage += sc.displacement
    }
    return sunkTonnage >= targetTonnage ? 'met' : 'pending'
  }

  // ── Winner determination ──────────────────────────────────────────────────

  private determineWinner(
    alliedPoints: number,
    japanesePoints: number,
    metConditions: string[],
    _failedConditions: string[],
    allConditions: VictoryCondition[],
    timeExpired: boolean
  ): Side | 'draw' | null {
    // Check if any side has met ALL their victory conditions
    const alliedConditions = allConditions.filter(c => c.forSide === 'allied')
    const japaneseConditions = allConditions.filter(c => c.forSide === 'japanese')

    const alliedMet = alliedConditions.length > 0 && alliedConditions.every(c => metConditions.includes(c.id))
    const japaneseMet = japaneseConditions.length > 0 && japaneseConditions.every(c => metConditions.includes(c.id))

    if (alliedMet && !japaneseMet) return 'allied'
    if (japaneseMet && !alliedMet) return 'japanese'
    if (alliedMet && japaneseMet) return alliedPoints >= japanesePoints ? 'allied' : 'japanese'

    // Scenario time expired — award victory by points
    if (timeExpired) {
      if (alliedPoints > japanesePoints) return 'allied'
      if (japanesePoints > alliedPoints) return 'japanese'
      return 'draw'
    }

    return null  // still in progress
  }
}
