export const normalizeRoadName = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const lowered = text.toLowerCase()
  if (['null', 'undefined', 'n/a', 'na', '-', '--'].includes(lowered)) {
    return ''
  }
  return text
}

/** Title-case ALL-CAPS English names so they match crowd/tracker keys. */
export const normalizeStreetNameForMatch = (name) => {
  const value = String(name ?? '').trim()
  if (!value) return ''
  if (/^[A-Z0-9\s\-'.]+$/.test(value) && /[A-Z]{2,}/.test(value)) {
    return value
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
  return value
}

/** Keys used to match rows against recently-verified.json and submission tracker. */
export const buildStreetMatchKeys = (enName, zhName, streetCode) => {
  const keys = new Set()
  const en = normalizeStreetNameForMatch(enName)
  const zh = String(zhName ?? '').trim()
  const code = String(streetCode ?? '').trim()
  if (code) keys.add(`code:${code}`)
  if (en && zh) keys.add(`${en}|${zh}`)
  if (en) keys.add(`en:${en.toLowerCase()}`)
  if (zh) keys.add(`zh:${zh}`)
  return keys
}

export const buildRoadKey = (enName, zhName, streetCode) => {
  const en = normalizeRoadName(enName)
  const zh = normalizeRoadName(zhName)
  if (en || zh) return `${en}|${zh}`
  const code = String(streetCode ?? '').trim()
  if (code) return `code:${code}`
  return null
}

export const parseRoadKey = (key) => {
  if (!key) return { type: 'none' }
  if (key.startsWith('code:')) {
    return { type: 'code', streetCode: key.slice(5) }
  }
  const [enName = '', zhName = ''] = key.split('|')
  return { type: 'name', enName, zhName }
}

export const buildRoadFilter = (roadKey) => {
  const parsed = parseRoadKey(roadKey)
  if (parsed.type === 'code') {
    return ['==', ['to-string', ['get', 'STREETCODE']], parsed.streetCode]
  }
  if (parsed.type === 'name') {
    return [
      'all',
      ['==', ['coalesce', ['get', 'ENGLISHSTREETNAME'], ''], parsed.enName],
      ['==', ['coalesce', ['get', 'CHINESESTREETNAME'], ''], parsed.zhName],
    ]
  }
  return ['==', ['get', 'OBJECTID'], -1]
}

export const hasStreetName = (englishName, chineseName) => {
  return Boolean(normalizeRoadName(englishName) || normalizeRoadName(chineseName))
}

export const isNamedStreetFeature = (feature) => {
  const props = feature?.properties ?? {}
  return hasStreetName(props.ENGLISHSTREETNAME, props.CHINESESTREETNAME)
}

export const filterNamedStreetFeatures = (features) => {
  if (!Array.isArray(features)) return []
  return features.filter(isNamedStreetFeature)
}
