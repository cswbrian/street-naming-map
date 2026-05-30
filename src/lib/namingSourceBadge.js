import { hasNamingYear } from './submissionStatus.js'

const CROWD_SOURCE = 'crowdsubmitted'
const HKGRO_SOURCE = 'hkgro'

/** @returns {'hkgro' | 'crowdsourced' | 'unverified' | null} */
export function getNamingSourceKind(row) {
  const source = String(row?.naming_source ?? '').trim().toLowerCase()
  if (source === HKGRO_SOURCE) return 'hkgro'
  if (source === CROWD_SOURCE) return 'crowdsourced'
  if (hasNamingYear(row) || String(row?.naming_date ?? '').trim()) return 'unverified'
  return null
}

export function getNamingSourceBadgeKey(kind) {
  if (kind === 'hkgro') return 'sourceHkgro'
  if (kind === 'crowdsourced') return 'sourceCrowdsourced'
  if (kind === 'unverified') return 'sourceUnverified'
  return null
}
