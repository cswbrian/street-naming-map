const EVIDENCE_BADGE_KEYS = {
  gazette_primary: 'evidenceGazettePrimary',
  gazette_inferred: 'evidenceGazetteInferred',
  gazette_mention: 'evidenceGazetteMention',
  legal_other: 'evidenceLegalOther',
  legal_mention: 'evidenceLegalMention',
  research: 'evidenceResearch',
  research_mention: 'evidenceResearchMention',
  news: 'evidenceNews',
  news_mention: 'evidenceNewsMention',
  hearsay: 'evidenceHearsay',
  unknown: 'evidenceUnknown',
  other: 'evidenceOther',
}

/** Display order for evidence badges in tables / map (all kinds). */
export const EVIDENCE_KIND_ORDER = [
  'gazette_primary',
  'gazette_inferred',
  'gazette_mention',
  'legal_other',
  'legal_mention',
  'research',
  'research_mention',
  'news',
  'news_mention',
  'hearsay',
  'unknown',
  'other',
]

/** Dashboard filter chips — gazette primary and inferred only. */
export const EVIDENCE_FILTER_KIND_ORDER = ['gazette_primary', 'gazette_inferred']

export const EVIDENCE_FILTER_NONE = 'none'

/** @param {string | null | undefined} kind */
export function normalizeEvidenceKindForUi(kind) {
  const text = String(kind ?? '').trim().toLowerCase()
  return EVIDENCE_BADGE_KEYS[text] ? text : null
}

/**
 * @param {string | null | undefined} kind
 * @param {(key: string) => string} t
 */
export function getEvidenceKindBadge(kind, t) {
  const normalized = normalizeEvidenceKindForUi(kind)
  if (!normalized) return null
  const key = EVIDENCE_BADGE_KEYS[normalized]
  return {
    kind: normalized,
    label: t(key),
    hint: t(`${key}Hint`),
  }
}

/** URL / UI evidence filter param (dashboard chips only). */
export function isEvidenceFilterId(value) {
  const text = String(value ?? '').trim().toLowerCase()
  return EVIDENCE_FILTER_KIND_ORDER.includes(text)
}

export function resolveDisplayEvidenceKind(namingDetails) {
  if (!namingDetails) return null
  const mapKind = normalizeEvidenceKindForUi(namingDetails.map_display_evidence_kind)
  if (mapKind) return mapKind

  const mapDate = String(namingDetails.map_display_date ?? '').trim()
  if (mapDate && Array.isArray(namingDetails.name_history)) {
    const mapRow = namingDetails.name_history.find(
      (entry) => String(entry.date ?? '').trim() === mapDate,
    )
    const rowKind = normalizeEvidenceKindForUi(mapRow?.evidence_kind)
    if (rowKind) return rowKind
  }

  const canonical = normalizeEvidenceKindForUi(
    namingDetails.canonical_evidence_kind ?? namingDetails.evidence_kind,
  )
  if (canonical) return canonical
  const history = namingDetails.name_history
  if (!Array.isArray(history)) return null
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const kind = normalizeEvidenceKindForUi(history[i]?.evidence_kind)
    if (kind) return kind
  }
  return null
}
