export const THEME_STORAGE_KEY = 'sn-theme'
export const DEFAULT_THEME = 'light'

export function getSystemTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : DEFAULT_THEME
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
    halo: 'rgba(0, 2, 8, 0.98)',
  },
  light: {
    text: '#1a2332',
    halo: 'rgba(255, 255, 255, 0.95)',
  },
}

export const MAP_BACKGROUND_COLORS = {
  dark: '#121212',
  light: '#e8e8e8',
}

/** Era colors indexed g1–g6; tuned separately for dark vs light basemaps. */
export const MAP_ROAD_PALETTE = {
  dark: {
    unknown: '#B0B8C9',
    eras: ['#5B6CFF', '#3FA9FF', '#2ED3FF', '#35F2C3', '#C6FF4D', '#FF5FD2'],
    highlightGlow: '#e8e8e8',
    highlightCore: '#f0f0f0',
    focus: '#9a9a9a',
    opacity: {
      unknown: 0.9,
      fadeMin: 0.1,
      fadeMid: 0.35,
      fadeMax: 0.95,
      dimMultiplier: 0.32,
      labelUnknown: 0.75,
      labelFadeMin: 0.05,
      labelFadeMid: 0.4,
      labelFadeMax: 0.9,
      labelDimMultiplier: 0.34,
    },
  },
  light: {
    unknown: '#5C6578',
    eras: ['#3141D4', '#0072C9', '#0091B0', '#008566', '#6E9300', '#C41585'],
    highlightGlow: '#ffffff',
    highlightCore: '#1a2332',
    focus: '#4a5568',
    opacity: {
      unknown: 1,
      fadeMin: 0.38,
      fadeMid: 0.62,
      fadeMax: 1,
      dimMultiplier: 0.45,
      labelUnknown: 0.92,
      labelFadeMin: 0.35,
      labelFadeMid: 0.62,
      labelFadeMax: 0.98,
      labelDimMultiplier: 0.45,
    },
  },
}

const ERA_YEAR_BREAKS = [1899, 1946, 1970, 1990, 2010]

export function getRoadPalette(theme) {
  return MAP_ROAD_PALETTE[theme] ?? MAP_ROAD_PALETTE.dark
}

export function buildRoadLineColorPaint(theme) {
  const { unknown, eras } = getRoadPalette(theme)
  return [
    'case',
    ['==', ['coalesce', ['to-number', ['get', 'naming_year']], -1], -1],
    unknown,
    [
      'step',
      ['coalesce', ['to-number', ['get', 'naming_year']], -1],
      eras[0],
      ...ERA_YEAR_BREAKS.flatMap((year, index) => [year, eras[index + 1]]),
    ],
  ]
}

const LEGEND_ERA_IDS = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']

export function getThemedLegendColor(group, theme) {
  const palette = getRoadPalette(theme)
  if (group.isUnknown) return palette.unknown
  const eraIndex = LEGEND_ERA_IDS.indexOf(group.id)
  return eraIndex >= 0 ? palette.eras[eraIndex] : group.color
}
