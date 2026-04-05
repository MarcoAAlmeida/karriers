// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { VictorySystem } from '@game/engine/VictorySystem'
import type { Ship, ShipClass, TaskGroup, VictoryCondition, GameTime } from '@game/types'

// ── Fixtures ───────────────────────────────────────────────────────────────

const CARRIER_CLASS_ID = 1
const BB_CLASS_ID = 2

function makeShipClass(id: number, type: ShipClass['type'], displacement = 30000): ShipClass {
  return {
    id,
    name: 'Test',
    type,
    side: 'japanese',
    displacement,
    maxSpeed: 30,
    aaStrength: 50,
    armorRating: 30,
    hullPoints: 100,
    damageControlRating: 70
  }
}

function makeShip(id: string, side: Ship['side'], classId: number, status: Ship['status'] = 'operational'): Ship {
  return {
    id,
    classId,
    name: id,
    side,
    taskGroupId: 'tg1',
    hullDamage: status === 'sunk' ? 100 : 0,
    fires: 0,
    floodingRisk: 0,
    fuelLevel: 100,
    ammoLevel: 100,
    damageControlEfficiency: 100,
    status
  }
}

function makeTG(id: string, side: TaskGroup['side'], pos: { q: number; r: number }): TaskGroup {
  return {
    id,
    name: id,
    side,
    flagshipId: 'ship1',
    shipIds: ['ship1'],
    position: pos,
    course: 0,
    speed: 25,
    currentOrder: 'standby'
  }
}

const TIME: GameTime = { day: 1, hour: 10, minute: 0 }
const END_TIME: GameTime = { day: 3, hour: 0, minute: 0 }

function makeVS() {
  const classes = new Map([
    [CARRIER_CLASS_ID, makeShipClass(CARRIER_CLASS_ID, 'fleet-carrier')],
    [BB_CLASS_ID, makeShipClass(BB_CLASS_ID, 'battleship', 45000)]
  ])
  return new VictorySystem(classes)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('VictorySystem — sink-carrier', () => {
  it('returns allied winner when all japanese carriers are sunk', () => {
    const vs = makeVS()
    const ships = new Map([
      ['akagi', makeShip('akagi', 'japanese', CARRIER_CLASS_ID, 'sunk')],
      ['kaga', makeShip('kaga', 'japanese', CARRIER_CLASS_ID, 'sunk')]
    ])
    const cond: VictoryCondition = {
      id: 'sink-all-carriers',
      type: 'sink-carrier',
      forSide: 'allied',
      points: 50,
      description: 'Sink all IJN carriers'
    }
    const result = vs.evaluate([cond], ships, new Map(), TIME, END_TIME)
    expect(result.winner).toBe('allied')
    expect(result.alliedPoints).toBe(50)
  })

  it('returns null while at least one japanese carrier survives', () => {
    const vs = makeVS()
    const ships = new Map([
      ['akagi', makeShip('akagi', 'japanese', CARRIER_CLASS_ID, 'sunk')],
      ['kaga', makeShip('kaga', 'japanese', CARRIER_CLASS_ID, 'operational')]
    ])
    const cond: VictoryCondition = {
      id: 'sink-all-carriers',
      type: 'sink-carrier',
      forSide: 'allied',
      points: 50,
      description: 'Sink all IJN carriers'
    }
    const result = vs.evaluate([cond], ships, new Map(), TIME, END_TIME)
    expect(result.winner).toBeNull()
  })
})

describe('VictorySystem — survive-until', () => {
  it('is pending before the deadline', () => {
    const vs = makeVS()
    const ships = new Map([
      ['enterprise', makeShip('enterprise', 'allied', CARRIER_CLASS_ID, 'operational')]
    ])
    const cond: VictoryCondition = {
      id: 'survive-d2',
      type: 'survive-until',
      forSide: 'allied',
      deadline: { day: 2, hour: 0, minute: 0 },
      points: 30,
      description: 'Survive to day 2'
    }
    const result = vs.evaluate([cond], ships, new Map(), TIME, END_TIME)
    expect(result.winner).toBeNull()
    expect(result.metConditions).not.toContain('survive-d2')
  })

  it('is met when current time reaches the deadline', () => {
    const vs = makeVS()
    const ships = new Map([
      ['enterprise', makeShip('enterprise', 'allied', CARRIER_CLASS_ID, 'operational')]
    ])
    const cond: VictoryCondition = {
      id: 'survive-d2',
      type: 'survive-until',
      forSide: 'allied',
      deadline: { day: 1, hour: 8, minute: 0 },
      points: 30,
      description: 'Survive to 08:00'
    }
    // TIME is day 1 10:00 — past the deadline
    const result = vs.evaluate([cond], ships, new Map(), TIME, END_TIME)
    expect(result.metConditions).toContain('survive-d2')
    expect(result.alliedPoints).toBe(30)
  })
})

describe('VictorySystem — control-hex', () => {
  it('is met when a friendly TG occupies the target hex', () => {
    const vs = makeVS()
    const targetHex = { q: 35, r: 55 }
    const taskGroups = new Map([
      ['us-tg', makeTG('us-tg', 'allied', targetHex)]
    ])
    const cond: VictoryCondition = {
      id: 'control-midway',
      type: 'control-hex',
      forSide: 'allied',
      targetHex,
      points: 20,
      description: 'Control Midway hex'
    }
    const result = vs.evaluate([cond], new Map(), taskGroups, TIME, END_TIME)
    expect(result.metConditions).toContain('control-midway')
    expect(result.alliedPoints).toBe(20)
  })

  it('is pending when no friendly TG is at the target hex', () => {
    const vs = makeVS()
    const taskGroups = new Map([
      ['us-tg', makeTG('us-tg', 'allied', { q: 10, r: 10 })]
    ])
    const cond: VictoryCondition = {
      id: 'control-midway',
      type: 'control-hex',
      forSide: 'allied',
      targetHex: { q: 35, r: 55 },
      points: 20,
      description: 'Control Midway hex'
    }
    const result = vs.evaluate([cond], new Map(), taskGroups, TIME, END_TIME)
    expect(result.metConditions).not.toContain('control-midway')
    expect(result.winner).toBeNull()
  })
})

describe('VictorySystem — sink-total-tonnage', () => {
  it('is met when sunk tonnage exceeds target', () => {
    const vs = makeVS()
    const ships = new Map([
      ['yamato', makeShip('yamato', 'japanese', BB_CLASS_ID, 'sunk')],  // 45 000 t
      ['musashi', makeShip('musashi', 'japanese', BB_CLASS_ID, 'sunk')] // 45 000 t
    ])
    const cond: VictoryCondition = {
      id: 'tonnage',
      type: 'sink-total-tonnage',
      forSide: 'allied',
      targetTonnage: 80000,
      points: 25,
      description: 'Sink 80 000 tons'
    }
    const result = vs.evaluate([cond], ships, new Map(), TIME, END_TIME)
    expect(result.metConditions).toContain('tonnage')
    expect(result.alliedPoints).toBe(25)
  })

  it('is pending when sunk tonnage is below target', () => {
    const vs = makeVS()
    const ships = new Map([
      ['yamato', makeShip('yamato', 'japanese', BB_CLASS_ID, 'operational')]
    ])
    const cond: VictoryCondition = {
      id: 'tonnage',
      type: 'sink-total-tonnage',
      forSide: 'allied',
      targetTonnage: 80000,
      points: 25,
      description: 'Sink 80 000 tons'
    }
    const result = vs.evaluate([cond], ships, new Map(), TIME, END_TIME)
    expect(result.winner).toBeNull()
  })
})

describe('VictorySystem — points tiebreak on time expiry', () => {
  it('awards allied victory when allied points exceed japanese at expiry', () => {
    const vs = makeVS()
    // One condition for each side, both met
    const alliedCond: VictoryCondition = {
      id: 'allied-cond',
      type: 'control-hex',
      forSide: 'allied',
      targetHex: { q: 1, r: 1 },
      points: 40,
      description: ''
    }
    const japCond: VictoryCondition = {
      id: 'jap-cond',
      type: 'control-hex',
      forSide: 'japanese',
      targetHex: { q: 2, r: 2 },
      points: 20,
      description: ''
    }
    const taskGroups = new Map([
      ['us-tg',  makeTG('us-tg',  'allied',    { q: 1, r: 1 })],
      ['ijn-tg', makeTG('ijn-tg', 'japanese',  { q: 2, r: 2 })]
    ])
    // Time has expired
    const expired: GameTime = { day: 3, hour: 0, minute: 0 }
    const result = vs.evaluate([alliedCond, japCond], new Map(), taskGroups, expired, END_TIME)
    expect(result.winner).toBe('allied')
  })

  it('returns draw when points are equal at time expiry', () => {
    const vs = makeVS()
    // No conditions met — both at 0 points, time expired
    const cond: VictoryCondition = {
      id: 'impossible',
      type: 'sink-carrier',
      forSide: 'allied',
      points: 0,
      description: ''
    }
    const expired: GameTime = { day: 3, hour: 0, minute: 0 }
    const result = vs.evaluate([cond], new Map(), new Map(), expired, END_TIME)
    expect(result.winner).toBe('draw')
  })
})
