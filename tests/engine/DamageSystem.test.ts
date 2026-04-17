// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { DamageSystem } from '@game/engine/DamageSystem'
import { createRng } from '@game/utils/dice'
import type { Ship, ShipClass, HitResult } from '@game/types'

// ── Fixtures ───────────────────────────────────────────────────────────────

const CARRIER_CLASS_ID = 1
const DD_CLASS_ID = 2

function makeShipClass(id: number, type: ShipClass['type'], opts: Partial<ShipClass> = {}): ShipClass {
  return {
    id,
    name: 'Test Class',
    type,
    side: 'japanese',
    displacement: 20000,
    maxSpeed: 28,
    aaStrength: 60,
    armorRating: 30,
    hullPoints: 100,
    damageControlRating: 70,
    ...opts
  }
}

function makeShip(id: string, classId = CARRIER_CLASS_ID): Ship {
  return {
    id,
    classId,
    name: 'Test Ship',
    side: 'japanese',
    taskGroupId: 'tg1',
    hullDamage: 0,
    fires: 0,
    floodingRisk: 0,
    fuelLevel: 100,
    ammoLevel: 100,
    damageControlEfficiency: 100,
    status: 'operational'
  }
}

function makeHit(opts: Partial<HitResult> = {}): HitResult {
  return {
    shipId: 'ship1',
    damageType: 'bomb',
    hullDamageDealt: 15,
    firesStarted: 1,
    floodingInduced: 5,
    crewCasualties: 3,
    systemsDisabled: [],
    ...opts
  }
}

function makeDS(seed = 42) {
  const classes = new Map([
    [CARRIER_CLASS_ID, makeShipClass(CARRIER_CLASS_ID, 'fleet-carrier')],
    [DD_CLASS_ID, makeShipClass(DD_CLASS_ID, 'destroyer', { displacement: 2000 })]
  ])
  return new DamageSystem(createRng(seed), classes)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('DamageSystem.applyHit', () => {
  it('increases hullDamage, fires, and floodingRisk', () => {
    const ds = makeDS()
    const ship = makeShip('s1')
    ds.applyHit(ship, makeHit({ hullDamageDealt: 20, firesStarted: 2, floodingInduced: 10 }))
    expect(ship.hullDamage).toBe(20)
    expect(ship.fires).toBe(2)
    expect(ship.floodingRisk).toBe(10)
  })

  it('does nothing to a sunk ship', () => {
    const ds = makeDS()
    const ship = makeShip('s1')
    ship.status = 'sunk'
    ds.applyHit(ship, makeHit({ hullDamageDealt: 50 }))
    expect(ship.hullDamage).toBe(0)
  })

  it('hull damage caps at 100', () => {
    const ds = makeDS()
    const ship = makeShip('s1')
    ship.hullDamage = 90
    ds.applyHit(ship, makeHit({ hullDamageDealt: 50 }))
    expect(ship.hullDamage).toBe(100)
  })
})

describe('DamageSystem status transitions', () => {
  it('operational → damaged when hullDamage ≥ 25', () => {
    const ds = makeDS()
    const ship = makeShip('s1')
    ds.applyHit(ship, makeHit({ hullDamageDealt: 25, firesStarted: 0, floodingInduced: 0 }))
    expect(ship.status).toBe('damaged')
  })

  it('operational → on-fire when fires ≥ 3', () => {
    const ds = makeDS()
    const ship = makeShip('s1')
    ds.applyHit(ship, makeHit({ hullDamageDealt: 10, firesStarted: 3, floodingInduced: 0 }))
    expect(ship.status).toBe('on-fire')
  })

  it('sinks ship when hullDamage reaches 100', () => {
    const ds = makeDS()
    const ship = makeShip('s1')
    ds.applyHit(ship, makeHit({ hullDamageDealt: 100, firesStarted: 0, floodingInduced: 0 }))
    expect(ship.status).toBe('sunk')
    expect(ship.fires).toBe(0)
    expect(ship.floodingRisk).toBe(0)
  })
})

describe('DamageSystem.processStep', () => {
  it('fires add hull damage each step', () => {
    // Use a seed where DC always fails (so fires don't get extinguished)
    // Seed 0 gives consistent fire spread / DC results
    const ds = makeDS(999)
    const ship = makeShip('s1')
    ship.fires = 2
    ship.damageControlEfficiency = 0 // DC completely degraded — fires won't be put out

    const ships = new Map([['s1', ship]])
    ds.processStep(ships)

    // At least fire damage was applied (fires * 4 per step, before DC)
    expect(ship.hullDamage).toBeGreaterThan(0)
  })

  it('flooding adds hull damage each step', () => {
    const ds = makeDS()
    const ship = makeShip('s1')
    ship.floodingRisk = 50

    const ships = new Map([['s1', ship]])
    ds.processStep(ships)

    // floodingRisk * 0.08 = 4 damage, roughly
    expect(ship.hullDamage).toBeGreaterThan(0)
  })

  it('returns IDs of ships that sink this step', () => {
    const ds = makeDS(1)
    const ship = makeShip('s1')
    ship.hullDamage = 98
    ship.fires = 10 // enough fire damage to push over 100

    const ships = new Map([['s1', ship]])
    const sunk = ds.processStep(ships)
    expect(sunk).toContain('s1')
    expect(ship.status).toBe('sunk')
  })

  it('skips already-sunk ships', () => {
    const ds = makeDS()
    const ship = makeShip('s1')
    ship.status = 'sunk'
    ship.fires = 5

    const ships = new Map([['s1', ship]])
    const sunk = ds.processStep(ships)
    expect(sunk).toHaveLength(0)
  })
})

describe('DamageSystem.applyStrikeHits', () => {
  it('applies each hit to the correct ship', () => {
    const ds = makeDS()
    const ship = makeShip('s1')
    const ships = new Map([['s1', ship]])
    const hit = makeHit({ shipId: 's1', hullDamageDealt: 20 })

    ds.applyStrikeHits([hit], ships, new Map())
    expect(ship.hullDamage).toBe(20)
  })

  it('returns IDs of ships sunk by the strike', () => {
    const ds = makeDS()
    const ship = makeShip('s1')
    ship.hullDamage = 90
    const ships = new Map([['s1', ship]])
    const hit = makeHit({ shipId: 's1', hullDamageDealt: 20 })

    const sunk = ds.applyStrikeHits([hit], ships, new Map())
    expect(sunk).toContain('s1')
  })
})
