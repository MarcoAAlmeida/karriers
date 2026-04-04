import type { AircraftType } from '../types'

export const AIRCRAFT_TYPES: AircraftType[] = [
  // ── ALLIED FIGHTERS ───────────────────────────────────────────────────────
  {
    id: 1,
    name: 'F4F Wildcat',
    side: 'allied',
    role: 'fighter',
    maxRange: 845,
    cruiseSpeed: 155,
    maxSpeed: 332,
    climbRate: 1950,
    bombLoad: 0,
    torpedoCapable: false,
    aaRating: 65,
    bombingAccuracy: 0,
    experienceModifiers: { ace: 1.5, veteran: 1.2, trained: 1.0, green: 0.7 }
  },
  {
    id: 2,
    name: 'F6F Hellcat',
    side: 'allied',
    role: 'fighter',
    maxRange: 1090,
    cruiseSpeed: 168,
    maxSpeed: 376,
    climbRate: 3240,
    bombLoad: 2000,
    torpedoCapable: false,
    aaRating: 85,
    bombingAccuracy: 30,
    experienceModifiers: { ace: 1.4, veteran: 1.2, trained: 1.0, green: 0.75 }
  },
  {
    id: 3,
    name: 'F4U Corsair',
    side: 'allied',
    role: 'fighter',
    maxRange: 1005,
    cruiseSpeed: 182,
    maxSpeed: 417,
    climbRate: 2890,
    bombLoad: 2000,
    torpedoCapable: false,
    aaRating: 88,
    bombingAccuracy: 35,
    experienceModifiers: { ace: 1.4, veteran: 1.2, trained: 1.0, green: 0.7 }
  },

  // ── ALLIED DIVE BOMBERS ───────────────────────────────────────────────────
  {
    id: 10,
    name: 'SBD Dauntless',
    side: 'allied',
    role: 'dive-bomber',
    maxRange: 1115,
    cruiseSpeed: 130,
    maxSpeed: 255,
    climbRate: 1700,
    bombLoad: 1200,
    torpedoCapable: false,
    aaRating: 15,
    bombingAccuracy: 72,
    experienceModifiers: { ace: 1.4, veteran: 1.2, trained: 1.0, green: 0.65 }
  },
  {
    id: 11,
    name: 'SB2C Helldiver',
    side: 'allied',
    role: 'dive-bomber',
    maxRange: 1165,
    cruiseSpeed: 158,
    maxSpeed: 295,
    climbRate: 1800,
    bombLoad: 1000,
    torpedoCapable: false,
    aaRating: 18,
    bombingAccuracy: 68,
    experienceModifiers: { ace: 1.3, veteran: 1.1, trained: 1.0, green: 0.7 }
  },

  // ── ALLIED TORPEDO BOMBERS ────────────────────────────────────────────────
  {
    id: 15,
    name: 'TBD Devastator',
    side: 'allied',
    role: 'torpedo-bomber',
    maxRange: 700,
    cruiseSpeed: 100,
    maxSpeed: 206,
    climbRate: 720,
    bombLoad: 1500,
    torpedoCapable: true,
    aaRating: 10,
    bombingAccuracy: 45,
    experienceModifiers: { ace: 1.3, veteran: 1.1, trained: 1.0, green: 0.6 }
  },
  {
    id: 16,
    name: 'TBF Avenger',
    side: 'allied',
    role: 'torpedo-bomber',
    maxRange: 1000,
    cruiseSpeed: 145,
    maxSpeed: 275,
    climbRate: 2600,
    bombLoad: 2000,
    torpedoCapable: true,
    aaRating: 20,
    bombingAccuracy: 55,
    experienceModifiers: { ace: 1.4, veteran: 1.2, trained: 1.0, green: 0.65 }
  },

  // ── ALLIED PATROL / SCOUT ─────────────────────────────────────────────────
  {
    id: 20,
    name: 'PBY Catalina',
    side: 'allied',
    role: 'patrol-bomber',
    maxRange: 2520,
    cruiseSpeed: 117,
    maxSpeed: 196,
    climbRate: 620,
    bombLoad: 4000,
    torpedoCapable: false,
    aaRating: 5,
    bombingAccuracy: 35,
    experienceModifiers: { ace: 1.2, veteran: 1.1, trained: 1.0, green: 0.8 }
  },
  {
    id: 21,
    name: 'OS2U Kingfisher',
    side: 'allied',
    role: 'scout',
    maxRange: 805,
    cruiseSpeed: 119,
    maxSpeed: 164,
    climbRate: 880,
    bombLoad: 650,
    torpedoCapable: false,
    aaRating: 8,
    bombingAccuracy: 30,
    experienceModifiers: { ace: 1.2, veteran: 1.1, trained: 1.0, green: 0.8 }
  },

  // ── JAPANESE FIGHTERS ─────────────────────────────────────────────────────
  {
    id: 30,
    name: 'A6M Zero',
    side: 'japanese',
    role: 'fighter',
    maxRange: 1930,
    cruiseSpeed: 160,
    maxSpeed: 331,
    climbRate: 2440,
    bombLoad: 264,
    torpedoCapable: false,
    aaRating: 82,
    bombingAccuracy: 20,
    experienceModifiers: { ace: 1.6, veteran: 1.3, trained: 1.0, green: 0.65 }
  },
  {
    id: 31,
    name: 'N1K Shiden (George)',
    side: 'japanese',
    role: 'fighter',
    maxRange: 890,
    cruiseSpeed: 210,
    maxSpeed: 369,
    climbRate: 3300,
    bombLoad: 1100,
    torpedoCapable: false,
    aaRating: 80,
    bombingAccuracy: 25,
    experienceModifiers: { ace: 1.4, veteran: 1.2, trained: 1.0, green: 0.7 }
  },

  // ── JAPANESE DIVE BOMBERS ─────────────────────────────────────────────────
  {
    id: 35,
    name: 'D3A Val',
    side: 'japanese',
    role: 'dive-bomber',
    maxRange: 840,
    cruiseSpeed: 184,
    maxSpeed: 240,
    climbRate: 1500,
    bombLoad: 816,
    torpedoCapable: false,
    aaRating: 12,
    bombingAccuracy: 70,
    experienceModifiers: { ace: 1.5, veteran: 1.2, trained: 1.0, green: 0.60 }
  },
  {
    id: 36,
    name: 'D4Y Suisei (Judy)',
    side: 'japanese',
    role: 'dive-bomber',
    maxRange: 978,
    cruiseSpeed: 265,
    maxSpeed: 360,
    climbRate: 3100,
    bombLoad: 1100,
    torpedoCapable: false,
    aaRating: 15,
    bombingAccuracy: 65,
    experienceModifiers: { ace: 1.4, veteran: 1.2, trained: 1.0, green: 0.65 }
  },

  // ── JAPANESE TORPEDO BOMBERS ──────────────────────────────────────────────
  {
    id: 40,
    name: 'B5N Kate',
    side: 'japanese',
    role: 'torpedo-bomber',
    maxRange: 1237,
    cruiseSpeed: 161,
    maxSpeed: 235,
    climbRate: 1200,
    bombLoad: 1764,
    torpedoCapable: true,
    aaRating: 10,
    bombingAccuracy: 65,
    experienceModifiers: { ace: 1.5, veteran: 1.2, trained: 1.0, green: 0.6 }
  },
  {
    id: 41,
    name: 'B6N Tenzan (Jill)',
    side: 'japanese',
    role: 'torpedo-bomber',
    maxRange: 1892,
    cruiseSpeed: 180,
    maxSpeed: 299,
    climbRate: 1800,
    bombLoad: 1764,
    torpedoCapable: true,
    aaRating: 12,
    bombingAccuracy: 60,
    experienceModifiers: { ace: 1.4, veteran: 1.2, trained: 1.0, green: 0.65 }
  },

  // ── JAPANESE PATROL / SCOUT ───────────────────────────────────────────────
  {
    id: 45,
    name: 'H8K Emily',
    side: 'japanese',
    role: 'patrol-bomber',
    maxRange: 4460,
    cruiseSpeed: 193,
    maxSpeed: 290,
    climbRate: 1476,
    bombLoad: 4400,
    torpedoCapable: false,
    aaRating: 20,
    bombingAccuracy: 30,
    experienceModifiers: { ace: 1.3, veteran: 1.1, trained: 1.0, green: 0.75 }
  },
  {
    id: 46,
    name: 'E13A Jake',
    side: 'japanese',
    role: 'scout',
    maxRange: 1298,
    cruiseSpeed: 138,
    maxSpeed: 234,
    climbRate: 1180,
    bombLoad: 551,
    torpedoCapable: false,
    aaRating: 6,
    bombingAccuracy: 25,
    experienceModifiers: { ace: 1.3, veteran: 1.1, trained: 1.0, green: 0.75 }
  }
]

export function getAircraftType(id: number): AircraftType | undefined {
  return AIRCRAFT_TYPES.find(at => at.id === id)
}
