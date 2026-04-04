export type TerrainType = 'deep-sea' | 'shallow' | 'land' | 'atoll'

export interface HexCoord {
  q: number
  r: number
}

export interface GridConfig {
  width: number   // 72 columns
  height: number  // 84 rows
  hexSize: number // pixels, computed from viewport
  orientation: 'flat' | 'pointy'
}

export interface WeatherCondition {
  visibility: number  // nautical miles
  windSpeed: number   // knots
  ceiling: number     // feet — 0 means overcast/no flight ops
  seaState: number    // 0-6 Beaufort scale
}

export interface WeatherZone {
  hexes: HexCoord[]
  condition: WeatherCondition
}

export interface HexCell {
  q: number
  r: number
  terrain: TerrainType
  weatherZoneId?: number
}
