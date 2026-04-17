// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scenarioFromDefinition, fetchManifest, fetchScenario } from '@game/data/scenarioRepository'
import { MIDWAY } from '@game/data/scenarios/midway'
import type { ScenarioDefinition } from '@game/types'

// Load the real JSON files from disk so tests stay honest
const ROOT = resolve(__dirname, '../../public/scenarios')

function loadMidwayDef(): ScenarioDefinition {
  return JSON.parse(readFileSync(resolve(ROOT, 'midway.json'), 'utf-8')) as ScenarioDefinition
}

function loadManifestRaw(): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf-8'))
}

// ── helpers ────────────────────────────────────────────────────────────────

function mockFetch(responses: Record<string, unknown>) {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url in responses) {
      return { ok: true, json: async () => responses[url] }
    }
    return { ok: false, status: 404, json: async () => null }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── scenarioFromDefinition: round-trip ─────────────────────────────────────

describe('scenarioFromDefinition', () => {
  it('produces the same ships as the TS reference', () => {
    const def = loadMidwayDef()
    const scenario = scenarioFromDefinition(def)

    const refShips = MIDWAY.forces.flatMap(f => f.ships).sort((a, b) => a.id.localeCompare(b.id))
    const jsonShips = scenario.forces.flatMap(f => f.ships).sort((a, b) => a.id.localeCompare(b.id))

    expect(jsonShips.length).toBe(refShips.length)
    for (let i = 0; i < refShips.length; i++) {
      const ref = refShips[i]
      const json = jsonShips[i]
      expect(json.id).toBe(ref.id)
      expect(json.classId).toBe(ref.classId)
      expect(json.name).toBe(ref.name)
      expect(json.side).toBe(ref.side)
      expect(json.taskGroupId).toBe(ref.taskGroupId)
      expect(json.hullDamage).toBe(ref.hullDamage)
      expect(json.fuelLevel).toBe(ref.fuelLevel)
      expect(json.ammoLevel).toBe(ref.ammoLevel)
      expect(json.status).toBe(ref.status)
    }
  })

  it('produces the same task groups as the TS reference', () => {
    const def = loadMidwayDef()
    const scenario = scenarioFromDefinition(def)

    const refTGs = MIDWAY.forces.flatMap(f => f.taskGroups).sort((a, b) => a.id.localeCompare(b.id))
    const jsonTGs = scenario.forces.flatMap(f => f.taskGroups).sort((a, b) => a.id.localeCompare(b.id))

    expect(jsonTGs.length).toBe(refTGs.length)
    for (let i = 0; i < refTGs.length; i++) {
      const ref = refTGs[i]
      const json = jsonTGs[i]
      expect(json.id).toBe(ref.id)
      expect(json.side).toBe(ref.side)
      expect(json.position).toEqual(ref.position)
      expect(json.speed).toBe(ref.speed)
      expect(json.currentOrder).toBe(ref.currentOrder)
      expect(json.fuelState).toBe(ref.fuelState)
      // shipIds must be derived from nested ships in the same order
      expect(json.shipIds).toEqual(ref.shipIds)
    }
  })

  it('produces the same squadrons as the TS reference', () => {
    const def = loadMidwayDef()
    const scenario = scenarioFromDefinition(def)

    const refSqs = MIDWAY.forces.flatMap(f => f.squadrons).sort((a, b) => a.id.localeCompare(b.id))
    const jsonSqs = scenario.forces.flatMap(f => f.squadrons).sort((a, b) => a.id.localeCompare(b.id))

    expect(jsonSqs.length).toBe(refSqs.length)
    for (let i = 0; i < refSqs.length; i++) {
      const ref = refSqs[i]
      const json = jsonSqs[i]
      expect(json.id).toBe(ref.id)
      expect(json.aircraftTypeId).toBe(ref.aircraftTypeId)
      expect(json.side).toBe(ref.side)
      expect(json.taskGroupId).toBe(ref.taskGroupId)
      expect(json.aircraftCount).toBe(ref.aircraftCount)
      expect(json.maxAircraftCount).toBe(ref.maxAircraftCount)
      expect(json.pilotExperience).toBe(ref.pilotExperience)
    }
  })

  it('exposes alliedFuelPool and japaneseFuelPool from the JSON', () => {
    const def = loadMidwayDef()
    const scenario = scenarioFromDefinition(def)
    expect(typeof scenario.alliedFuelPool).toBe('number')
    expect(typeof scenario.japaneseFuelPool).toBe('number')
    expect(scenario.alliedFuelPool).toBeGreaterThan(0)
    expect(scenario.japaneseFuelPool).toBeGreaterThan(0)
  })

  it('editing aircraftCount in the definition changes the in-game squadron size', () => {
    const def = loadMidwayDef()
    // Mutate VF-6's count in TF-16
    const tf16 = def.forces[0].taskGroups[0]
    const vf6Def = tf16.squadrons.find(s => s.id === 'vf-6')!
    vf6Def.aircraftCount = 10

    const scenario = scenarioFromDefinition(def)
    const vf6 = scenario.forces.flatMap(f => f.squadrons).find(s => s.id === 'vf-6')!
    expect(vf6.aircraftCount).toBe(10)
    // maxAircraftCount also defaults to the new value when not explicitly set
    expect(vf6.maxAircraftCount).toBe(10)
  })

  it('uses explicit maxAircraftCount when provided', () => {
    const def = loadMidwayDef()
    const tf16 = def.forces[0].taskGroups[0]
    const vf6Def = tf16.squadrons.find(s => s.id === 'vf-6')!
    vf6Def.aircraftCount = 15
    vf6Def.maxAircraftCount = 27 // cap stays at full complement

    const scenario = scenarioFromDefinition(def)
    const vf6 = scenario.forces.flatMap(f => f.squadrons).find(s => s.id === 'vf-6')!
    expect(vf6.aircraftCount).toBe(15)
    expect(vf6.maxAircraftCount).toBe(27)
  })
})

// ── fetchManifest ──────────────────────────────────────────────────────────

describe('fetchManifest', () => {
  it('returns at least one entry', async () => {
    const raw = loadManifestRaw()
    mockFetch({ '/scenarios/manifest.json': raw })
    const manifest = await fetchManifest()
    expect(Array.isArray(manifest)).toBe(true)
    expect(manifest.length).toBeGreaterThanOrEqual(1)
  })

  it('each entry has id, name, difficulty, durationHours', async () => {
    const raw = loadManifestRaw()
    mockFetch({ '/scenarios/manifest.json': raw })
    const manifest = await fetchManifest()
    for (const entry of manifest) {
      expect(entry).toHaveProperty('id')
      expect(entry).toHaveProperty('name')
      expect(entry).toHaveProperty('difficulty')
      expect(entry).toHaveProperty('durationHours')
    }
  })

  it('rejects when the fetch fails', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500 }))
    await expect(fetchManifest()).rejects.toThrow('500')
  })
})

// ── fetchScenario ──────────────────────────────────────────────────────────

describe('fetchScenario', () => {
  it('resolves with a full Scenario for a known id', async () => {
    const def = loadMidwayDef()
    mockFetch({ '/scenarios/midway.json': def })
    const scenario = await fetchScenario('midway')
    expect(scenario.id).toBe('midway')
    expect(scenario.forces.length).toBeGreaterThan(0)
    expect(scenario.shipClasses.length).toBeGreaterThan(0)
    expect(scenario.aircraftTypes.length).toBeGreaterThan(0)
  })

  it('rejects gracefully for a missing scenario id', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 }))
    await expect(fetchScenario('nonexistent')).rejects.toThrow('nonexistent')
  })
})
