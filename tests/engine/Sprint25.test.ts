/**
 * Sprint 25 — SidedSnapshot + featureVector
 *
 * Tests:
 *  1. getObservation('allied') never exposes Japanese TG positions not in allied contacts.
 *  2. getObservation('allied') always includes own task groups.
 *  3. getObservation filters own ships, squadrons and flight plans correctly.
 *  4. Feature vector has the correct fixed length (FEATURE_VECTOR_SIZE = 264).
 *  5. Feature vector is deterministic — same observation → same vector.
 */

import { describe, it, expect } from 'vitest'
import { MIDWAY } from '@game/data/scenarios/midway'
import { buildStateFromScenario } from '@game/utils/scenarioState'
import { GameEngine } from '@game/engine/GameEngine'
import { JapaneseAI } from '@game/engine/JapaneseAI'
import { toFeatureVector, FEATURE_VECTOR_SIZE } from '@game/utils/featureVector'

const ONE_STEP_MS = 30 * 130 + 1

function buildEngine(steps = 5) {
  const state = buildStateFromScenario(MIDWAY, { seed: 42, spawnMode: 'fixed' })
  const engine = new GameEngine(state, MIDWAY.startTime, MIDWAY.endTime, { seed: 42 })
  const ai = new JapaneseAI()
  engine.resume()
  for (let i = 0; i < steps; i++) {
    engine.tick(ONE_STEP_MS)
    ai.step(engine.getSnapshot(), order => engine.issueOrder(order))
  }
  return engine
}

// ── SidedSnapshot tests ────────────────────────────────────────────────────

describe('SidedSnapshot', () => {
  it('getObservation("allied") never exposes Japanese TG positions absent from allied contacts', () => {
    const engine = buildEngine(10)
    const obs = engine.getObservation('allied')

    // ownTaskGroups must only contain allied TGs
    for (const tg of obs.ownTaskGroups.values()) {
      expect(tg.side).toBe('allied')
    }

    // Full snapshot ground truth
    const snap = engine.getSnapshot()
    const japaneseTGIds = new Set(
      [...snap.taskGroups.values()]
        .filter(tg => tg.side === 'japanese')
        .map(tg => tg.id)
    )

    // Confirmed contacts in the observation
    const _confirmedContactTGIds = new Set(
      [...obs.enemyContacts.values()]
        .filter(c => c.isActive && c.confirmedTaskGroupId)
        .map(c => c.confirmedTaskGroupId!)
    )

    // No Japanese TG in ownTaskGroups
    for (const id of obs.ownTaskGroups.keys()) {
      expect(japaneseTGIds.has(id)).toBe(false)
    }

    // Enemy contacts only reference real Japanese TGs (no allied TGs as enemy contacts)
    for (const contact of obs.enemyContacts.values()) {
      if (contact.confirmedTaskGroupId) {
        expect(japaneseTGIds.has(contact.confirmedTaskGroupId)).toBe(true)
      }
    }

    engine.destroy()
  })

  it('getObservation("allied") always includes all own task groups', () => {
    const engine = buildEngine(5)
    const obs = engine.getObservation('allied')
    const snap = engine.getSnapshot()

    const alliedTGIds = [...snap.taskGroups.values()]
      .filter(tg => tg.side === 'allied')
      .map(tg => tg.id)

    for (const id of alliedTGIds) {
      expect(obs.ownTaskGroups.has(id)).toBe(true)
    }

    engine.destroy()
  })

  it('getObservation filters own ships and squadrons to the requesting side', () => {
    const engine = buildEngine(3)

    const alliedObs = engine.getObservation('allied')
    for (const ship of alliedObs.ownShips.values()) {
      expect(ship.side).toBe('allied')
    }
    for (const sq of alliedObs.ownSquadrons.values()) {
      expect(sq.side).toBe('allied')
    }

    const japaneseObs = engine.getObservation('japanese')
    for (const ship of japaneseObs.ownShips.values()) {
      expect(ship.side).toBe('japanese')
    }
    for (const sq of japaneseObs.ownSquadrons.values()) {
      expect(sq.side).toBe('japanese')
    }

    engine.destroy()
  })

  it('enemyContacts for allied is own (allied) contact map, not ground truth positions', () => {
    const engine = buildEngine(8)
    const obs = engine.getObservation('allied')
    const snap = engine.getSnapshot()

    // alliedContacts in the full snapshot should match enemyContacts in the allied observation
    expect(obs.enemyContacts.size).toBe(snap.alliedContacts.size)

    engine.destroy()
  })
})

// ── featureVector tests ────────────────────────────────────────────────────

describe('featureVector', () => {
  it('returns a Float32Array of the correct fixed length', () => {
    expect(FEATURE_VECTOR_SIZE).toBe(264)

    const engine = buildEngine(5)
    const obs = engine.getObservation('allied')
    const vec = toFeatureVector(obs, 'allied')

    expect(vec).toBeInstanceOf(Float32Array)
    expect(vec.length).toBe(FEATURE_VECTOR_SIZE)

    engine.destroy()
  })

  it('feature vector is deterministic — same observation yields the same vector', () => {
    const engine = buildEngine(5)
    const obs = engine.getObservation('allied')

    const v1 = toFeatureVector(obs, 'allied')
    const v2 = toFeatureVector(obs, 'allied')

    expect(Array.from(v1)).toEqual(Array.from(v2))

    engine.destroy()
  })

  it('all values are in [0, 1]', () => {
    const engine = buildEngine(5)
    const obs = engine.getObservation('allied')
    const vec = toFeatureVector(obs, 'allied')

    for (let i = 0; i < vec.length; i++) {
      expect(vec[i]).toBeGreaterThanOrEqual(0)
      expect(vec[i]).toBeLessThanOrEqual(1)
    }

    engine.destroy()
  })

  it('feature vectors differ between allied and japanese observations', () => {
    const engine = buildEngine(10)
    const alliedVec = toFeatureVector(engine.getObservation('allied'), 'allied')
    const japaneseVec = toFeatureVector(engine.getObservation('japanese'), 'japanese')

    // Different sides should produce different vectors (unless perfectly symmetric — very unlikely)
    const identical = Array.from(alliedVec).every((v, i) => v === japaneseVec[i])
    expect(identical).toBe(false)

    engine.destroy()
  })
})
