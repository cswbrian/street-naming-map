export const HISTORICAL_MAP_SOURCE_ID = 'historical-map-source'
export const HISTORICAL_MAP_LAYER_ID = 'historical-map-layer'

const ROADS_LAYER_BEFORE = 'hk-roads-layer'

/**
 * @param {import('./historicalMapTypes.js').HistoricalMapManifestEntry | null | undefined} entry
 * @param {number} opacity 0–1
 */
export function applyHistoricalMapLayer(map, entry, opacity) {
  if (!map?.isStyleLoaded?.()) return

  if (map.getLayer(HISTORICAL_MAP_LAYER_ID)) {
    map.removeLayer(HISTORICAL_MAP_LAYER_ID)
  }
  if (map.getSource(HISTORICAL_MAP_SOURCE_ID)) {
    map.removeSource(HISTORICAL_MAP_SOURCE_ID)
  }

  if (!entry?.tileUrlTemplate) return

  const baseUrl = import.meta.env.BASE_URL
  const tileUrl = `${baseUrl}${entry.tileUrlTemplate.replace(/^\//, '')}`

  map.addSource(HISTORICAL_MAP_SOURCE_ID, {
    type: 'raster',
    tiles: [tileUrl],
    tileSize: 256,
    minzoom: entry.minZoom,
    maxzoom: entry.maxZoom,
    bounds: [
      entry.bounds[0][0],
      entry.bounds[0][1],
      entry.bounds[1][0],
      entry.bounds[1][1],
    ],
  })

  const beforeId = map.getLayer(ROADS_LAYER_BEFORE) ? ROADS_LAYER_BEFORE : undefined

  map.addLayer(
    {
      id: HISTORICAL_MAP_LAYER_ID,
      type: 'raster',
      source: HISTORICAL_MAP_SOURCE_ID,
      minzoom: 9,
      maxzoom: 20,
      paint: {
        'raster-opacity': opacity,
        'raster-fade-duration': 0,
      },
    },
    beforeId,
  )
}

/**
 * @param {import('maplibre-gl').Map} map
 * @param {number} opacity
 */
export function setHistoricalMapOpacity(map, opacity) {
  if (!map?.getLayer(HISTORICAL_MAP_LAYER_ID)) return
  map.setPaintProperty(HISTORICAL_MAP_LAYER_ID, 'raster-opacity', opacity)
}
