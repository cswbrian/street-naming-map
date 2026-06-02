import { parseRoadKey } from './roadKey.js'

export const ROAD_URL_PARAMS = ['en', 'zh', 'code', 'year']

export function buildRoadSearchParams({ roadKey, year }) {
  const params = new URLSearchParams()
  const parsed = parseRoadKey(roadKey)
  if (parsed.type === 'code' && parsed.streetCode) {
    params.set('code', parsed.streetCode)
  } else if (parsed.type === 'name') {
    if (parsed.enName) params.set('en', parsed.enName)
    if (parsed.zhName) params.set('zh', parsed.zhName)
  }
  if (Number.isFinite(year) && year > 0) {
    params.set('year', String(year))
  }
  return params
}

export function applyRoadParamsToSearchParams(baseParams, roadParams) {
  const next = new URLSearchParams(baseParams)
  ROAD_URL_PARAMS.forEach((key) => next.delete(key))
  roadParams.forEach((value, key) => next.set(key, value))
  return next
}

export function roadParamsMatch(currentParams, roadParams) {
  return ROAD_URL_PARAMS.every((key) => {
    const current = currentParams.get(key) ?? ''
    const next = roadParams.get(key) ?? ''
    return current === next
  })
}

export function buildRoadShareUrl({ origin, pathname, roadKey, year }) {
  const params = buildRoadSearchParams({ roadKey, year })
  const search = params.toString()
  return `${origin}${pathname}${search ? `?${search}` : ''}`
}
