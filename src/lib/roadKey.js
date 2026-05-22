export const normalizeRoadName = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const lowered = text.toLowerCase()
  if (['null', 'undefined', 'n/a', 'na', '-', '--'].includes(lowered)) {
    return ''
  }
  return text
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
