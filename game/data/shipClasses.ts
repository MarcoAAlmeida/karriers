import type { ShipClass } from '../types'

export const SHIP_CLASSES: ShipClass[] = [
  // ── ALLIED CARRIERS ──────────────────────────────────────────────────────
  {
    id: 1,
    name: 'Yorktown (CV-5 class)',
    type: 'fleet-carrier',
    side: 'allied',
    displacement: 19900,
    maxSpeed: 32,
    aaStrength: 55,
    armorRating: 30,
    hullPoints: 80,
    damageControlRating: 70,
    flightDeckCapacity: 18,
    hangarCapacity: 90
  },
  {
    id: 2,
    name: 'Essex (CV-9 class)',
    type: 'fleet-carrier',
    side: 'allied',
    displacement: 27100,
    maxSpeed: 33,
    aaStrength: 80,
    armorRating: 35,
    hullPoints: 95,
    damageControlRating: 80,
    flightDeckCapacity: 20,
    hangarCapacity: 100
  },
  {
    id: 3,
    name: 'Lexington (CV-2 class)',
    type: 'fleet-carrier',
    side: 'allied',
    displacement: 33000,
    maxSpeed: 33,
    aaStrength: 45,
    armorRating: 25,
    hullPoints: 90,
    damageControlRating: 65,
    flightDeckCapacity: 18,
    hangarCapacity: 78
  },
  {
    id: 4,
    name: 'Independence (CVL-22 class)',
    type: 'light-carrier',
    side: 'allied',
    displacement: 11000,
    maxSpeed: 31,
    aaStrength: 60,
    armorRating: 20,
    hullPoints: 55,
    damageControlRating: 65,
    flightDeckCapacity: 12,
    hangarCapacity: 45
  },
  {
    id: 5,
    name: 'Casablanca (CVE class)',
    type: 'escort-carrier',
    side: 'allied',
    displacement: 7800,
    maxSpeed: 19,
    aaStrength: 35,
    armorRating: 10,
    hullPoints: 35,
    damageControlRating: 50,
    flightDeckCapacity: 8,
    hangarCapacity: 28
  },

  // ── ALLIED BATTLESHIPS & CRUISERS ─────────────────────────────────────────
  {
    id: 6,
    name: 'Iowa (BB-61 class)',
    type: 'battleship',
    side: 'allied',
    displacement: 45000,
    maxSpeed: 33,
    aaStrength: 90,
    armorRating: 90,
    hullPoints: 100,
    damageControlRating: 85
  },
  {
    id: 7,
    name: 'South Dakota (BB-57 class)',
    type: 'battleship',
    side: 'allied',
    displacement: 35000,
    maxSpeed: 27,
    aaStrength: 85,
    armorRating: 85,
    hullPoints: 95,
    damageControlRating: 80
  },
  {
    id: 8,
    name: 'New Orleans (CA-32 class)',
    type: 'heavy-cruiser',
    side: 'allied',
    displacement: 9950,
    maxSpeed: 32,
    aaStrength: 50,
    armorRating: 50,
    hullPoints: 55,
    damageControlRating: 65
  },
  {
    id: 9,
    name: 'Atlanta (CL-51 class)',
    type: 'light-cruiser',
    side: 'allied',
    displacement: 6000,
    maxSpeed: 33,
    aaStrength: 75,
    armorRating: 35,
    hullPoints: 45,
    damageControlRating: 60
  },
  {
    id: 10,
    name: 'Fletcher (DD-445 class)',
    type: 'destroyer',
    side: 'allied',
    displacement: 2100,
    maxSpeed: 36,
    aaStrength: 40,
    armorRating: 15,
    hullPoints: 25,
    damageControlRating: 55
  },
  {
    id: 11,
    name: 'Gato (SS-212 class)',
    type: 'submarine',
    side: 'allied',
    displacement: 1525,
    maxSpeed: 20,
    aaStrength: 10,
    armorRating: 5,
    hullPoints: 30,
    damageControlRating: 60
  },

  // ── JAPANESE CARRIERS ─────────────────────────────────────────────────────
  {
    id: 20,
    name: 'Shokaku class',
    type: 'fleet-carrier',
    side: 'japanese',
    displacement: 25675,
    maxSpeed: 34,
    aaStrength: 50,
    armorRating: 30,
    hullPoints: 85,
    damageControlRating: 60,
    flightDeckCapacity: 18,
    hangarCapacity: 84
  },
  {
    id: 21,
    name: 'Kaga',
    type: 'fleet-carrier',
    side: 'japanese',
    displacement: 38200,
    maxSpeed: 28,
    aaStrength: 40,
    armorRating: 25,
    hullPoints: 88,
    damageControlRating: 55,
    flightDeckCapacity: 18,
    hangarCapacity: 90
  },
  {
    id: 22,
    name: 'Akagi',
    type: 'fleet-carrier',
    side: 'japanese',
    displacement: 36500,
    maxSpeed: 31,
    aaStrength: 40,
    armorRating: 25,
    hullPoints: 88,
    damageControlRating: 55,
    flightDeckCapacity: 18,
    hangarCapacity: 91
  },
  {
    id: 23,
    name: 'Hiryu class',
    type: 'fleet-carrier',
    side: 'japanese',
    displacement: 17300,
    maxSpeed: 34,
    aaStrength: 45,
    armorRating: 20,
    hullPoints: 70,
    damageControlRating: 58,
    flightDeckCapacity: 16,
    hangarCapacity: 73
  },
  {
    id: 24,
    name: 'Zuiho class',
    type: 'light-carrier',
    side: 'japanese',
    displacement: 11200,
    maxSpeed: 28,
    aaStrength: 35,
    armorRating: 15,
    hullPoints: 50,
    damageControlRating: 50,
    flightDeckCapacity: 10,
    hangarCapacity: 30
  },

  // ── JAPANESE BATTLESHIPS & CRUISERS ──────────────────────────────────────
  {
    id: 25,
    name: 'Yamato class',
    type: 'battleship',
    side: 'japanese',
    displacement: 65000,
    maxSpeed: 27,
    aaStrength: 70,
    armorRating: 95,
    hullPoints: 100,
    damageControlRating: 75
  },
  {
    id: 26,
    name: 'Nagato class',
    type: 'battleship',
    side: 'japanese',
    displacement: 39000,
    maxSpeed: 25,
    aaStrength: 55,
    armorRating: 80,
    hullPoints: 90,
    damageControlRating: 70
  },
  {
    id: 27,
    name: 'Tone class',
    type: 'heavy-cruiser',
    side: 'japanese',
    displacement: 11215,
    maxSpeed: 35,
    aaStrength: 45,
    armorRating: 50,
    hullPoints: 60,
    damageControlRating: 60
  },
  {
    id: 28,
    name: 'Mogami class',
    type: 'heavy-cruiser',
    side: 'japanese',
    displacement: 13000,
    maxSpeed: 35,
    aaStrength: 45,
    armorRating: 52,
    hullPoints: 62,
    damageControlRating: 60
  },
  {
    id: 29,
    name: 'Agano class',
    type: 'light-cruiser',
    side: 'japanese',
    displacement: 6652,
    maxSpeed: 35,
    aaStrength: 40,
    armorRating: 30,
    hullPoints: 42,
    damageControlRating: 55
  },
  {
    id: 30,
    name: 'Fubuki class',
    type: 'destroyer',
    side: 'japanese',
    displacement: 1750,
    maxSpeed: 38,
    aaStrength: 25,
    armorRating: 12,
    hullPoints: 22,
    damageControlRating: 50
  },
  {
    id: 31,
    name: 'Kagero class',
    type: 'destroyer',
    side: 'japanese',
    displacement: 2000,
    maxSpeed: 35,
    aaStrength: 28,
    armorRating: 12,
    hullPoints: 24,
    damageControlRating: 50
  },
  {
    id: 32,
    name: 'I-class submarine',
    type: 'submarine',
    side: 'japanese',
    displacement: 2198,
    maxSpeed: 23,
    aaStrength: 8,
    armorRating: 5,
    hullPoints: 30,
    damageControlRating: 55
  },

  // ── SUPPORT ───────────────────────────────────────────────────────────────
  {
    id: 40,
    name: 'Cimarron (AO class)',
    type: 'oiler',
    side: 'allied',
    displacement: 25425,
    maxSpeed: 18,
    aaStrength: 15,
    armorRating: 5,
    hullPoints: 40,
    damageControlRating: 40
  },
  {
    id: 41,
    name: 'Transport (AP/AK)',
    type: 'transport',
    side: 'allied',
    displacement: 14000,
    maxSpeed: 15,
    aaStrength: 10,
    armorRating: 5,
    hullPoints: 35,
    damageControlRating: 35
  },
  {
    id: 42,
    name: 'Kamoi (IJN Oiler)',
    type: 'oiler',
    side: 'japanese',
    displacement: 17000,
    maxSpeed: 15,
    aaStrength: 10,
    armorRating: 5,
    hullPoints: 38,
    damageControlRating: 38
  }
]

export function getShipClass(id: number): ShipClass | undefined {
  return SHIP_CLASSES.find(sc => sc.id === id)
}
