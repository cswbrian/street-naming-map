export const PERIOD_DECADE_START = 1840
export const PERIOD_DECADE_STEP = 10
export const PERIOD_LAST_DECADE_START = 2020

/** Hue at oldest decade (blue-violet) and span toward newest (red-orange). */
const ERA_HUE_START = 278
const ERA_HUE_SPAN = 268

function hslToHex(h, s, l) {
  const sat = s / 100
  const light = l / 100
  const chroma = sat * Math.min(light, 1 - light)
  const hueToRgb = (n) => {
    const k = (n + h / 30) % 12
    return light - chroma * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  const toHex = (value) => Math.round(value * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${toHex(hueToRgb(0))}${toHex(hueToRgb(8))}${toHex(hueToRgb(4))}`
}

function buildDecadeEraColors(theme) {
  const decadeCount =
    (PERIOD_LAST_DECADE_START - PERIOD_DECADE_START) / PERIOD_DECADE_STEP + 1
  const colors = []

  for (let index = 0; index < decadeCount; index += 1) {
    const t = decadeCount <= 1 ? 0 : index / (decadeCount - 1)
    const hue = ERA_HUE_START - t * ERA_HUE_SPAN
    if (theme === 'light') {
      colors.push(hslToHex(hue, 82, 36))
    } else {
      // Older violet/blue eras need extra lightness on the dark basemap.
      const lightnessBoost = index < 3 ? 12 : index < 6 ? 6 : 0
      colors.push(hslToHex(hue, 90, 64 + lightnessBoost))
    }
  }

  return colors
}

function buildDecadeGroups() {
  const groups = []

  for (
    let start = PERIOD_DECADE_START;
    start <= PERIOD_LAST_DECADE_START;
    start += PERIOD_DECADE_STEP
  ) {
    groups.push({
      id: `d${start}`,
      start,
      end: start + PERIOD_DECADE_STEP - 1,
      colorIndex: groups.length,
    })
  }

  return groups
}

const DECADE_GROUPS = buildDecadeGroups()

export function getDecadeYearBreaks() {
  return DECADE_GROUPS.slice(1).map((group) => group.start)
}

export function getDecadeEraColors(theme) {
  return buildDecadeEraColors(theme)
}

const PERIOD_UNKNOWN_LABEL = {
  zh: '資料待補',
  en: 'Data to be added',
}

export function getPeriodLabel(group, locale, currentYear = new Date().getFullYear()) {
  if (group.isUnknown || group.id === 'unknown') {
    return PERIOD_UNKNOWN_LABEL[locale] ?? PERIOD_UNKNOWN_LABEL.en
  }

  const end = group.end ?? currentYear
  return `${group.start}–${end}`
}

export const PERIOD_GROUP_DEFS = [
  ...DECADE_GROUPS,
  { id: 'unknown', start: null, end: null },
]

export const COLOR_GROUP_DEFS = [
  ...DECADE_GROUPS.map((group) => ({
    ...group,
    isUnknown: false,
  })),
  {
    id: 'g-unknown',
    start: null,
    end: null,
    colorIndex: null,
    isUnknown: true,
  },
]
