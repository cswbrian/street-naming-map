export const THEME_STORAGE_KEY = 'sn-theme'
export const DEFAULT_THEME = 'light'

import { getDecadeEraColors, getDecadeYearBreaks } from '../lib/periodGroups.js'

export function getSystemTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function hasStoredThemePreference() {
  if (typeof window === 'undefined') return false
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' || stored === 'dark'
}

export function getPreferredTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return getSystemTheme()
}

export function applyDocumentTheme(theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', theme === 'light' ? '#f5f5f5' : '#111111')
  }
}

export function persistThemePreference(theme) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)
}

export const BASEMAP_TILES = {
  dark: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
}

export const MAP_LABEL_COLORS = {
  dark: {
    text: '#f3fbff',
    year: '#a8b4c0',
    halo: 'rgba(0, 2, 8, 0.98)',
    haloWidth: 2.75,
    haloBlur: 0.5,
  },
  light: {
    text: '#1a2332',
    year: '#5c6573',
    halo: 'rgba(255, 255, 255, 0.95)',
    haloWidth: 2.5,
    haloBlur: 0.5,
  },
}

/** MapLibre glyph stacks (demotiles.maplibre.org); CJK falls through to Regular combo. */
export const ROAD_LABEL_LAYER_FONT = [
  'Open Sans Semibold',
  'Noto Sans Bold',
  'Noto Sans Regular',
  'Open Sans Regular,Arial Unicode MS Regular',
]

export const MAP_BACKGROUND_COLORS = {
  dark: '#121212',
  light: '#e8e8e8',
}

/** Road palette; era colours are generated per decade in periodGroups.js */
export const MAP_ROAD_PALETTE = {
  dark: {
    unknown: '#6e7585',
    highlightGlow: '#e8e8e8',
    highlightCore: '#f0f0f0',
    focus: '#9a9a9a',
    opacity: {
      unknown: 0.38,
      fadeMin: 0.1,
      fadeMid: 0.35,
      fadeMax: 0.95,
      dimMultiplier: 0.32,
      labelUnknown: 0.75,
      labelFadeMin: 0.55,
      labelFadeMid: 0.68,
      labelFadeMax: 0.95,
      labelDimMultiplier: 0.65,
      selectedLabelOpacity: 1,
    },
  },
  light: {
    unknown: '#9aa3b0',
    highlightGlow: '#ffffff',
    highlightCore: '#1a2332',
    focus: '#4a5568',
    opacity: {
      unknown: 0.45,
      fadeMin: 0.38,
      fadeMid: 0.62,
      fadeMax: 1,
      dimMultiplier: 0.45,
      labelUnknown: 0.85,
      labelFadeMin: 0.72,
      labelFadeMid: 0.8,
      labelFadeMax: 1,
      labelDimMultiplier: 0.65,
      selectedLabelOpacity: 1,
    },
  },
}

/** MapLibre expression: map display year (built-first), or -1 when no year. to-number(null) is 0, not missing. */
export function buildMapYearExpr() {
  const mapYear = [
    'case',
    ['any', ['!', ['has', 'map_year']], ['==', ['get', 'map_year'], null]],
    -1,
    ['coalesce', ['to-number', ['get', 'map_year']], -1],
  ]
  return [
    'case',
    ['!=', mapYear, -1],
    mapYear,
    [
      'case',
      ['any', ['!', ['has', 'naming_year']], ['==', ['get', 'naming_year'], null]],
      -1,
      ['coalesce', ['to-number', ['get', 'naming_year']], -1],
    ],
  ]
}

/** @deprecated Use buildMapYearExpr — kept for callers not yet migrated. */
export function buildNamingYearExpr() {
  return buildMapYearExpr()
}

export function getRoadPalette(theme) {
  return MAP_ROAD_PALETTE[theme] ?? MAP_ROAD_PALETTE.dark
}

export function buildRoadLineColorPaint(theme) {
  const { unknown } = getRoadPalette(theme)
  const eras = getDecadeEraColors(theme)
  const breaks = getDecadeYearBreaks()
  const mapYear = buildMapYearExpr()
  return [
    'case',
    ['==', mapYear, -1],
    unknown,
    ['step', mapYear, eras[0], ...breaks.flatMap((year, index) => [year, eras[index + 1]])],
  ]
}

export function getThemedLegendColor(group, theme) {
  const palette = getRoadPalette(theme)
  if (group.isUnknown) return palette.unknown
  if (Number.isInteger(group.colorIndex)) {
    return getDecadeEraColors(theme)[group.colorIndex]
  }
  return palette.unknown
}
