/**
 * Battle of Midway — June 4–7, 1942
 *
 * Map origin: NW Pacific, flat-top hex grid 72×84 at 20 NM/hex
 * Key positions (approximate, June 4 0600 local):
 *   Midway Atoll:    q=35, r=55
 *   US TF-16:        q=43, r=49  (~170 NM NE of Midway)
 *   US TF-17:        q=44, r=50  (~160 NM NE of Midway)
 *   IJN Kido Butai:  q=27, r=51  (~170 NM NW of Midway)
 *   IJN Invasion:    q=20, r=62  (~300 NM SW of Midway)
 */

import type { Scenario, ScenarioForce } from '../../types/scenario'
import type { Ship, TaskGroup } from '../../types/ships'
import type { Squadron } from '../../types/aircraft'
import { SHIP_CLASSES } from '../shipClasses'
import { AIRCRAFT_TYPES } from '../aircraftTypes'

// ── Ship IDs (stable references used in taskGroup.shipIds) ─────────────────

// Allied - TF-16 (Enterprise + Hornet)
const USS_ENTERPRISE = 'cv-enterprise'
const USS_HORNET = 'cv-hornet'
const USS_NORTHAMPTON = 'ca-northampton'
const USS_PENSACOLA = 'ca-pensacola'
const USS_VINCENNES = 'cl-vincennes'
const USS_DD_TF16_1 = 'dd-balch'
const USS_DD_TF16_2 = 'dd-conyngham'
const USS_DD_TF16_3 = 'dd-benham'
const USS_DD_TF16_4 = 'dd-ellet'
const USS_DD_TF16_5 = 'dd-maury'
const USS_DD_TF16_6 = 'dd-phelps'

// Allied - TF-17 (Yorktown)
const USS_YORKTOWN = 'cv-yorktown'
const USS_ASTORIA = 'ca-astoria'
const USS_PORTLAND = 'ca-portland'
const USS_DD_TF17_1 = 'dd-hammann'
const USS_DD_TF17_2 = 'dd-hughes'
const USS_DD_TF17_3 = 'dd-morris'
const USS_DD_TF17_4 = 'dd-anderson'
const USS_DD_TF17_5 = 'dd-russell'
const USS_DD_TF17_6 = 'dd-gwin'

// IJN - Kido Butai (First Carrier Strike Force)
const IJN_AKAGI = 'cv-akagi'
const IJN_KAGA = 'cv-kaga'
const IJN_SORYU = 'cv-soryu'
const IJN_HIRYU = 'cv-hiryu'
const IJN_HARUNA = 'bb-haruna'
const IJN_KIRISHIMA = 'bb-kirishima'
const IJN_TONE = 'ca-tone'
const IJN_CHIKUMA = 'ca-chikuma'
const IJN_DD_KB_1 = 'dd-nowaki'
const IJN_DD_KB_2 = 'dd-arashi'
const IJN_DD_KB_3 = 'dd-hagikaze'
const IJN_DD_KB_4 = 'dd-maikaze'
const IJN_DD_KB_5 = 'dd-kazagumo'
const IJN_DD_KB_6 = 'dd-yugumo'

// IJN - Invasion Force
const IJN_KUMANO = 'ca-kumano'
const IJN_SUZUYA = 'ca-suzuya'
const IJN_MIKUMA = 'ca-mikuma'
const IJN_MOGAMI = 'ca-mogami'
const IJN_DD_INV_1 = 'dd-asashio'
const IJN_DD_INV_2 = 'dd-arashio'

// ── Ships ─────────────────────────────────────────────────────────────────

function makeShip(id: string, classId: number, name: string, side: 'allied' | 'japanese', taskGroupId: string): Ship {
  return {
    id,
    classId,
    name,
    side,
    taskGroupId,
    hullDamage: 0,
    fires: 0,
    floodingRisk: 0,
    fuelLevel: 85,
    ammoLevel: 90,
    damageControlEfficiency: 100,
    status: 'operational'
  }
}

const alliedShipsTF16: Ship[] = [
  makeShip(USS_ENTERPRISE, 1, 'USS Enterprise (CV-6)', 'allied', 'tf-16'),
  makeShip(USS_HORNET, 1, 'USS Hornet (CV-8)', 'allied', 'tf-16'),
  makeShip(USS_NORTHAMPTON, 8, 'USS Northampton (CA-26)', 'allied', 'tf-16'),
  makeShip(USS_PENSACOLA, 8, 'USS Pensacola (CA-24)', 'allied', 'tf-16'),
  makeShip(USS_VINCENNES, 9, 'USS Atlanta (CL-51)', 'allied', 'tf-16'),
  makeShip(USS_DD_TF16_1, 10, 'USS Balch (DD-363)', 'allied', 'tf-16'),
  makeShip(USS_DD_TF16_2, 10, 'USS Conyngham (DD-371)', 'allied', 'tf-16'),
  makeShip(USS_DD_TF16_3, 10, 'USS Benham (DD-397)', 'allied', 'tf-16'),
  makeShip(USS_DD_TF16_4, 10, 'USS Ellet (DD-398)', 'allied', 'tf-16'),
  makeShip(USS_DD_TF16_5, 10, 'USS Maury (DD-401)', 'allied', 'tf-16'),
  makeShip(USS_DD_TF16_6, 10, 'USS Phelps (DD-360)', 'allied', 'tf-16')
]

const alliedShipsTF17: Ship[] = [
  makeShip(USS_YORKTOWN, 1, 'USS Yorktown (CV-5)', 'allied', 'tf-17'),
  makeShip(USS_ASTORIA, 8, 'USS Astoria (CA-34)', 'allied', 'tf-17'),
  makeShip(USS_PORTLAND, 8, 'USS Portland (CA-33)', 'allied', 'tf-17'),
  makeShip(USS_DD_TF17_1, 10, 'USS Hammann (DD-412)', 'allied', 'tf-17'),
  makeShip(USS_DD_TF17_2, 10, 'USS Hughes (DD-410)', 'allied', 'tf-17'),
  makeShip(USS_DD_TF17_3, 10, 'USS Morris (DD-417)', 'allied', 'tf-17'),
  makeShip(USS_DD_TF17_4, 10, 'USS Anderson (DD-411)', 'allied', 'tf-17'),
  makeShip(USS_DD_TF17_5, 10, 'USS Russell (DD-414)', 'allied', 'tf-17'),
  makeShip(USS_DD_TF17_6, 10, 'USS Gwin (DD-433)', 'allied', 'tf-17')
]

const japaneseShipsKB: Ship[] = [
  makeShip(IJN_AKAGI, 22, 'Akagi', 'japanese', 'kido-butai'),
  makeShip(IJN_KAGA, 21, 'Kaga', 'japanese', 'kido-butai'),
  makeShip(IJN_SORYU, 23, 'Soryu', 'japanese', 'kido-butai'),
  makeShip(IJN_HIRYU, 23, 'Hiryu', 'japanese', 'kido-butai'),
  makeShip(IJN_HARUNA, 26, 'Haruna', 'japanese', 'kido-butai'),
  makeShip(IJN_KIRISHIMA, 26, 'Kirishima', 'japanese', 'kido-butai'),
  makeShip(IJN_TONE, 27, 'Tone', 'japanese', 'kido-butai'),
  makeShip(IJN_CHIKUMA, 27, 'Chikuma', 'japanese', 'kido-butai'),
  makeShip(IJN_DD_KB_1, 30, 'Nowaki', 'japanese', 'kido-butai'),
  makeShip(IJN_DD_KB_2, 30, 'Arashi', 'japanese', 'kido-butai'),
  makeShip(IJN_DD_KB_3, 30, 'Hagikaze', 'japanese', 'kido-butai'),
  makeShip(IJN_DD_KB_4, 30, 'Maikaze', 'japanese', 'kido-butai'),
  makeShip(IJN_DD_KB_5, 31, 'Kazagumo', 'japanese', 'kido-butai'),
  makeShip(IJN_DD_KB_6, 31, 'Yugumo', 'japanese', 'kido-butai')
]

const japaneseShipsInvasion: Ship[] = [
  makeShip(IJN_KUMANO, 28, 'Kumano', 'japanese', 'invasion-force'),
  makeShip(IJN_SUZUYA, 28, 'Suzuya', 'japanese', 'invasion-force'),
  makeShip(IJN_MIKUMA, 28, 'Mikuma', 'japanese', 'invasion-force'),
  makeShip(IJN_MOGAMI, 28, 'Mogami', 'japanese', 'invasion-force'),
  makeShip(IJN_DD_INV_1, 30, 'Asashio', 'japanese', 'invasion-force'),
  makeShip(IJN_DD_INV_2, 30, 'Arashio', 'japanese', 'invasion-force')
]

// ── Task Groups ────────────────────────────────────────────────────────────

const taskGroups: TaskGroup[] = [
  {
    id: 'tf-16',
    name: 'Task Force 16',
    side: 'allied',
    flagshipId: USS_ENTERPRISE,
    shipIds: alliedShipsTF16.map(s => s.id),
    position: { q: 43, r: 49 },
    course: 220,
    speed: 15,
    currentOrder: 'search',
    fuelState: 85
  },
  {
    id: 'tf-17',
    name: 'Task Force 17',
    side: 'allied',
    flagshipId: USS_YORKTOWN,
    shipIds: alliedShipsTF17.map(s => s.id),
    position: { q: 44, r: 50 },
    course: 215,
    speed: 15,
    currentOrder: 'search',
    fuelState: 80
  },
  {
    id: 'kido-butai',
    name: 'Kido Butai (1st Carrier Strike Force)',
    side: 'japanese',
    flagshipId: IJN_AKAGI,
    shipIds: japaneseShipsKB.map(s => s.id),
    position: { q: 27, r: 51 },
    course: 135,
    speed: 25,
    destination: { q: 35, r: 55 },
    currentOrder: 'strike',
    strikeTargetHex: { q: 35, r: 55 },
    fuelState: 75
  },
  {
    id: 'invasion-force',
    name: 'Midway Invasion Force',
    side: 'japanese',
    flagshipId: IJN_KUMANO,
    shipIds: japaneseShipsInvasion.map(s => s.id),
    position: { q: 20, r: 62 },
    course: 90,
    speed: 14,
    destination: { q: 35, r: 55 },
    currentOrder: 'patrol',
    fuelState: 90
  }
]

// ── Squadrons ──────────────────────────────────────────────────────────────

function makeSquadron(
  id: string,
  name: string,
  aircraftTypeId: number,
  side: 'allied' | 'japanese',
  taskGroupId: string,
  count: number,
  maxCount: number,
  experience: 'ace' | 'veteran' | 'trained' | 'green'
): Squadron {
  return {
    id,
    aircraftTypeId,
    name,
    side,
    taskGroupId,
    aircraftCount: count,
    maxAircraftCount: maxCount,
    pilotExperience: experience,
    deckStatus: 'hangared',
    fuelLoad: 100,
    ordnanceLoaded: 'none'
  }
}

const alliedSquadrons: Squadron[] = [
  // Enterprise (CV-6)
  makeSquadron('vf-6', 'VF-6 (Fighting Six)', 1, 'allied', 'tf-16', 27, 27, 'veteran'),
  makeSquadron('vb-6', 'VB-6 (Bombing Six)', 10, 'allied', 'tf-16', 19, 19, 'veteran'),
  makeSquadron('vs-6', 'VS-6 (Scouting Six)', 10, 'allied', 'tf-16', 19, 19, 'trained'),
  makeSquadron('vt-6', 'VT-6 (Torpedo Six)', 15, 'allied', 'tf-16', 14, 14, 'trained'),

  // Hornet (CV-8)
  makeSquadron('vf-8', 'VF-8 (Fighting Eight)', 1, 'allied', 'tf-16', 27, 27, 'trained'),
  makeSquadron('vb-8', 'VB-8 (Bombing Eight)', 10, 'allied', 'tf-16', 35, 35, 'trained'),
  makeSquadron('vt-8', 'VT-8 (Torpedo Eight)', 15, 'allied', 'tf-16', 15, 15, 'green'),

  // TF-16 patrol aircraft — PBY Catalinas detached from VP-44 (long-range search)
  makeSquadron('vp-44', 'VP-44 Catalinas', 20, 'allied', 'tf-16', 4, 4, 'trained'),

  // TF-16 cruiser floatplanes (New Orleans / Vincennes / Minneapolis carry OS2U Kingfishers)
  makeSquadron('tf16-kingfishers', 'TF-16 Cruiser Floatplanes', 21, 'allied', 'tf-16', 3, 3, 'trained'),

  // Yorktown (CV-5) — just repaired, using borrowed pilots
  makeSquadron('vf-3', 'VF-3 (Fighting Three)', 1, 'allied', 'tf-17', 25, 25, 'veteran'),
  makeSquadron('vb-3', 'VB-3 (Bombing Three)', 10, 'allied', 'tf-17', 18, 18, 'veteran'),
  makeSquadron('vs-5', 'VS-5 (Scouting Five)', 10, 'allied', 'tf-17', 19, 19, 'veteran'),
  makeSquadron('vt-3', 'VT-3 (Torpedo Three)', 16, 'allied', 'tf-17', 12, 12, 'trained'),

  // TF-17 cruiser floatplanes (Astoria / Portland carry OS2U Kingfishers)
  makeSquadron('tf17-kingfishers', 'TF-17 Cruiser Floatplanes', 21, 'allied', 'tf-17', 2, 2, 'trained')
]

const japaneseSquadrons: Squadron[] = [
  // Akagi
  makeSquadron('akagi-f', 'Akagi Zeros', 30, 'japanese', 'kido-butai', 21, 21, 'ace'),
  makeSquadron('akagi-tb', 'Akagi Kates', 40, 'japanese', 'kido-butai', 27, 27, 'ace'),
  makeSquadron('akagi-db', 'Akagi Vals', 35, 'japanese', 'kido-butai', 18, 18, 'ace'),

  // Kaga
  makeSquadron('kaga-f', 'Kaga Zeros', 30, 'japanese', 'kido-butai', 21, 21, 'ace'),
  makeSquadron('kaga-tb', 'Kaga Kates', 40, 'japanese', 'kido-butai', 30, 30, 'ace'),
  makeSquadron('kaga-db', 'Kaga Vals', 35, 'japanese', 'kido-butai', 21, 21, 'ace'),

  // Soryu
  makeSquadron('soryu-f', 'Soryu Zeros', 30, 'japanese', 'kido-butai', 21, 21, 'veteran'),
  makeSquadron('soryu-tb', 'Soryu Kates', 40, 'japanese', 'kido-butai', 18, 18, 'veteran'),
  makeSquadron('soryu-db', 'Soryu Vals', 35, 'japanese', 'kido-butai', 21, 21, 'veteran'),

  // Hiryu
  makeSquadron('hiryu-f', 'Hiryu Zeros', 30, 'japanese', 'kido-butai', 21, 21, 'veteran'),
  makeSquadron('hiryu-tb', 'Hiryu Kates', 40, 'japanese', 'kido-butai', 18, 18, 'veteran'),
  makeSquadron('hiryu-db', 'Hiryu Vals', 35, 'japanese', 'kido-butai', 21, 21, 'veteran'),

  // Cruiser floatplanes (Tone's famous plane 4 was delayed — start hangared)
  makeSquadron('tone-scout', 'Tone #4 Floatplane', 46, 'japanese', 'kido-butai', 1, 1, 'veteran'),
  makeSquadron('chikuma-scout', 'Chikuma Floatplane', 46, 'japanese', 'kido-butai', 1, 1, 'veteran')
]

// ── Allied Force ───────────────────────────────────────────────────────────

const alliedForce: ScenarioForce = {
  side: 'allied',
  ships: [...alliedShipsTF16, ...alliedShipsTF17],
  taskGroups: taskGroups.filter(tg => tg.side === 'allied'),
  squadrons: alliedSquadrons
}

const japaneseForce: ScenarioForce = {
  side: 'japanese',
  ships: [...japaneseShipsKB, ...japaneseShipsInvasion],
  taskGroups: taskGroups.filter(tg => tg.side === 'japanese'),
  squadrons: japaneseSquadrons
}

// ── Scenario ───────────────────────────────────────────────────────────────

export const MIDWAY: Scenario = {
  id: 'midway',
  name: 'Battle of Midway',
  date: 'June 4–7, 1942',
  description: 'The turning point of the Pacific war. Four IJN fleet carriers of the Kido Butai approach Midway Atoll — but US Navy codebreakers have set a trap. Three American carriers wait in ambush NE of Midway.',
  difficulty: 'medium',
  durationHours: 72,

  startTime: { day: 1, hour: 6, minute: 0 },   // June 4, 0600
  endTime: { day: 4, hour: 6, minute: 0 },       // June 7, 0600

  mapBounds: { minQ: 0, maxQ: 71, minR: 0, maxR: 83 },

  weatherZones: [
    {
      // Squall line NW of Midway — historically concealed Kido Butai's approach
      hexes: [
        { q: 18, r: 35 }, { q: 19, r: 35 }, { q: 20, r: 35 }, { q: 21, r: 35 },
        { q: 18, r: 36 }, { q: 19, r: 36 }, { q: 20, r: 36 }, { q: 21, r: 36 },
        { q: 18, r: 37 }, { q: 19, r: 37 }, { q: 20, r: 37 }
      ],
      condition: { visibility: 15, windSpeed: 25, ceiling: 2000, seaState: 4 }
    },
    {
      // Clear weather near Midway and US carrier operating area
      hexes: [
        { q: 35, r: 55 }, { q: 36, r: 55 }, { q: 37, r: 55 },
        { q: 42, r: 48 }, { q: 43, r: 48 }, { q: 44, r: 48 },
        { q: 42, r: 49 }, { q: 43, r: 49 }, { q: 44, r: 49 },
        { q: 43, r: 50 }, { q: 44, r: 50 }, { q: 45, r: 50 }
      ],
      condition: { visibility: 100, windSpeed: 12, ceiling: 8000, seaState: 2 }
    }
  ],

  // Aviation fuel pools — match public/scenarios/midway.json
  alliedFuelPool: 15000,
  japaneseFuelPool: 12000,

  forces: [alliedForce, japaneseForce],

  victoryConditions: [
    {
      id: 'allied-sink-kb',
      type: 'sink-carrier',
      forSide: 'allied',
      description: 'Sink all four Kido Butai fleet carriers (Akagi, Kaga, Soryu, Hiryu)',
      points: 100
    },
    {
      id: 'allied-defend-midway',
      type: 'survive-until',
      forSide: 'allied',
      deadline: { day: 4, hour: 6, minute: 0 },
      description: 'Prevent Japanese capture of Midway Atoll',
      points: 50
    },
    {
      id: 'japanese-sink-carriers',
      type: 'sink-carrier',
      forSide: 'japanese',
      description: 'Sink all three US fleet carriers (Enterprise, Hornet, Yorktown)',
      points: 100
    },
    {
      id: 'japanese-capture-midway',
      type: 'control-hex',
      forSide: 'japanese',
      targetHex: { q: 35, r: 55 },
      deadline: { day: 4, hour: 6, minute: 0 },
      description: 'Occupy Midway Atoll with invasion forces',
      points: 80
    }
  ],

  shipClasses: SHIP_CLASSES,
  aircraftTypes: AIRCRAFT_TYPES
}
