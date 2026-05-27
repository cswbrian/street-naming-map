import { hasNamingYear } from './submissionStatus.js'

const CROWD_SOURCE = 'crowdsubmitted'

/** @returns {'crowdsourced' | 'unverified' | null} */
export function getNamingSourceKind(row) {
  const source = String(row?.naming_source ?? '').trim().toLowerCase()
  if (source === CROWD_SOURCE) return 'crowdsourced'
  if (hasNamingYear(row) || String(row?.naming_date ?? '').trim()) return 'unverified'
  return null
}

export function getNamingSourceBadgeKey(kind) {
  if (kind === 'crowdsourced') return 'sourceCrowdsourced'
  if (kind === 'unverified') return 'sourceUnverified'
  return null
}
