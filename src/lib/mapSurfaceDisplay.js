import { formatNamingDate } from './namingDisplay.js'
import { normalizeEvidenceKindForUi } from './evidenceKindBadge.js'

export const MENTION_EVIDENCE_KINDS = new Set([
  'gazette_mention',
  'legal_mention',
  'news_mention',
  'research_mention',
])

/** @param {string | null | undefined} kind */
export function isMentionEvidenceKind(kind) {
  const normalized = normalizeEvidenceKindForUi(kind)
  return normalized ? MENTION_EVIDENCE_KINDS.has(normalized) : false
}

/** Evidence kind of the event that drives map_display_date. */
export function resolveMapDisplayEvidenceKind(namingDetails) {
  if (!namingDetails) return null
  const explicit = normalizeEvidenceKindForUi(namingDetails.map_display_evidence_kind)
  if (explicit) return explicit

  const mapDate = String(namingDetails.map_display_date ?? '').trim()
  if (!mapDate || !Array.isArray(namingDetails.name_history)) return null

  const row = namingDetails.name_history.find((entry) => String(entry.date ?? '').trim() === mapDate)
  return normalizeEvidenceKindForUi(row?.evidence_kind)
}

/** @param {string | null | undefined} yearSource */
export function getMapYearAttestationSuffix(yearSource, t) {
  if (yearSource === 'attestation') {
    return t?.('mapYearSuffixAttestation') ?? '·提及'
  }
  return ''
}

/**
 * Formatted map-year date for table / chip header (optional attestation suffix).
 * @param {{ naming_date?: string | null, naming_year?: number | null, naming_details?: Record<string, unknown> | null }} row
 * @param {(key: string) => string} t
 */
export function getMapSurfaceDateDisplay(row, t) {
  const details = row?.naming_details
  const mapDate =
    String(details?.map_display_date ?? '').trim() || String(row?.naming_date ?? '').trim() || null
  const formatted = formatNamingDate(mapDate)
  if (!formatted) {
    if (row?.naming_year !== null && row?.naming_year !== undefined && row?.naming_year !== '') {
      const year = String(row.naming_year)
      const suffix = getMapYearAttestationSuffix(details?.map_year_source, t)
      return `${year}${suffix}`
    }
    return t?.('pending') ?? null
  }
  const suffix = getMapYearAttestationSuffix(details?.map_year_source, t)
  return `${formatted}${suffix}`
}

/**
 * @param {Record<string, unknown> | null | undefined} entry
 * @param {Record<string, string>} labels
 * @param {unknown[] | null | undefined} ordered
 */
export function getMapSurfaceEventTypeLabel(entry, labels, ordered = []) {
  if (!entry) return null

  const role = String(entry.event_role ?? '').trim()
  const kind = String(entry.change_kind ?? '').trim()
  const evidenceKind = String(entry.evidence_kind ?? '').trim()

  if (role === 'built') return labels.eventTypeBuilt ?? labels.eventRoleBuilt ?? null
  if (role === 'name_removed') return labels.eventTypeNameRemoved ?? labels.eventRoleNameRemoved ?? null
  if (kind === 'extend') return labels.eventTypeExtend ?? null

  if (isMentionEvidenceKind(evidenceKind)) {
    return labels.eventTypeEarliestMention ?? null
  }

  if (role === 'current_name' && entry.is_declaration_event === false) {
    if (kind === 'rename') return labels.eventTypeRenamePending ?? labels.eventTypeRename ?? null
    if (kind === 'declare' || kind === 'rename') {
      return labels.eventTypeNamingPending ?? labels.eventTypeCurrentName ?? null
    }
  }

  if (role === 'current_name') {
    const hasOther = ordered.some((other) => other !== entry)
    if (kind === 'rename' && hasOther) return labels.eventTypeRename ?? null
    return labels.eventTypeCurrentName ?? labels.eventRoleCurrentName ?? null
  }

  if (role === 'former_name') return labels.eventTypeFormerName ?? labels.eventRoleFormerName ?? null
  if (kind === 'rename') return labels.eventTypeRename ?? null

  return labels.eventTypeFormerName ?? labels.eventRoleFormerName ?? null
}
