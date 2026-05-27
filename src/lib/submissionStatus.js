import { buildStreetMatchKeys } from './roadKey.js'

export function hasNamingYear(row) {
  const raw = row?.naming_year
  if (raw === null || raw === undefined || raw === '') return false
  const year = Number(raw)
  return Number.isFinite(year)
}

/** Show Submit proof whenever the street has no naming year on the map (repeat submissions allowed). */
export function canSubmitProof(row) {
  return !hasNamingYear(row)
}

/** Build lookup keys from recently-verified.json (maintained on crowd import). */
export function buildRecentlyVerifiedIndex(streets = []) {
  const index = new Set()
  for (const street of streets) {
    for (const key of buildStreetMatchKeys(
      street.street_name_en,
      street.street_name_zh,
      street.street_code,
    )) {
      index.add(key)
    }
  }
  return index
}

export function matchesRecentlyVerifiedIndex(row, index) {
  if (!index?.size) return false
  for (const key of buildStreetMatchKeys(row.english_name, row.chinese_name, row.street_code)) {
    if (index.has(key)) return true
  }
  const streetKey = row.naming_details?.street_key
  if (streetKey && index.has(streetKey)) return true
  return false
}

export function isRecentlyVerified(row, recentlyVerifiedIndex) {
  return matchesRecentlyVerifiedIndex(row, recentlyVerifiedIndex)
}

/** Public UI: only show Verified after maintainer approval (optional badge before map merge). */
export function getDisplayBadge(trackerEntry) {
  if (trackerEntry?.status === 'approved') return 'verified'
  return null
}
