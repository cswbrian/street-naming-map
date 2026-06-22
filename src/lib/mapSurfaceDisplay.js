import { formatNamingDate } from './namingDisplay.js'
import { isMentionEvidenceKind, normalizeEvidenceKindForUi } from './evidenceKindBadge.js'

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

/** Stable id for timeline event-type filters (locale-independent). */
export function getTimelineEventTypeKey(entry, ordered = []) {
  if (!entry) return null

  const role = String(entry.event_role ?? '').trim()
  const kind = String(entry.change_kind ?? '').trim()
  const evidenceKind = String(entry.evidence_kind ?? '').trim()

  if (role === 'built') return 'built'
  if (role === 'name_removed') return 'name_removed'
  if (kind === 'extend') return 'extend'

  if (isMentionEvidenceKind(evidenceKind)) {
    return 'earliest_mention'
  }

  if (role === 'current_name') {
    const hasOther = ordered.some((other) => other !== entry)
    if (kind === 'rename' && hasOther) return 'rename'
    return 'declare'
  }

  if (role === 'former_name') return 'former_name'
  if (kind === 'rename') return 'rename'

  return 'former_name'
}

export const TIMELINE_EVENT_TYPE_FILTER_ORDER = [
  'declare',
  'rename',
  'former_name',
  'earliest_mention',
  'built',
  'extend',
  'name_removed',
]

/** UI label for a timeline event-type filter key. */
export function getEventTypeLabelForKey(key, labels) {
  if (!key || !labels) return null
  const byKey = {
    built: labels.eventTypeBuilt,
    name_removed: labels.eventTypeNameRemoved,
    extend: labels.eventTypeExtend,
    earliest_mention: labels.eventTypeEarliestMention,
    rename: labels.eventTypeRename,
    declare: labels.eventTypeDeclare,
    former_name: labels.eventTypeFormerName,
  }
  return byKey[key] ?? null
}

/** Localized timeline event-type pill from a name_history row. */
export function getTimelineEventTypeLabel(entry, labels, ordered = []) {
  return getEventTypeLabelForKey(getTimelineEventTypeKey(entry, ordered), labels)
}
