/**
 * MapLibre GL geographic basemap — optional.
 * When NUXT_PUBLIC_MAPTILER_KEY is set, renders a Pacific raster basemap
 * in a div behind the PixiJS canvas. Falls back to PixiJS terrain tiles
 * when no key is configured.
 *
 * Sprint 5: stub only — MapLibre integration deferred until the game is
 * playable and we have a tile key to test with.
 */
export function useMapLibre() {
  // No-op until tile key is available. PixiJS draws terrain instead.
  return {}
}
