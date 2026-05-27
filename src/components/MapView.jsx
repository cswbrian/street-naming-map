import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import 'maplibre-gl/dist/maplibre-gl.css'
import { buildRoadFilter, buildRoadKey, filterNamedStreetFeatures, hasStreetName } from '../lib/roadKey'
import { translations } from '../i18n/translations'

const SOURCE_ID = 'hk-roads-source'
const LAYER_ID = 'hk-roads-layer'
const LABEL_LAYER_ID = 'hk-roads-labels'
const HIGHLIGHT_GLOW_LAYER_ID = 'hk-road-highlight-glow'
const HIGHLIGHT_CORE_LAYER_ID = 'hk-road-highlight-core'
const FOCUS_SOURCE_ID = 'focus-area-source'
const FOCUS_LAYER_ID = 'focus-area-layer'
const DATA_URL = `${import.meta.env.BASE_URL}data/hk-streets.geojson`
const DEFAULT_VIEW = { center: [114.1694, 22.3193], zoom: 10.9 }
const UNKNOWN_COLOR = '#B0B8C9'
const HK_BOUNDS = [
  [113.82, 22.15],
  [114.45, 22.58],
]

const getUnknownYearLabel = (locale) =>
  translations[locale]?.unknownYear ?? translations.en.unknownYear

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const buildMetaRow = (label, valueHtml) =>
  `<div class="selected-road-chip-row"><dt class="selected-road-chip-label">${escapeHtml(label)}</dt><dd class="selected-road-chip-value">${valueHtml}</dd></div>`

const buildEmptyValue = () => '<span class="selected-road-chip-empty">—</span>'

const buildContributeIcon = (variant) => {
  if (variant === 'edit') {
    return `<svg class="selected-road-chip-contribute-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`
  }
  return `<svg class="selected-road-chip-contribute-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/></svg>`
}

const buildSelectedRoadChipHtml = (selectedRoadInfo, locale) => {
  const labels = translations[locale] ?? translations.en
  const metaRows = [
    selectedRoadInfo.streetType
      ? buildMetaRow(labels.colType, escapeHtml(selectedRoadInfo.streetType))
      : '',
    buildMetaRow(
      labels.colNaming,
      selectedRoadInfo.isNamingPending
        ? `<span class="selected-road-chip-pending">${escapeHtml(selectedRoadInfo.namingDisplay ?? labels.pending)}</span>`
        : `<span class="selected-road-chip-date">${escapeHtml(selectedRoadInfo.namingDisplay)}</span>`,
    ),
    selectedRoadInfo.noticeLink
      ? buildMetaRow(
          labels.colNotice,
          `<a class="selected-road-chip-notice" href="${escapeHtml(selectedRoadInfo.noticeLink.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(selectedRoadInfo.noticeLink.label)}</a>`,
        )
      : buildMetaRow(labels.colNotice, buildEmptyValue()),
    selectedRoadInfo.sourceBadge
      ? buildMetaRow(
          labels.colSource,
          `<span class="selected-road-chip-source pending-source-badge pending-source-${selectedRoadInfo.sourceBadge.kind}" title="${escapeHtml(selectedRoadInfo.sourceBadge.hint)}">${escapeHtml(selectedRoadInfo.sourceBadge.label)}</span>`,
        )
      : buildMetaRow(labels.colSource, buildEmptyValue()),
  ].join('')

  const contributeBlock = selectedRoadInfo.contributeUrl
    ? `<footer class="selected-road-chip-foot"><a class="selected-road-chip-contribute" href="${escapeHtml(selectedRoadInfo.contributeUrl)}" target="_blank" rel="noopener noreferrer">${buildContributeIcon(selectedRoadInfo.contributeVariant)}<span>${escapeHtml(selectedRoadInfo.contributeLabel)}</span></a></footer>`
    : ''

  return `
    <div class="selected-road-chip-content">
      <header class="selected-road-chip-head">
        ${selectedRoadInfo.zhName ? `<p class="selected-road-chip-zh">${escapeHtml(selectedRoadInfo.zhName)}</p>` : ''}
        ${selectedRoadInfo.enName ? `<p class="selected-road-chip-en">${escapeHtml(selectedRoadInfo.enName)}</p>` : ''}
      </header>
      <dl class="selected-road-chip-meta">${metaRows}</dl>
      ${contributeBlock}
    </div>
    <span class="selected-road-chip-pointer" aria-hidden="true"></span>
  `
}

const buildRoadLabelTextField = (unknownYearLabel) => [
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
    'case',
    ['==', ['coalesce', ['to-number', ['get', 'naming_year']], -1], -1],
    unknownYearLabel,
    ['to-string', ['get', 'naming_year']],
  ],
  { 'font-scale': 0.78 },
  ')',
  { 'font-scale': 0.78 },
]

const darkStyle = {
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'],
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
        'background-color': '#121212',
        'background-opacity': 0.35,
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
  locale,
  selectedYear,
  minYear,
  activeGroup,
  onMapReady,
  viewportTarget,
  selectedRoadKey,
  selectedRoadCenter,
  selectedRoadInfo,
  onRoadPick,
}) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const selectedRoadMarkerRef = useRef(null)

  const applyMapState = (map, year, group, roadKey) => {
    if (
      !map.getLayer(LAYER_ID) ||
      !map.getLayer(LABEL_LAYER_ID) ||
      !map.getLayer(HIGHLIGHT_GLOW_LAYER_ID) ||
      !map.getLayer(HIGHLIGHT_CORE_LAYER_ID)
    ) {
      return
    }

    const numericYear = ['coalesce', ['to-number', ['get', 'naming_year']], -1]
    const unknownYearFilter = ['==', numericYear, -1]
    const knownYearFilter = ['all', ['!=', numericYear, -1], ['<=', numericYear, year]]
    const timeFilter = ['any', knownYearFilter, unknownYearFilter]

    const groupFilter = group
      ? group.isUnknown
        ? unknownYearFilter
        : [
            'all',
            ['!=', numericYear, -1],
            ['>=', numericYear, group.start],
            ['<=', numericYear, group.end],
          ]
      : null

    const combinedFilter = groupFilter ? ['all', timeFilter, groupFilter] : timeFilter

    map.setFilter(LAYER_ID, combinedFilter)
    map.setFilter(LABEL_LAYER_ID, combinedFilter)

    const roadFilter = buildRoadFilter(roadKey)
    map.setFilter(HIGHLIGHT_GLOW_LAYER_ID, roadFilter)
    map.setFilter(HIGHLIGHT_CORE_LAYER_ID, roadFilter)

    const baseLineOpacity = [
      'case',
      ['==', numericYear, -1],
      0.9,
      [
        'interpolate',
        ['linear'],
        numericYear,
        minYear,
        0.1,
        year - 1,
        0.35,
        year,
        0.95,
      ],
    ]

    map.setPaintProperty(
      LAYER_ID,
      'line-opacity',
      roadKey ? ['case', roadFilter, 0.2, ['*', baseLineOpacity, 0.32]] : baseLineOpacity,
    )

    const baseLabelOpacity = [
      'case',
      ['==', numericYear, -1],
      0.75,
      [
        'interpolate',
        ['linear'],
        numericYear,
        minYear,
        0.05,
        year - 1,
        0.4,
        year,
        0.9,
      ],
    ]

    map.setPaintProperty(
      LABEL_LAYER_ID,
      'text-opacity',
      roadKey ? ['case', roadFilter, 0.1, ['*', baseLabelOpacity, 0.34]] : baseLabelOpacity,
    )
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
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    const deckOverlay = new MapboxOverlay({ interleaved: true, layers: [] })
    map.addControl(deckOverlay)

    map.on('load', async () => {
      let roadData = { type: 'FeatureCollection', features: [] }
      try {
        const response = await fetch(DATA_URL)
        if (response.ok) {
          const geojson = await response.json()
          roadData = {
            ...geojson,
            features: filterNamedStreetFeatures(geojson?.features),
          }
        }
      } catch {
        // Keep empty collection if road data fails to load.
      }

      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: roadData,
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
            'case',
            ['==', ['coalesce', ['to-number', ['get', 'naming_year']], -1], -1],
            UNKNOWN_COLOR,
            [
              'step',
              ['coalesce', ['to-number', ['get', 'naming_year']], -1],
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
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9,
            [
              'match',
              ['get', 'STREETTYPE'],
              'Highway',
              1.5,
              'Main Road',
              1.1,
              'Secondary Road',
              0.65,
              'Restricted Road',
              0.85,
              'Tunnel',
              0.95,
              'Track',
              0.3,
              0.5,
            ],
            14,
            [
              'match',
              ['get', 'STREETTYPE'],
              'Highway',
              5.6,
              'Main Road',
              4.4,
              'Secondary Road',
              2.8,
              'Restricted Road',
              3.2,
              'Tunnel',
              3.6,
              'Track',
              1.4,
              2.2,
            ],
          ],
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
          'text-field': buildRoadLabelTextField(getUnknownYearLabel(locale)),
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 14, 13],
          'symbol-spacing': 380,
          'text-max-width': 14,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#f3fbff',
          'text-halo-color': 'rgba(0, 2, 8, 0.98)',
          'text-halo-width': 1.5,
          'text-opacity': 0,
          'text-opacity-transition': { duration: 700, delay: 0 },
        },
      })

      map.addLayer({
        id: HIGHLIGHT_GLOW_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: {
          'line-cap': 'butt',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#e8e8e8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 5, 14, 10],
          'line-opacity': 0,
          'line-blur': 0,
        },
        filter: ['==', ['get', 'OBJECTID'], -1],
      })

      map.addLayer({
        id: HIGHLIGHT_CORE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: {
          'line-cap': 'butt',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#f0f0f0',
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.6, 14, 5.5],
          'line-opacity': 0.95,
          'line-blur': 0,
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
          'line-color': '#9a9a9a',
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
        if (!hasStreetName(enName, zhName)) return
        const streetCode = String(feature.properties?.STREETCODE ?? '').trim()
        const key = buildRoadKey(enName, zhName, streetCode)
        if (!key) return
        const year = Number(feature.properties?.naming_year)
        const namingDate = String(feature.properties?.naming_date ?? '').trim()
        const streetType = String(feature.properties?.STREETTYPE ?? '').trim()
        const namingSource = String(feature.properties?.naming_source ?? '').trim()
        onRoadPick?.({
          key,
          center: [event.lngLat.lng, event.lngLat.lat],
          year: Number.isFinite(year) ? year : null,
          namingDate: namingDate || null,
          enName,
          zhName,
          streetCode: streetCode || null,
          streetType: streetType || null,
          namingSource: namingSource || null,
        })
      })

      applyMapState(map, selectedYear, activeGroup, selectedRoadKey)
      onMapReady?.()
    })

    map.on('error', () => {
      onMapReady?.()
    })

    return () => {
      if (selectedRoadMarkerRef.current) {
        selectedRoadMarkerRef.current.remove()
        selectedRoadMarkerRef.current = null
      }
      deckOverlay.finalize()
      map.remove()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer(LABEL_LAYER_ID)) return
    map.setLayoutProperty(
      LABEL_LAYER_ID,
      'text-field',
      buildRoadLabelTextField(getUnknownYearLabel(locale)),
    )
  }, [locale])

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
        padding: viewportTarget.padding ?? { top: 90, right: 70, bottom: 130, left: 70 },
        duration: 820,
        essential: true,
        maxZoom: viewportTarget.maxZoom ?? 13.2,
      },
    )

    const source = map.getSource(FOCUS_SOURCE_ID)
    if (source) {
      source.setData({ type: 'FeatureCollection', features: [] })
    }
  }, [viewportTarget])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!selectedRoadKey || !selectedRoadCenter || !selectedRoadInfo) {
      if (selectedRoadMarkerRef.current) {
        selectedRoadMarkerRef.current.remove()
        selectedRoadMarkerRef.current = null
      }
      return
    }

    const chip = document.createElement('section')
    chip.className = 'selected-road-chip'
    chip.innerHTML = buildSelectedRoadChipHtml(selectedRoadInfo, locale)
    const contributeLink = chip.querySelector('.selected-road-chip-contribute')
    if (contributeLink) {
      contributeLink.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        window.open(selectedRoadInfo.contributeUrl, '_blank', 'noopener,noreferrer')
      })
    }
    const noticeLink = chip.querySelector('.selected-road-chip-notice')
    if (noticeLink) {
      noticeLink.addEventListener('click', (event) => {
        event.stopPropagation()
      })
    }
    chip.addEventListener('click', (event) => {
      event.stopPropagation()
    })

    if (selectedRoadMarkerRef.current) {
      selectedRoadMarkerRef.current.remove()
    }

    selectedRoadMarkerRef.current = new maplibregl.Marker({
      element: chip,
      className: 'selected-road-marker',
      anchor: 'bottom',
      offset: [0, -14],
    })
      .setLngLat(selectedRoadCenter)
      .addTo(map)
  }, [
    selectedRoadKey,
    selectedRoadCenter,
    selectedRoadInfo,
    locale,
  ])

  return <section className="map-container" ref={mapContainerRef} />
}

export default MapView
