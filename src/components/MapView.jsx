import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import maplibregl from 'maplibre-gl'
import NameHistoryList from './NameHistoryList.jsx'
import { MapboxOverlay } from '@deck.gl/mapbox'
import 'maplibre-gl/dist/maplibre-gl.css'
import { buildRoadFilter, buildRoadKey, filterNamedStreetFeatures, hasStreetName } from '../lib/roadKey'
import { trackContributeOpen, trackNoticeOpen, trackShareRoad } from '../lib/analytics.js'
import { translations } from '../i18n/translations'
import { isMapMobileViewport } from '../lib/mapViewport.js'
import {
  BASEMAP_TILES,
  MAP_BACKGROUND_COLORS,
  MAP_LABEL_COLORS,
  ROAD_LABEL_LAYER_FONT,
  buildNamingYearExpr,
  buildRoadLineColorPaint,
  getRoadPalette,
} from '../theme/theme.js'

const SOURCE_ID = 'hk-roads-source'
const LAYER_ID = 'hk-roads-layer'
const HIT_LAYER_ID = 'hk-roads-hit'
const LABEL_MAIN_LAYER_ID = 'hk-roads-labels-main'
const LABEL_LAYER_ID = 'hk-roads-labels'
const LABEL_LAYER_IDS = [LABEL_MAIN_LAYER_ID, LABEL_LAYER_ID]

/** Main arterials / tunnels only below ROAD_LABEL_MIN_ZOOM. */
const MAIN_ROAD_LABEL_FILTER = [
  'match',
  ['get', 'STREETTYPE'],
  'Highway',
  true,
  'Main Road',
  true,
  'Tunnel',
  true,
  false,
]

const MAIN_ROAD_LABEL_MIN_ZOOM = 12
const ROAD_LABEL_MIN_ZOOM = 14
const ROAD_LABEL_BILINGUAL_ZOOM = 14.5
const HIGHLIGHT_GLOW_LAYER_ID = 'hk-road-highlight-glow'
const HIGHLIGHT_CORE_LAYER_ID = 'hk-road-highlight-core'
const FOCUS_SOURCE_ID = 'focus-area-source'
const FOCUS_LAYER_ID = 'focus-area-layer'
const DATA_URL = `${import.meta.env.BASE_URL}data/hk-streets.geojson`
const DEFAULT_VIEW = { center: [114.1694, 22.3193], zoom: 10.9 }

const flyMapToViewportTarget = (map, target) => {
  if (target?.center) {
    map.flyTo({
      center: target.center,
      zoom: target.zoom ?? 14,
      pitch: 0,
      bearing: 0,
      duration: 780,
      essential: true,
    })
    return
  }

  if (target?.bbox) {
    map.fitBounds(
      [
        [target.bbox[0], target.bbox[1]],
        [target.bbox[2], target.bbox[3]],
      ],
      {
        padding: target.padding ?? { top: 90, right: 70, bottom: 130, left: 70 },
        duration: 820,
        essential: true,
        maxZoom: target.maxZoom ?? 13.2,
      },
    )
  }
}

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

const buildCloseIcon = () =>
  `<svg class="selected-road-chip-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`

const buildShareIcon = () =>
  `<svg class="selected-road-chip-share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`

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
    selectedRoadInfo.nameHistory?.length
      ? `<div class="selected-road-chip-row selected-road-chip-row-history"><dt class="selected-road-chip-label">${escapeHtml(labels.colNameHistory)}</dt><dd class="selected-road-chip-value"><div class="selected-road-chip-history-mount"></div></dd></div>`
      : '',
    selectedRoadInfo.namingRemarks?.length
      ? buildMetaRow(
          labels.colRemarks,
          `<ul class="selected-road-chip-remarks">${selectedRoadInfo.namingRemarks
            .map((remark) => `<li>${escapeHtml(remark)}</li>`)
            .join('')}</ul>`,
        )
      : '',
  ].join('')

  const actionButtons = [
    selectedRoadInfo.contributeUrl
      ? `<a class="selected-road-chip-contribute" href="${escapeHtml(selectedRoadInfo.contributeUrl)}" target="_blank" rel="noopener noreferrer">${buildContributeIcon(selectedRoadInfo.contributeVariant)}<span>${escapeHtml(selectedRoadInfo.contributeLabel)}</span></a>`
      : '',
    selectedRoadInfo.shareUrl
      ? `<button type="button" class="selected-road-chip-share" aria-label="${escapeHtml(selectedRoadInfo.shareAriaLabel)}">${buildShareIcon()}<span>${escapeHtml(selectedRoadInfo.shareLabel)}</span></button>`
      : '',
  ]
    .filter(Boolean)
    .join('')

  const contributeBlock = actionButtons
    ? `<footer class="selected-road-chip-foot"><div class="selected-road-chip-actions">${actionButtons}</div></footer>`
    : ''

  return `
    <div class="selected-road-chip-content">
      <header class="selected-road-chip-head">
        <div class="selected-road-chip-titles">
          ${selectedRoadInfo.zhName ? `<p class="selected-road-chip-zh">${escapeHtml(selectedRoadInfo.zhName)}</p>` : ''}
          ${selectedRoadInfo.enName ? `<p class="selected-road-chip-en">${escapeHtml(selectedRoadInfo.enName)}</p>` : ''}
        </div>
        <button type="button" class="selected-road-chip-close" aria-label="${escapeHtml(labels.mapRoadCardClose)}">${buildCloseIcon()}</button>
      </header>
      <dl class="selected-road-chip-meta">${metaRows}</dl>
      ${contributeBlock}
    </div>
    <span class="selected-road-chip-pointer" aria-hidden="true"></span>
  `
}

/** Invisible line width used for tap / click hit testing (screen pixels). */
const ROAD_HIT_LINE_WIDTH = [
  'interpolate',
  ['linear'],
  ['zoom'],
  9,
  14,
  14,
  28,
]

const distancePointToSegmentSquared = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) {
    const ox = px - x1
    const oy = py - y1
    return ox * ox + oy * oy
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  const projX = x1 + t * dx
  const projY = y1 + t * dy
  const ox = px - projX
  const oy = py - projY
  return ox * ox + oy * oy
}

const distancePointToLineGeometry = (map, point, geometry) => {
  const coordsList =
    geometry?.type === 'LineString'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiLineString'
        ? geometry.coordinates
        : []

  let minDistSq = Infinity
  for (const coords of coordsList) {
    if (!Array.isArray(coords) || coords.length < 2) continue
    for (let i = 0; i < coords.length - 1; i += 1) {
      const a = map.project(coords[i])
      const b = map.project(coords[i + 1])
      const distSq = distancePointToSegmentSquared(point.x, point.y, a.x, a.y, b.x, b.y)
      if (distSq < minDistSq) minDistSq = distSq
    }
  }
  return minDistSq
}

const pickClosestRoadFeature = (map, point, features) => {
  let best = null
  let bestDistSq = Infinity

  for (const feature of features) {
    const enName = String(feature.properties?.ENGLISHSTREETNAME ?? '').trim()
    const zhName = String(feature.properties?.CHINESESTREETNAME ?? '').trim()
    if (!hasStreetName(enName, zhName)) continue

    const distSq = distancePointToLineGeometry(map, point, feature.geometry)
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      best = feature
    }
  }

  return best
}

const emitRoadPickFromFeature = (feature, lngLat, onRoadPick) => {
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
    center: [lngLat.lng, lngLat.lat],
    year: Number.isFinite(year) ? year : null,
    namingDate: namingDate || null,
    enName,
    zhName,
    streetCode: streetCode || null,
    streetType: streetType || null,
    namingSource: namingSource || null,
  })
}

const buildPrimaryStreetNameExpr = (locale) =>
  locale === 'zh'
    ? ['coalesce', ['get', 'CHINESESTREETNAME'], ['get', 'ENGLISHSTREETNAME'], '']
    : ['coalesce', ['get', 'ENGLISHSTREETNAME'], ['get', 'CHINESESTREETNAME'], '']

const buildSecondaryStreetNameExpr = (locale) =>
  locale === 'zh'
    ? ['coalesce', ['get', 'ENGLISHSTREETNAME'], '']
    : ['coalesce', ['get', 'CHINESESTREETNAME'], '']

const LABEL_FONT_PRIMARY = [
  'literal',
  [
    'Open Sans Semibold',
    'Noto Sans Bold',
    'Noto Sans Regular',
    'Open Sans Regular,Arial Unicode MS Regular',
  ],
]

const LABEL_FONT_REGULAR = [
  'literal',
  ['Noto Sans Regular', 'Open Sans Regular', 'Open Sans Regular,Arial Unicode MS Regular'],
]

const getLabelYearColor = (mapTheme) => (MAP_LABEL_COLORS[mapTheme] ?? MAP_LABEL_COLORS.dark).year

const primaryLabelStyle = () => ({ 'font-scale': 1.12, 'text-font': LABEL_FONT_PRIMARY })

const secondaryLabelStyle = () => ({ 'font-scale': 0.92, 'text-font': LABEL_FONT_REGULAR })

const yearLabelStyle = (yearColor) => ({
  'font-scale': 0.76,
  'text-font': LABEL_FONT_REGULAR,
  'text-color': yearColor,
})

const buildNamingYearDisplayExpr = (unknownYearLabel) => {
  const namingYear = buildNamingYearExpr()
  return ['case', ['==', namingYear, -1], unknownYearLabel, ['to-string', ['get', 'naming_year']]]
}

const buildYearParentheticalFormat = (unknownYearLabel, yearColor) => [
  ' (',
  yearLabelStyle(yearColor),
  buildNamingYearDisplayExpr(unknownYearLabel),
  yearLabelStyle(yearColor),
  ')',
  yearLabelStyle(yearColor),
]

const buildPrimaryRoadLabelExpr = (locale, unknownYearLabel, yearColor) => [
  'format',
  buildPrimaryStreetNameExpr(locale),
  primaryLabelStyle(),
  ...buildYearParentheticalFormat(unknownYearLabel, yearColor),
]

const buildBilingualRoadLabelExpr = (locale, unknownYearLabel, yearColor) => [
  'format',
  buildPrimaryStreetNameExpr(locale),
  primaryLabelStyle(),
  '\n',
  {},
  buildSecondaryStreetNameExpr(locale),
  secondaryLabelStyle(),
  ...buildYearParentheticalFormat(unknownYearLabel, yearColor),
]

const buildRoadLabelTextField = (locale, unknownYearLabel, mapTheme) => {
  const yearColor = getLabelYearColor(mapTheme)
  return [
    'step',
    ['zoom'],
    buildPrimaryRoadLabelExpr(locale, unknownYearLabel, yearColor),
    ROAD_LABEL_BILINGUAL_ZOOM,
    buildBilingualRoadLabelExpr(locale, unknownYearLabel, yearColor),
  ]
}

const ROAD_LABEL_TEXT_SIZE = {
  desktop: ['interpolate', ['linear'], ['zoom'], 12, 12, 15, 16, 17, 17],
  mobile: ['interpolate', ['linear'], ['zoom'], 12, 13, 15, 17, 17, 18],
}

const buildLabelLayerPaint = (mapTheme) => {
  const labelColors = MAP_LABEL_COLORS[mapTheme] ?? MAP_LABEL_COLORS.dark
  return {
    'text-color': labelColors.text,
    'text-halo-color': labelColors.halo,
    'text-halo-width': labelColors.haloWidth ?? 2.5,
    'text-halo-blur': labelColors.haloBlur ?? 0.5,
    'text-opacity': 0,
    'text-opacity-transition': { duration: 700, delay: 0 },
  }
}

const buildLabelLayerLayout = (locale, unknownYearLabel, mapTheme, textSize) => ({
  'symbol-placement': 'line',
  'text-field': buildRoadLabelTextField(locale, unknownYearLabel, mapTheme),
  'text-font': ROAD_LABEL_LAYER_FONT,
  'text-size': textSize,
  'symbol-spacing': 380,
  'text-max-width': 14,
  'text-allow-overlap': false,
})

const applyLabelTypography = (map, mapTheme, mobile = isMapMobileViewport()) => {
  const labelColors = MAP_LABEL_COLORS[mapTheme] ?? MAP_LABEL_COLORS.dark
  const textSize = mobile ? ROAD_LABEL_TEXT_SIZE.mobile : ROAD_LABEL_TEXT_SIZE.desktop

  for (const layerId of LABEL_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue
    map.setPaintProperty(layerId, 'text-color', labelColors.text)
    map.setPaintProperty(layerId, 'text-halo-color', labelColors.halo)
    map.setPaintProperty(layerId, 'text-halo-width', labelColors.haloWidth ?? 2.5)
    map.setPaintProperty(layerId, 'text-halo-blur', labelColors.haloBlur ?? 0.5)
    map.setLayoutProperty(layerId, 'text-font', ROAD_LABEL_LAYER_FONT)
    map.setLayoutProperty(layerId, 'text-size', textSize)
  }
}

const buildBasemapStyle = (theme) => ({
  version: 8,
  sources: {
    basemap: {
      type: 'raster',
      tiles: [BASEMAP_TILES[theme] ?? BASEMAP_TILES.dark],
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
        'background-color': MAP_BACKGROUND_COLORS[theme] ?? MAP_BACKGROUND_COLORS.dark,
        'background-opacity': 0.35,
      },
    },
  ],
})

const applyRoadTheme = (map, theme) => {
  const source = map.getSource('basemap')
  if (source?.setTiles) {
    source.setTiles([BASEMAP_TILES[theme] ?? BASEMAP_TILES.dark])
  }

  if (map.getLayer('background')) {
    map.setPaintProperty(
      'background',
      'background-color',
      MAP_BACKGROUND_COLORS[theme] ?? MAP_BACKGROUND_COLORS.dark,
    )
  }

  applyLabelTypography(map, theme)

  const palette = getRoadPalette(theme)
  if (map.getLayer(LAYER_ID)) {
    map.setPaintProperty(LAYER_ID, 'line-color', buildRoadLineColorPaint(theme))
    map.setPaintProperty(LAYER_ID, 'line-blur', theme === 'light' ? 0.08 : 0.15)
  }

  if (map.getLayer(HIGHLIGHT_GLOW_LAYER_ID)) {
    map.setPaintProperty(HIGHLIGHT_GLOW_LAYER_ID, 'line-color', palette.highlightGlow)
  }

  if (map.getLayer(HIGHLIGHT_CORE_LAYER_ID)) {
    map.setPaintProperty(HIGHLIGHT_CORE_LAYER_ID, 'line-color', palette.highlightCore)
  }

  if (map.getLayer(FOCUS_LAYER_ID)) {
    map.setPaintProperty(FOCUS_LAYER_ID, 'line-color', palette.focus)
  }
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
  theme = 'light',
  selectedYear,
  minYear,
  activeGroup,
  onMapReady,
  viewportTarget,
  roadViewportTarget,
  selectedRoadKey,
  selectedRoadCenter,
  selectedRoadInfo,
  onRoadPick,
  onRoadClear,
}) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const selectedRoadMarkerRef = useRef(null)
  const nameHistoryRootRef = useRef(null)

  const applyMapState = (map, year, group, roadKey, mapTheme = 'light') => {
    if (
      !map.getLayer(LAYER_ID) ||
      !map.getLayer(LABEL_MAIN_LAYER_ID) ||
      !map.getLayer(LABEL_LAYER_ID) ||
      !map.getLayer(HIGHLIGHT_GLOW_LAYER_ID) ||
      !map.getLayer(HIGHLIGHT_CORE_LAYER_ID)
    ) {
      return
    }

    const opacity = getRoadPalette(mapTheme).opacity

    const numericYear = buildNamingYearExpr()
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
    map.setFilter(LABEL_MAIN_LAYER_ID, ['all', combinedFilter, MAIN_ROAD_LABEL_FILTER])
    map.setFilter(LABEL_LAYER_ID, ['all', combinedFilter, ['!', MAIN_ROAD_LABEL_FILTER]])

    const roadFilter = buildRoadFilter(roadKey)
    map.setFilter(HIGHLIGHT_GLOW_LAYER_ID, roadFilter)
    map.setFilter(HIGHLIGHT_CORE_LAYER_ID, roadFilter)

    const baseLineOpacity = [
      'case',
      ['==', numericYear, -1],
      opacity.unknown,
      [
        'interpolate',
        ['linear'],
        numericYear,
        minYear,
        opacity.fadeMin,
        year - 1,
        opacity.fadeMid,
        year,
        opacity.fadeMax,
      ],
    ]

    map.setPaintProperty(
      LAYER_ID,
      'line-opacity',
      roadKey ? ['case', roadFilter, 0.2, ['*', baseLineOpacity, opacity.dimMultiplier]] : baseLineOpacity,
    )

    const baseLabelOpacity = [
      'case',
      ['==', numericYear, -1],
      opacity.labelUnknown,
      [
        'interpolate',
        ['linear'],
        numericYear,
        minYear,
        opacity.labelFadeMin,
        year - 1,
        opacity.labelFadeMid,
        year,
        opacity.labelFadeMax,
      ],
    ]

    const labelOpacity = roadKey
      ? [
          'case',
          roadFilter,
          opacity.selectedLabelOpacity ?? 1,
          ['*', baseLabelOpacity, opacity.labelDimMultiplier],
        ]
      : baseLabelOpacity

    for (const layerId of LABEL_LAYER_IDS) {
      map.setPaintProperty(layerId, 'text-opacity', labelOpacity)
    }
  }

  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildBasemapStyle(theme),
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
          'line-cap': 'butt',
          'line-join': 'round',
        },
        paint: {
          'line-color': buildRoadLineColorPaint(theme),
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9,
            [
              'match',
              ['get', 'STREETTYPE'],
              'Highway',
              2.1,
              'Main Road',
              1.55,
              'Secondary Road',
              0.9,
              'Restricted Road',
              1.2,
              'Tunnel',
              1.35,
              'Track',
              0.45,
              0.7,
            ],
            14,
            [
              'match',
              ['get', 'STREETTYPE'],
              'Highway',
              7.8,
              'Main Road',
              6.2,
              'Secondary Road',
              3.9,
              'Restricted Road',
              4.5,
              'Tunnel',
              5.0,
              'Track',
              2.0,
              3.1,
            ],
          ],
          'line-blur': theme === 'light' ? 0.08 : 0.15,
          'line-opacity': 0,
          'line-opacity-transition': { duration: 700, delay: 0 },
          'line-color-transition': { duration: 700, delay: 0 },
        },
      })

      const unknownYearLabel = getUnknownYearLabel(locale)
      const labelLayout = buildLabelLayerLayout(locale, unknownYearLabel, theme, ROAD_LABEL_TEXT_SIZE.desktop)
      const labelPaint = buildLabelLayerPaint(theme)

      map.addLayer({
        id: LABEL_MAIN_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        minzoom: MAIN_ROAD_LABEL_MIN_ZOOM,
        layout: labelLayout,
        paint: labelPaint,
      })

      map.addLayer({
        id: LABEL_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        minzoom: ROAD_LABEL_MIN_ZOOM,
        layout: labelLayout,
        paint: labelPaint,
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
          'line-color': getRoadPalette(theme).highlightGlow,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 6.5, 14, 13],
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
          'line-color': getRoadPalette(theme).highlightCore,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3.5, 14, 7.5],
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
          'line-color': getRoadPalette(theme).focus,
          'line-width': 2.4,
          'line-opacity': 0.9,
          'line-dasharray': [1.5, 1],
        },
      })

      map.addLayer({
        id: HIT_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#000000',
          'line-width': ROAD_HIT_LINE_WIDTH,
          'line-opacity': 0,
        },
      })

      map.on('mouseenter', HIT_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', HIT_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('click', HIT_LAYER_ID, (event) => {
        const candidates = event.features ?? []
        if (!candidates.length) return
        const feature = pickClosestRoadFeature(map, event.point, candidates)
        if (!feature) return
        emitRoadPickFromFeature(feature, event.lngLat, onRoadPick)
      })

      applyLabelTypography(map, theme)
      applyMapState(map, selectedYear, activeGroup, selectedRoadKey, theme)
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
    if (!map) return undefined

    const apply = () => {
      applyRoadTheme(map, theme)
      applyMapState(map, selectedYear, activeGroup, selectedRoadKey, theme)
    }
    if (map.isStyleLoaded()) {
      apply()
      return undefined
    }

    map.once('load', apply)
    return () => {
      map.off('load', apply)
    }
  }, [theme, selectedYear, activeGroup, selectedRoadKey, minYear])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer(LABEL_LAYER_ID)) return
    const textField = buildRoadLabelTextField(locale, getUnknownYearLabel(locale), theme)
    for (const layerId of LABEL_LAYER_IDS) {
      map.setLayoutProperty(layerId, 'text-field', textField)
    }
  }, [locale, theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getLayer(LABEL_MAIN_LAYER_ID)) return undefined

    const syncLabelTypography = () => applyLabelTypography(map, theme)
    syncLabelTypography()

    const media = window.matchMedia('(max-width: 820px)')
    media.addEventListener('change', syncLabelTypography)
    return () => media.removeEventListener('change', syncLabelTypography)
  }, [theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    applyMapState(map, selectedYear, activeGroup, selectedRoadKey, theme)
  }, [selectedYear, minYear, activeGroup, selectedRoadKey, theme])

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

    flyMapToViewportTarget(map, viewportTarget)

    const source = map.getSource(FOCUS_SOURCE_ID)
    if (source) {
      source.setData({ type: 'FeatureCollection', features: [] })
    }
  }, [viewportTarget])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    if (!roadViewportTarget?.bbox && !roadViewportTarget?.center) {
      return
    }

    flyMapToViewportTarget(map, roadViewportTarget)

    const source = map.getSource(FOCUS_SOURCE_ID)
    if (source) {
      source.setData({ type: 'FeatureCollection', features: [] })
    }
  }, [roadViewportTarget])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!selectedRoadKey || !selectedRoadCenter || !selectedRoadInfo) {
      nameHistoryRootRef.current?.unmount()
      nameHistoryRootRef.current = null
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
        trackContributeOpen('map', selectedRoadInfo.contributeVariant ?? 'add')
        window.open(selectedRoadInfo.contributeUrl, '_blank', 'noopener,noreferrer')
      })
    }
    const noticeLink = chip.querySelector('.selected-road-chip-notice')
    if (noticeLink) {
      noticeLink.addEventListener('click', () => {
        trackNoticeOpen('map')
      })
    }

    const historyMount = chip.querySelector('.selected-road-chip-history-mount')
    nameHistoryRootRef.current?.unmount()
    nameHistoryRootRef.current = null
    if (historyMount && selectedRoadInfo.nameHistory?.length) {
      const root = createRoot(historyMount)
      nameHistoryRootRef.current = root
      root.render(
        <NameHistoryList
          items={selectedRoadInfo.nameHistory}
          onNoticeClick={() => trackNoticeOpen('map')}
        />,
      )
    }
    const closeButton = chip.querySelector('.selected-road-chip-close')
    if (closeButton) {
      closeButton.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        onRoadClear?.()
      })
    }
    const shareButton = chip.querySelector('.selected-road-chip-share')
    if (shareButton && selectedRoadInfo.shareUrl) {
      const defaultShareLabel = selectedRoadInfo.shareLabel
      const copiedShareLabel = selectedRoadInfo.shareCopiedLabel
      shareButton.addEventListener('click', async (event) => {
        event.preventDefault()
        event.stopPropagation()
        const url = selectedRoadInfo.shareUrl
        const labelSpan = shareButton.querySelector('span')
        try {
          if (navigator.share) {
            await navigator.share({
              url,
              title: selectedRoadInfo.enName || selectedRoadInfo.zhName || '',
            })
            trackShareRoad('native')
            return
          }
        } catch (error) {
          if (error?.name === 'AbortError') return
        }
        try {
          await navigator.clipboard.writeText(url)
          trackShareRoad('clipboard')
          shareButton.classList.add('is-copied')
          if (labelSpan) labelSpan.textContent = copiedShareLabel
          shareButton.setAttribute('aria-label', copiedShareLabel)
          window.setTimeout(() => {
            shareButton.classList.remove('is-copied')
            if (labelSpan) labelSpan.textContent = defaultShareLabel
            shareButton.setAttribute('aria-label', selectedRoadInfo.shareAriaLabel)
          }, 2000)
        } catch {
          // Clipboard unavailable — URL is still synced in the address bar.
        }
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

    return () => {
      nameHistoryRootRef.current?.unmount()
      nameHistoryRootRef.current = null
    }
  }, [
    selectedRoadKey,
    selectedRoadCenter,
    selectedRoadInfo,
    locale,
    onRoadClear,
  ])

  return <section className="map-container" ref={mapContainerRef} />
}

export default MapView
