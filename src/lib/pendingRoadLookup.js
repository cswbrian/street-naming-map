import { buildStreetMatchKeys } from './roadKey.js'

export function buildPendingRoadLookup(roads = []) {
  const lookup = new Map()
  for (const row of roads) {
    const keys = new Set([
      row?.road_key,
      row?.naming_details?.street_key,
      ...buildStreetMatchKeys(row?.english_name, row?.chinese_name, row?.street_code),
    ])
    for (const key of keys) {
      if (key) lookup.set(key, row)
    }
  }
  return lookup
}

export function resolvePendingRoadRow({ lookup, roadKey, enName, zhName, streetCode }) {
  if (!lookup?.size) return null
  const keys = [roadKey, ...buildStreetMatchKeys(enName, zhName, streetCode)]
  for (const key of keys) {
    if (key && lookup.has(key)) return lookup.get(key)
  }
  return null
}
