/**
 * Pick the built historical map whose year is closest to the timeline year.
 * @param {import('./historicalMapTypes.js').HistoricalMapManifestEntry[]} maps
 * @param {number} selectedYear
 * @returns {string | null} map id
 */
export function suggestHistoricalMapId(maps, selectedYear) {
  if (!Array.isArray(maps) || !maps.length || !Number.isFinite(selectedYear)) {
    return null
  }

  let bestId = null
  let bestDistance = Infinity

  for (const map of maps) {
    const distance = Math.abs(map.year - selectedYear)
    if (distance < bestDistance) {
      bestDistance = distance
      bestId = map.id
    }
  }

  return bestId
}
