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

/** Public UI: only show Verified after maintainer approval (optional badge before map merge). */
export function getDisplayBadge(trackerEntry) {
  if (trackerEntry?.status === 'approved') return 'verified'
  return null
}
