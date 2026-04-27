import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import 'maplibre-gl/dist/maplibre-gl.css'

const SOURCE_ID = 'hk-roads-source'
const LAYER_ID = 'hk-roads-layer'
const LABEL_LAYER_ID = 'hk-roads-labels'
const HIGHLIGHT_LAYER_ID = 'hk-road-highlight'
const FOCUS_SOURCE_ID = 'focus-area-source'
const FOCUS_LAYER_ID = 'focus-area-layer'
const DATA_URL = `${import.meta.env.BASE_URL}data/hk-streets.geojson`
const DEFAULT_VIEW = { center: [114.1694, 22.3193], zoom: 10.9 }
const HK_BOUNDS = [
  [113.82, 22.15],
  [114.45, 22.58],
]

const darkStyle = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: ['https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  layers: [
    {
      id: 'basemap',
      type: 'raster',
      source: 'basemap',
      minzoom: 0,
      maxzoom: 20,
      paint: {
        'raster-opacity': 0.95,
      },
    },
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#02040a',
        'background-opacity': 0.2,
      },
    },
  ],
}

const bboxToPolygon = (bbox) => {
  const [west, south, east, north] = bbox
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south],
            ],
          ],
        },
        properties: {},
      },
    ],
  }
}

function MapView({
  selectedYear,
  minYear,
  activeGroup,
  onMapReady,
  viewportTarget,
  selectedRoadKey,
  onRoadPick,
}) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)

  const applyMapState = (map, year, group, roadKey) => {
    if (
      !map.getLayer(LAYER_ID) ||
      !map.getLayer(LABEL_LAYER_ID) ||
      !map.getLayer(HIGHLIGHT_LAYER_ID)
    ) {
      return
    }

    const timeFilter = ['<=', ['get', 'naming_year'], year]
    const groupFilter = group
      ? [
          'all',
          ['>=', ['coalesce', ['to-number', ['get', 'naming_year']], minYear], group.start],
          ['<=', ['coalesce', ['to-number', ['get', 'naming_year']], minYear], group.end],
        ]
      : null

    const combinedFilter = groupFilter ? ['all', timeFilter, groupFilter] : timeFilter

    map.setFilter(LAYER_ID, combinedFilter)
    map.setFilter(LABEL_LAYER_ID, combinedFilter)

    const [enName = '', zhName = ''] = roadKey ? roadKey.split('|') : []
    const roadFilter = roadKey
      ? [
          'all',
          ['==', ['coalesce', ['get', 'ENGLISHSTREETNAME'], ''], enName],
          ['==', ['coalesce', ['get', 'CHINESESTREETNAME'], ''], zhName],
        ]
      : ['==', ['get', 'OBJECTID'], -1]
    map.setFilter(HIGHLIGHT_LAYER_ID, roadFilter)

    map.setPaintProperty(LAYER_ID, 'line-opacity', [
      'interpolate',
      ['linear'],
      ['coalesce', ['to-number', ['get', 'naming_year']], minYear],
      minYear,
      0.1,
      year - 1,
      0.35,
      year,
      0.95,
    ])

    map.setPaintProperty(LABEL_LAYER_ID, 'text-opacity', [
      'interpolate',
      ['linear'],
      ['coalesce', ['to-number', ['get', 'naming_year']], minYear],
      minYear,
      0.05,
      year - 1,
      0.4,
      year,
      0.9,
    ])
  }

  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: darkStyle,
      center: DEFAULT_VIEW.center,
      zoom: DEFAULT_VIEW.zoom,
      pitch: 0,
      bearing: 0,
      antialias: true,
      maxBounds: HK_BOUNDS,
      minZoom: 9.2,
    })

    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    const deckOverlay = new MapboxOverlay({ interleaved: true, layers: [] })
    map.addControl(deckOverlay)

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: DATA_URL,
      })

      map.addLayer({
        id: LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': [
            'step',
            ['coalesce', ['to-number', ['get', 'naming_year']], minYear],
            '#5B6CFF',
            1899,
            '#3FA9FF',
            1946,
            '#2ED3FF',
            1970,
            '#35F2C3',
            1990,
            '#C6FF4D',
            2010,
            '#FF5FD2',
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.35, 14, 2.2],
          'line-blur': 0.15,
          'line-opacity': 0,
          'line-opacity-transition': { duration: 700, delay: 0 },
          'line-color-transition': { duration: 700, delay: 0 },
        },
      })

      map.addLayer({
        id: LABEL_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        layout: {
          'symbol-placement': 'line',
          'text-field': [
            'format',
            ['coalesce', ['get', 'CHINESESTREETNAME'], ''],
            { 'font-scale': 1.05 },
            '\n',
            {},
            ['coalesce', ['get', 'ENGLISHSTREETNAME'], ''],
            { 'font-scale': 0.85 },
            ' (',
            { 'font-scale': 0.78 },
            [
              'to-string',
              ['coalesce', ['to-number', ['get', 'naming_year']], minYear],
            ],
            { 'font-scale': 0.78 },
            ')',
            { 'font-scale': 0.78 },
          ],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 14, 13],
          'symbol-spacing': 380,
          'text-max-width': 14,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#9ceeff',
          'text-halo-color': 'rgba(2, 6, 14, 0.95)',
          'text-halo-width': 1.2,
          'text-opacity': 0,
          'text-opacity-transition': { duration: 700, delay: 0 },
        },
      })

      map.addLayer({
        id: HIGHLIGHT_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#fff7a8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 6],
          'line-opacity': 0.98,
          'line-blur': 0.1,
        },
        filter: ['==', ['get', 'OBJECTID'], -1],
      })

      map.addSource(FOCUS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      map.addLayer({
        id: FOCUS_LAYER_ID,
        type: 'line',
        source: FOCUS_SOURCE_ID,
        paint: {
          'line-color': '#8ff3ff',
          'line-width': 1.8,
          'line-opacity': 0.9,
          'line-dasharray': [1.5, 1],
        },
      })

      map.on('mouseenter', LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('click', LAYER_ID, (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const enName = String(feature.properties?.ENGLISHSTREETNAME ?? '').trim()
        const zhName = String(feature.properties?.CHINESESTREETNAME ?? '').trim()
        const key = `${enName}|${zhName}`
        const year = Number(feature.properties?.naming_year)
        onRoadPick?.({
          key,
          center: [event.lngLat.lng, event.lngLat.lat],
          year: Number.isFinite(year) ? year : null,
          enName,
          zhName,
        })
      })

      applyMapState(map, selectedYear, activeGroup, selectedRoadKey)
      onMapReady?.()
    })

    map.on('error', () => {
      onMapReady?.()
    })

    return () => {
      deckOverlay.finalize()
      map.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    applyMapState(map, selectedYear, activeGroup, selectedRoadKey)
  }, [selectedYear, minYear, activeGroup, selectedRoadKey])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    if (!viewportTarget?.bbox && !viewportTarget?.center) {
      map.easeTo({
        center: DEFAULT_VIEW.center,
        zoom: DEFAULT_VIEW.zoom,
        pitch: 0,
        bearing: 0,
        duration: 800,
        essential: true,
      })

      const source = map.getSource(FOCUS_SOURCE_ID)
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] })
      }
      return
    }

    if (viewportTarget?.center) {
      map.flyTo({
        center: viewportTarget.center,
        zoom: viewportTarget.zoom ?? 14,
        pitch: 0,
        bearing: 0,
        duration: 780,
        essential: true,
      })
      const source = map.getSource(FOCUS_SOURCE_ID)
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] })
      }
      return
    }

    map.fitBounds(
      [
        [viewportTarget.bbox[0], viewportTarget.bbox[1]],
        [viewportTarget.bbox[2], viewportTarget.bbox[3]],
      ],
      {
        padding: { top: 90, right: 70, bottom: 130, left: 70 },
        duration: 820,
        essential: true,
        maxZoom: viewportTarget.maxZoom ?? 13.2,
      },
    )

    const source = map.getSource(FOCUS_SOURCE_ID)
    if (source) {
      source.setData(bboxToPolygon(viewportTarget.bbox))
    }
  }, [viewportTarget])

  return <section className="map-container" ref={mapContainerRef} />
}

export default MapView
