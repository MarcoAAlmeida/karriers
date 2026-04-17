import type { HexCoord } from './map'
import type { Side } from './ships'
import type { GameTime } from './scenario'

export type ContactType
  = | 'carrier-force'
    | 'battleship-force'
    | 'surface-force'
    | 'submarine'
    | 'transport-convoy'
    | 'unknown-warships'
    | 'unknown'

export interface SightingReport {
  id: string
  reportedAt: GameTime
  reportedBy: Side
  detectedBy: 'aircraft' | 'submarine' | 'surface-radar' | 'coastwatcher'
  contactHex: HexCoord
  reportedContactType: ContactType // may differ from actual (fog of war)
  actualTaskGroupId?: string // resolved after game or on confirm
  estimatedCourse?: number // degrees, may be inaccurate
  estimatedSpeed?: number // knots, may be inaccurate
  confidence: number // 0–100
  isFalseReport: boolean
}

export interface ContactRecord {
  id: string
  forSide: Side
  lastKnownHex: HexCoord
  lastSeenAt: GameTime
  contactType: ContactType
  estimatedCourse?: number
  estimatedSpeed?: number
  isActive: boolean // false once contact older than 4 hours without resighting
  confirmedTaskGroupId?: string
  sightingIds: string[]
}

export type GameEvent
  = | { type: 'sighting-detected', report: SightingReport }
    | { type: 'contact-lost', contactId: string, lastKnown: HexCoord }
    | { type: 'contact-confirmed', contactId: string, taskGroupId: string }
    | { type: 'false-report', reportId: string }
