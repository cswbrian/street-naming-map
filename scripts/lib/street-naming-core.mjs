import {
  normalizeGazetteLocation,
  planLabelsFromGazetteLocation,
} from './gazette-location.mjs'

export const DECLARATION_PATTERNS = [
  /declaration of street name/i,
  /宣布街道名稱/,
]

export const NOTICE_TYPE_PATTERNS = [
  { id: 'declaration', en: /declaration of street name/i, tc: /宣布街道名稱/ },
  { id: 'replace_description', en: /replacing description of street/i, tc: /取代街道說明/ },
  {
    id: 'notice_intention_change',
    en: /notice of intention to change street name/i,
    tc: /擬更改街道名稱公告/,
  },
  {
    id: 'declaration_change',
    en: /declaration to change street name/i,
    tc: /宣布更改街道名稱/,
  },
  {
    id: 'declaration_delete',
    en: /declaration to delete street name/i,
    tc: /宣布删除街道名稱/,
  },
  { id: 'corrigendum', en: /corrigendum/i, tc: /更正|勘誤/ },
]

export function normalizeStreetName(name) {
  const value = String(name ?? '').trim()
  if (!value) return ''
  if (/^[A-Z0-9\s\-'.]+$/.test(value) && /[A-Z]{2,}/.test(value)) {
    return value
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
  return value
}

export function normalizeNoticeNo(raw) {
  const value = String(raw ?? '').replace(/\s+/g, '').toUpperCase()
  const match = value.match(/(?:G\.N\.?|第)?(\d+)/)
  return match ? `GN${match[1]}` : value
}

/** Extract numeric notice id from G.N. / 第…號 / plain digits. */
export function extractNoticeNumber(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  const compact = value.replace(/\s+/g, '')
  if (/^\d+$/.test(compact)) return compact
  const match = value.match(/(?:G\.?\s*N\.?\s*|第\s*)?(\d+)/i)
  return match?.[1] ?? null
}

/**
 * When submitters enter digits only (e.g. "323"), emit LandsD-style bilingual labels.
 * EN: G.N.323 — ZH: 第323號
 */
export function formatGovernmentNoticeLabels(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return { en: null, zh: null }

  const compact = value.replace(/\s+/g, '')
  const digitsOnly = /^\d+$/.test(compact)
  const num = extractNoticeNumber(value)
  if (!num) return { en: value, zh: value }

  if (digitsOnly) {
    return { en: `G.N.${num}`, zh: `第${num}號` }
  }

  const hasEnGn = /G\.?\s*N\.?/i.test(value)
  const hasZhDih = /第/.test(value)
  return {
    en: hasEnGn ? value.replace(/\s+/g, '') : `G.N.${num}`,
    zh: hasZhDih ? value : `第${num}號`,
  }
}

/** Pre-2016 eGazette category header for section 111C street-naming declarations. */
const LEGACY_DECLARATION_HEADER_EN = /^(STREET NAMES?|street naming|Street Name)$/i

function isLegacyStreetNamingDeclaration(noticeTypeEn, noticeTypeTc) {
  const en = String(noticeTypeEn ?? '').trim()
  const tc = String(noticeTypeTc ?? '').trim()
  if (!en || !tc || !/街道命名/.test(tc)) return false
  return LEGACY_DECLARATION_HEADER_EN.test(en)
}

export function normalizeNoticeType(noticeTypeEn, noticeTypeTc) {
  for (const pattern of NOTICE_TYPE_PATTERNS) {
    if (
      (noticeTypeEn && pattern.en.test(noticeTypeEn)) ||
      (noticeTypeTc && pattern.tc.test(noticeTypeTc))
    ) {
      return pattern.id
    }
  }
  if (isLegacyStreetNamingDeclaration(noticeTypeEn, noticeTypeTc)) return 'declaration'
  return 'other'
}

export function isDeclarationEvent(noticeTypeEn, noticeTypeTc) {
  if (
    DECLARATION_PATTERNS.some(
      (pattern) =>
        (noticeTypeEn && pattern.test(noticeTypeEn)) ||
        (noticeTypeTc && pattern.test(noticeTypeTc)),
    )
  ) {
    return true
  }
  return isLegacyStreetNamingDeclaration(noticeTypeEn, noticeTypeTc)
}

export function classifyEgazetteEvent(event) {
  const noticeTypeEn = event.notice_type_raw_en ?? null
  const noticeTypeTc = event.notice_type_raw_zh ?? null
  const isDecl = isDeclarationEvent(noticeTypeEn, noticeTypeTc)
  return {
    ...event,
    notice_type_normalized: isDecl ? 'declaration' : normalizeNoticeType(noticeTypeEn, noticeTypeTc),
    is_declaration_event: isDecl,
  }
}

export function makeStreetKey(streetNameEn, streetNameZh) {
  return `${normalizeStreetName(streetNameEn)}|${String(streetNameZh ?? '').trim()}`
}

export const CHANGE_KINDS = new Set(['declare', 'rename', 'delete', 'extend'])
export const EVIDENCE_LEVELS = new Set(['gazette', 'historical'])

export const EVIDENCE_KINDS = new Set([
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
])

/** Earliest-document attestation rows (XX提及) — drive map year when present. */
export const ATTESTATION_EVIDENCE_KINDS = new Set([
  'gazette_mention',
  'legal_mention',
  'news_mention',
  'research_mention',
])

/** Badge / sort strength (higher = stronger). */
export const EVIDENCE_KIND_STRENGTH = {
  gazette_primary: 70,
  gazette_inferred: 60,
  gazette_mention: 55,
  legal_other: 50,
  legal_mention: 52,
  research: 45,
  research_mention: 44,
  news: 40,
  news_mention: 41,
  hearsay: 30,
  unknown: 20,
  other: 10,
}

export function isAttestationEvidenceKind(kind) {
  const normalized = normalizeEvidenceKind(kind)
  return normalized ? ATTESTATION_EVIDENCE_KINDS.has(normalized) : false
}

function isAttestationEvent(event) {
  if (!isAttestationEvidenceKind(event?.evidence_kind)) return false
  if (normalizeChangeKind(event.change_kind) === 'extend') return false
  return Boolean(String(event.publication_date ?? '').trim())
}

function isCanonicalDeclarationEvent(event, displayNames = {}) {
  const kind = normalizeChangeKind(event.change_kind)
  if (kind === 'rename' || kind === 'delete' || kind === 'extend') return false
  if (event.is_declaration_event === false) return false
  if (kind !== 'declare' && event.is_declaration_event !== true) return false
  return isCurrentNameEvent(event, displayNames)
}

const SUPPLEMENTARY_SUPPORTS = new Set([
  'publication_date',
  'street_name_zh',
  'street_name_en',
  'previous_street_name_zh',
  'previous_street_name_en',
])

export function normalizeSupplementaryEvidence(raw) {
  if (!Array.isArray(raw) || !raw.length) return null
  const entries = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const supports = Array.isArray(item.supports)
        ? [...new Set(item.supports.map((value) => String(value ?? '').trim()).filter(Boolean))].filter(
            (value) => SUPPLEMENTARY_SUPPORTS.has(value),
          )
        : []
      if (!supports.length) return null
      return {
        evidence_kind: normalizeEvidenceKind(item.evidence_kind) ?? 'research',
        publisher: item.publisher ?? null,
        publisher_zh: item.publisher_zh ?? null,
        document_label: item.document_label ?? null,
        document_url: item.document_url ?? null,
        supports,
        note: item.note ?? null,
        notice_label: item.notice_label ?? null,
        publication_date: item.publication_date ?? null,
        government_notice_url_en: item.government_notice_url_en ?? null,
        government_notice_url_zh: item.government_notice_url_zh ?? null,
      }
    })
    .filter(Boolean)
  return entries.length ? entries : null
}

/** UX role: what this event means for the map vs history list. */
export const EVENT_ROLES = new Set([
  'current_name',
  'former_name',
  'built',
  'name_removed',
])

export function normalizeEventRole(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (EVENT_ROLES.has(text)) return text
  return null
}

export function isCurrentNameEvent(event, displayNames = {}) {
  const role = normalizeEventRole(event?.event_role)
  if (role === 'current_name') return true
  if (role === 'former_name' || role === 'built' || role === 'name_removed') return false
  return namesMatchNormalized(event, displayNames.en, displayNames.zh)
}

/** Infer event_role from change_kind and whether after-names match geojson / display names. */
export function resolveEventRole(event, displayNames = {}) {
  const explicit = normalizeEventRole(event?.event_role)
  if (explicit) return explicit

  const changeKind = normalizeChangeKind(event?.change_kind)
  if (changeKind === 'delete') return 'name_removed'

  const matchesCurrent = namesMatchNormalized(event, displayNames.en, displayNames.zh)
  if (changeKind === 'rename') return matchesCurrent ? 'current_name' : 'former_name'
  if (changeKind === 'extend') return matchesCurrent ? 'current_name' : 'former_name'
  if (changeKind === 'declare' || event?.is_declaration_event) {
    return matchesCurrent ? 'current_name' : 'former_name'
  }
  return matchesCurrent ? 'current_name' : 'former_name'
}

export function normalizeChangeKind(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (CHANGE_KINDS.has(text)) return text
  return null
}

export function normalizeEvidenceLevel(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (EVIDENCE_LEVELS.has(text)) return text
  if (!text && value === undefined) return null
  return text || null
}

export function normalizeEvidenceKind(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (EVIDENCE_KINDS.has(text)) return text
  return null
}

export function evidenceLevelFromKind(kind) {
  if (kind === 'gazette_primary') return 'gazette'
  if (kind) return 'historical'
  return null
}

export function normalizeDerivedFrom(raw) {
  if (!Array.isArray(raw) || !raw.length) return null
  const entries = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const kind = String(item.kind ?? 'gazette_citation').trim() || 'gazette_citation'
      return {
        kind,
        notice_label: item.notice_label ?? null,
        publication_date: item.publication_date ?? null,
        government_notice_url_en: item.government_notice_url_en ?? null,
        government_notice_url_zh: item.government_notice_url_zh ?? null,
        cited_notice_label: item.cited_notice_label ?? null,
        cited_publication_date: item.cited_publication_date ?? null,
      }
    })
    .filter(Boolean)
  return entries.length ? entries : null
}

/** Resolve evidence_kind from explicit field or legacy evidence_level + URLs. */
export function resolveEvidenceKind(raw = {}) {
  const explicit = normalizeEvidenceKind(raw.evidence_kind)
  if (explicit) return explicit

  const level = normalizeEvidenceLevel(raw.evidence_level)
  const hasUrl = Boolean(
    raw.government_notice_url_en || raw.government_notice_url_zh || raw.gazette_url,
  )

  if (level === 'gazette' || (hasUrl && level !== 'historical')) return 'gazette_primary'
  if (level === 'historical') return 'unknown'
  if (hasUrl) return 'gazette_primary'
  return null
}

export function enrichEventWithEvidenceKind(event) {
  if (!event) return event
  const kind = resolveEvidenceKind(event) ?? 'unknown'
  const { evidence_level: _legacyLevel, proof_pdf_url: _legacyProof, street_code: _legacyCode, ...rest } =
    event
  return {
    ...rest,
    evidence_kind: kind,
    derived_from: normalizeDerivedFrom(event.derived_from) ?? event.derived_from ?? null,
    evidence_kind_note: event.evidence_kind_note ?? null,
    supplementary_evidence:
      normalizeSupplementaryEvidence(event.supplementary_evidence) ?? event.supplementary_evidence ?? null,
  }
}

/** Evidence + event_role (pass displayNames from geojson or latest timeline names). */
export function enrichEvent(event, displayNames = null) {
  if (!event) return event
  const withEvidence = enrichEventWithEvidenceKind(event)
  const display = displayNames ?? { en: null, zh: null }
  return {
    ...withEvidence,
    event_role: resolveEventRole(withEvidence, display),
  }
}

/** Event that supplies canonical_naming_date for the aggregate. */
export function pickCanonicalEvidenceEvent(ordered, canonicalDate, derivationReason, displayNames = {}) {
  if (!canonicalDate || !ordered?.length) return null
  const sameDate = ordered.filter((event) => event.publication_date === canonicalDate)
  if (!sameDate.length) return ordered[ordered.length - 1] ?? null
  if (sameDate.length === 1) return sameDate[0]

  const currentOnDate = sameDate.filter((event) => normalizeEventRole(event.event_role) === 'current_name')
  if (currentOnDate.length === 1) return currentOnDate[0]

  if (derivationReason === 'current_name_since') {
    const rename = sameDate.find(
      (event) =>
        normalizeChangeKind(event.change_kind) === 'rename' &&
        isCurrentNameEvent(event, displayNames),
    )
    if (rename) return rename
  }

  const declaration = sameDate.find((event) => isCanonicalDeclarationEvent(event, displayNames))
  if (declaration) return declaration
  return sameDate[sameDate.length - 1]
}

/** Stable key for grouping all events on one road centreline. */
export function eventAggregateKey(event) {
  const code = String(event.street_code ?? '').trim()
  if (code) return `code:${code}`
  return makeStreetKey(event.street_name_en, event.street_name_zh)
}

export function eventDedupeKey(event) {
  const identity = eventAggregateKey(event)
  const kind = normalizeChangeKind(event.change_kind) ?? 'event'
  const prev = makeStreetKey(event.previous_street_name_en, event.previous_street_name_zh)
  return `${identity}|${event.publication_date}|${event.notice_no ?? ''}|${kind}|${prev}`
}

function namesMatchNormalized(event, en, zh) {
  const eventEn = normalizeStreetName(event?.street_name_en)
  const eventZh = String(event?.street_name_zh ?? '').trim()
  const targetEn = normalizeStreetName(en)
  const targetZh = String(zh ?? '').trim()
  if (targetEn && eventEn && targetEn === eventEn) return true
  if (targetZh && eventZh && targetZh === eventZh) return true
  return false
}

export function buildNameHistory(events) {
  const ordered = [...events].toSorted((a, b) =>
    String(a.publication_date ?? '').localeCompare(String(b.publication_date ?? '')),
  )
  return ordered.map((event) => ({
    date: event.publication_date ?? null,
    change_kind: normalizeChangeKind(event.change_kind) ?? (event.is_declaration_event ? 'declare' : 'other'),
    name_en: event.street_name_en ?? null,
    name_zh: event.street_name_zh ?? null,
    previous_name_en: event.previous_street_name_en ?? null,
    previous_name_zh: event.previous_street_name_zh ?? null,
    notice_label_en: event.government_notice_label_en ?? null,
    notice_label_zh: event.government_notice_label_zh ?? null,
    notice_url_en: event.government_notice_url_en ?? null,
    notice_url_zh: event.government_notice_url_zh ?? null,
    evidence_kind: event.evidence_kind ?? resolveEvidenceKind(event),
    is_declaration_event: event.is_declaration_event ?? null,
    event_role: event.event_role ?? null,
    derived_from: normalizeDerivedFrom(event.derived_from),
    evidence_kind_note: event.evidence_kind_note ?? null,
    supplementary_evidence: normalizeSupplementaryEvidence(event.supplementary_evidence),
    source: event.source ?? null,
    submitter_remarks: event.submitter_remarks ?? null,
  }))
}

function pickEarliestBuiltDate(ordered) {
  const built = ordered.find((event) => normalizeEventRole(event.event_role) === 'built')
  return built?.publication_date ?? null
}

function pickEarliestAttestation(ordered) {
  const attestation = ordered.find((event) => isAttestationEvent(event))
  if (!attestation) return { date: null, event: null }
  return { date: attestation.publication_date ?? null, event: attestation }
}

function isGazetteDocumentaryEvent(event) {
  if (event?.is_declaration_event === false) return false
  const kind = normalizeEvidenceKind(event?.evidence_kind)
  if (kind !== 'gazette_primary' && kind !== 'gazette_inferred') return false
  if (normalizeChangeKind(event.change_kind) === 'extend') return false
  return Boolean(String(event.publication_date ?? '').trim())
}

function pickEarliestGazetteDocument(ordered) {
  const documentary = ordered.find((event) => isGazetteDocumentaryEvent(event))
  if (!documentary) return { date: null, event: null }
  return { date: documentary.publication_date ?? null, event: documentary }
}

function deriveAggregateNaming(ordered, displayNames = {}) {
  const renames = ordered.filter((event) => normalizeChangeKind(event.change_kind) === 'rename')
  const currentRename = [...renames]
    .reverse()
    .find((event) => isCurrentNameEvent(event, displayNames) && event.is_declaration_event !== false)
  const currentNameSince = currentRename?.publication_date ?? null
  const earliestDeclaration = ordered.find((event) => isCanonicalDeclarationEvent(event, displayNames))
  const earliestExtension = ordered.find((event) => {
    const kind = normalizeChangeKind(event.change_kind)
    return kind === 'extend' && isCurrentNameEvent(event, displayNames)
  })
  const firstEvent = ordered[0] ?? null
  let canonicalDate = currentNameSince ?? earliestDeclaration?.publication_date ?? null
  let derivationReason = 'no_current_name_event'
  if (currentNameSince) derivationReason = 'current_name_since'
  else if (earliestDeclaration) derivationReason = 'declaration_earliest'
  else if (earliestExtension) {
    canonicalDate = earliestExtension.publication_date ?? null
    derivationReason = 'extension_earliest'
  }

  const builtDate = pickEarliestBuiltDate(ordered)
  const attestation = pickEarliestAttestation(ordered)
  const attestationDate = attestation.date
  const gazetteDocument = pickEarliestGazetteDocument(ordered)
  const gazetteDocumentDate = gazetteDocument.date
  const mapDisplayDate = builtDate ?? attestationDate ?? gazetteDocumentDate ?? canonicalDate
  let mapDerivationReason = 'no_date'
  let mapYearSource = null
  if (builtDate) {
    mapDerivationReason = 'built_earliest'
    mapYearSource = 'built'
  } else if (attestationDate) {
    mapDerivationReason = 'attestation_earliest'
    mapYearSource = 'attestation'
  } else if (gazetteDocumentDate) {
    mapDerivationReason = 'gazette_document_earliest'
    mapYearSource = 'gazette_document'
  } else if (canonicalDate) {
    mapDerivationReason = 'naming_canonical'
    mapYearSource = 'naming'
  }

  let mapDisplayEvent = null
  if (builtDate) {
    mapDisplayEvent =
      ordered.find((event) => normalizeEventRole(event.event_role) === 'built') ?? null
  } else if (attestationDate) {
    mapDisplayEvent = attestation.event
  } else if (gazetteDocumentDate) {
    mapDisplayEvent = gazetteDocument.event
  } else if (canonicalDate) {
    mapDisplayEvent = pickCanonicalEvidenceEvent(
      ordered,
      canonicalDate,
      derivationReason,
      displayNames,
    )
  }

  return {
    canonical_naming_date: canonicalDate,
    canonical_naming_year: canonicalDate ? Number(canonicalDate.slice(0, 4)) : null,
    current_name_since_date: currentNameSince,
    first_known_naming_date: firstEvent?.publication_date ?? null,
    earliest_attestation_date: attestationDate,
    earliest_attestation_year: attestationDate ? Number(attestationDate.slice(0, 4)) : null,
    earliest_attestation_event_id: attestation.event?.event_id ?? null,
    earliest_gazette_document_date: gazetteDocumentDate,
    earliest_gazette_document_year: gazetteDocumentDate ? Number(gazetteDocumentDate.slice(0, 4)) : null,
    earliest_gazette_document_event_id: gazetteDocument.event?.event_id ?? null,
    derivation_reason: derivationReason,
    map_display_date: mapDisplayDate,
    map_display_year: mapDisplayDate ? Number(mapDisplayDate.slice(0, 4)) : null,
    map_year_source: mapYearSource,
    map_derivation_reason: mapDerivationReason,
    map_display_event_id: mapDisplayEvent?.event_id ?? null,
    map_display_evidence_kind: mapDisplayEvent?.evidence_kind ?? null,
  }
}

function pickDisplayNames(ordered) {
  const latest = ordered[ordered.length - 1]
  return {
    en: latest?.street_name_en ?? null,
    zh: latest?.street_name_zh ?? null,
  }
}

export function groupBy(items, keyFn) {
  const map = new Map()
  for (const item of items) {
    const key = keyFn(item)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  }
  return map
}

export function normalizeNamingDateExclusions(raw) {
  return {
    streetKeys: new Set(raw?.street_keys ?? []),
    streetCodes: new Set((raw?.street_codes ?? []).map(String)),
    eventIds: new Set(raw?.event_ids ?? []),
  }
}

/** Drop eGazette (or other) events excluded in data/naming-date-exclusions.json */
export function filterExcludedEvents(events, exclusions) {
  const eventIds = exclusions?.eventIds
  if (!eventIds?.size) return events
  return events.filter((event) => !eventIds.has(event.event_id))
}

function isExcludedStreetKey(streetKey, exclusions) {
  return exclusions?.streetKeys?.has(streetKey) ?? false
}

export function aggregateByStreet(events, options = {}) {
  const exclusions = options.namingDateExclusions ?? null
  const grouped = groupBy(events, (item) => eventAggregateKey(item))
  const aggregates = []

  for (const [aggregateKey, group] of grouped.entries()) {
    if (aggregateKey === '|' || aggregateKey === 'code:') continue
    const orderedRaw = group.toSorted((a, b) =>
      String(a.publication_date ?? '').localeCompare(String(b.publication_date ?? '')),
    )
    const streetCode = String(
      orderedRaw.find((event) => String(event.street_code ?? '').trim())?.street_code ?? '',
    ).trim()
    const display = pickDisplayNames(orderedRaw)
    const ordered = orderedRaw.map((event) => enrichEvent(event, display))
    const derived = deriveAggregateNaming(ordered, display)
    const canonicalEvent = pickCanonicalEvidenceEvent(
      ordered,
      derived.canonical_naming_date,
      derived.derivation_reason,
      display,
    )
    let canonicalNamingDate = derived.canonical_naming_date
    let canonicalNamingYear = derived.canonical_naming_year
    let derivationReason = derived.derivation_reason
    let mapDisplayDate = derived.map_display_date
    let mapDisplayYear = derived.map_display_year
    let mapYearSource = derived.map_year_source
    let mapDerivationReason = derived.map_derivation_reason
    if (!canonicalNamingDate && !ordered.some((event) => event.is_declaration_event)) {
      derivationReason = 'no_declaration_found'
    }
    const legacyStreetKey = makeStreetKey(display.en, display.zh)
    if (isExcludedStreetKey(legacyStreetKey, exclusions)) {
      canonicalNamingDate = null
      canonicalNamingYear = null
      derivationReason = 'excluded_manual'
      mapDisplayDate = null
      mapDisplayYear = null
      mapYearSource = null
      mapDerivationReason = 'excluded_manual'
    }

    aggregates.push({
      street_key: streetCode ? `code:${streetCode}` : legacyStreetKey,
      street_code: streetCode || null,
      street_name_en: display.en || null,
      street_name_zh: display.zh || null,
      canonical_naming_date: canonicalNamingDate,
      canonical_naming_year: canonicalNamingYear,
      current_name_since_date: derived.current_name_since_date,
      first_known_naming_date: derived.first_known_naming_date,
      earliest_attestation_date: derived.earliest_attestation_date,
      earliest_attestation_year: derived.earliest_attestation_year,
      earliest_attestation_event_id: derived.earliest_attestation_event_id,
      earliest_gazette_document_date: derived.earliest_gazette_document_date,
      earliest_gazette_document_year: derived.earliest_gazette_document_year,
      earliest_gazette_document_event_id: derived.earliest_gazette_document_event_id,
      derivation_reason: derivationReason,
      map_display_date: mapDisplayDate,
      map_display_year: mapDisplayYear,
      map_year_source: mapYearSource,
      map_derivation_reason: mapDerivationReason,
      map_display_event_id: derived.map_display_event_id,
      map_display_evidence_kind: derived.map_display_evidence_kind,
      canonical_evidence_kind: canonicalEvent?.evidence_kind ?? null,
      canonical_evidence_event_id: canonicalEvent?.event_id ?? null,
      canonical_event_role: canonicalEvent?.event_role ?? null,
      name_history: buildNameHistory(ordered),
      event_history: ordered,
      event_count: ordered.length,
    })
  }

  return aggregates
}

/**
 * Group events using centreline map links first, then legacy name/code grouping for remainder.
 */
export function aggregateByCentrelineMap(events, centrelineMap, options = {}) {
  const links = centrelineMap?.links ?? []
  if (!links.length) {
    return aggregateByStreet(events, options)
  }

  const eventById = new Map(
    events.map((event) => [String(event.event_id ?? '').trim(), event]).filter(([id]) => id),
  )
  const assignedEventIds = new Set()
  const mapAggregates = []

  for (const link of links) {
    if (link.status !== 'active') continue
    const code = String(link.street_code ?? '').trim()
    if (!code) continue

    const groupEvents = []
    for (const eventId of link.event_ids ?? []) {
      const event = eventById.get(String(eventId).trim())
      if (event && !assignedEventIds.has(event.event_id)) {
        groupEvents.push(event)
        assignedEventIds.add(event.event_id)
      }
    }
    if (!groupEvents.length) continue

    const withCode = groupEvents.map((event) =>
      String(event.street_code ?? '').trim() ? event : { ...event, street_code: code },
    )
    const [aggregate] = aggregateByStreet(withCode, options)
    if (aggregate) {
      mapAggregates.push({
        ...aggregate,
        street_key: `code:${code}`,
        street_code: code,
        timeline_id: link.timeline_id,
      })
    }
  }

  const remainder = events.filter((event) => !assignedEventIds.has(event.event_id))
  const legacyAggregates = aggregateByStreet(remainder, options)
  const mappedCodes = new Set(mapAggregates.map((a) => String(a.street_code ?? '').trim()).filter(Boolean))

  const filteredLegacy = legacyAggregates.filter((agg) => {
    const code = String(agg.street_code ?? '').trim()
    if (code && mappedCodes.has(code)) return false
    return true
  })

  return [...mapAggregates, ...filteredLegacy]
}

export function resolveNamingSource(aggregate, options = {}) {
  const history = aggregate?.event_history ?? []
  const sources = new Set(history.map((e) => e.source).filter(Boolean))
  const hasHkgro = sources.has('hkgro')
  const hasCrowd = sources.has('crowdsubmitted')
  const hasLandsd = sources.has('landsd')
  const hasEgazette = sources.has('egazette_pdf')
  if ([hasHkgro, hasCrowd, hasLandsd, hasEgazette].filter(Boolean).length >= 2) return 'combined'
  if (hasHkgro) return 'hkgro'
  if (hasCrowd) return 'crowdsubmitted'
  if (hasLandsd && hasEgazette) return 'combined'
  if (hasEgazette) return 'egazette_pdf'
  if (options.defaultSource) return options.defaultSource
  return hasLandsd ? 'landsd_2016_plus' : null
}

export function enrichGeojson(sourceData, aggregates, options = {}) {
  const byStreetCode = new Map(
    aggregates
      .filter((item) => String(item.street_code ?? '').trim())
      .map((item) => [String(item.street_code).trim(), item]),
  )

  let matchedByStreetCode = 0
  let unmatched = 0

  const excludedCodes = options.namingDateExclusions?.streetCodes ?? new Set()

  const features = sourceData.features.map((feature) => {
    const props = feature.properties ?? {}
    const streetCode = String(props.STREETCODE ?? '').trim()
    if (streetCode && excludedCodes.has(streetCode)) {
      unmatched += 1
      return {
        ...feature,
        properties: {
          ...props,
          naming_year: null,
          naming_date: null,
          map_year: null,
          map_date: null,
          map_year_source: null,
          naming_source: null,
          naming_derivation_reason: 'excluded_manual',
          map_derivation_reason: 'excluded_manual',
          naming_event_count: 0,
        },
      }
    }

    const en = String(props.ENGLISHSTREETNAME ?? '').trim()
    const zh = String(props.CHINESESTREETNAME ?? '').trim()
    const key = makeStreetKey(en, zh)
    const aggregate = streetCode ? (byStreetCode.get(streetCode) ?? null) : null

    if (aggregate) matchedByStreetCode += 1
    else unmatched += 1

    const excluded = isExcludedStreetKey(key, options.namingDateExclusions)

    return {
      ...feature,
      properties: {
        ...props,
        naming_year: excluded ? null : (aggregate?.canonical_naming_year ?? null),
        naming_date: excluded ? null : (aggregate?.canonical_naming_date ?? null),
        map_year: excluded ? null : (aggregate?.map_display_year ?? null),
        map_date: excluded ? null : (aggregate?.map_display_date ?? null),
        map_year_source: excluded ? null : (aggregate?.map_year_source ?? null),
        naming_source: excluded ? null : aggregate ? resolveNamingSource(aggregate, options) : null,
        naming_derivation_reason: excluded
          ? 'excluded_manual'
          : (aggregate?.derivation_reason ?? null),
        map_derivation_reason: excluded
          ? 'excluded_manual'
          : (aggregate?.map_derivation_reason ?? null),
        naming_event_count: excluded ? 0 : (aggregate?.event_count ?? 0),
        first_naming_year: excluded
          ? null
          : aggregate?.first_known_naming_date
            ? Number(String(aggregate.first_known_naming_date).slice(0, 4))
            : null,
        has_name_history: excluded ? false : (aggregate?.event_count ?? 0) > 1,
      },
    }
  })

  return {
    enriched: {
      ...sourceData,
      name: options.geojsonName ?? 'HK_Streets_Naming',
      features,
    },
    joinStats: {
      matched_by_street_code: matchedByStreetCode,
      matched_exact_features: matchedByStreetCode,
      matched_fallback_features: 0,
      unmatched_features: unmatched,
      total_features: sourceData.features.length,
    },
  }
}

export function mergeEvents(landsdEvents, egazetteEvents, crowdEvents = []) {
  const merged = new Map()
  for (const event of landsdEvents) {
    merged.set(eventDedupeKey(event), { ...event, source: event.source ?? 'landsd' })
  }
  for (const event of egazetteEvents) {
    const key = eventDedupeKey(event)
    if (!merged.has(key)) {
      merged.set(key, { ...event, source: event.source ?? 'egazette_pdf' })
    }
  }
  for (const event of crowdEvents) {
    const key = eventDedupeKey(event)
    if (!merged.has(key)) {
      merged.set(key, { ...event, source: event.source ?? 'crowdsubmitted' })
    }
  }
  return [...merged.values()].toSorted((a, b) => {
    const dateCmp = String(a.publication_date ?? '').localeCompare(String(b.publication_date ?? ''))
    if (dateCmp !== 0) return dateCmp
    return String(a.notice_no ?? '').localeCompare(String(b.notice_no ?? ''))
  })
}

export function noticeTypeLabelsForSource(source, changeKind, isDecl) {
  const hkgro = source === 'hkgro'
  if (changeKind === 'rename') {
    return {
      en: hkgro ? 'Street name change (HKGRO)' : 'Street name change (crowdsource)',
      zh: hkgro ? '街道易名（HKGRO）' : '街道易名（眾包）',
      normalized: 'rename',
    }
  }
  if (changeKind === 'delete') {
    return {
      en: hkgro ? 'Street name deletion (HKGRO)' : 'Street name deletion (crowdsource)',
      zh: hkgro ? '街道名稱刪除（HKGRO）' : '街道名稱刪除（眾包）',
      normalized: 'delete',
    }
  }
  if (changeKind === 'extend') {
    return {
      en: hkgro ? 'Street name extension (HKGRO)' : 'Street name extension (crowdsource)',
      zh: hkgro ? '街道延伸（HKGRO）' : '街道延伸（眾包）',
      normalized: 'extend',
    }
  }
  if (isDecl) {
    return {
      en: hkgro ? 'Declaration of street name (HKGRO)' : 'Declaration of street name (crowdsource)',
      zh: hkgro ? '街道命名（HKGRO）' : '街道命名（眾包）',
      normalized: 'declaration',
    }
  }
  return {
    en: hkgro ? 'Street naming event (HKGRO)' : 'Street naming event (crowdsource)',
    zh: hkgro ? '街道命名事件（HKGRO）' : '街道命名事件（眾包）',
    normalized: 'other',
  }
}

/** @deprecated use noticeTypeLabelsForSource */
function crowdNoticeTypeLabels(changeKind, isDecl) {
  return noticeTypeLabelsForSource('crowdsubmitted', changeKind, isDecl)
}

export function shouldUseHkgroSource(event) {
  if (event?.source === 'hkgro') return true
  if (event?.source && event.source !== 'crowdsubmitted') return false
  const year = Number(String(event.publication_date ?? '').slice(0, 4))
  if (year >= 1900 && year <= 1939) return true
  const url = String(event.government_notice_url_en ?? event.gazette_url ?? '')
  const match = url.match(/\/egazette\/en\/(\d{4})-gn/i)
  if (!match) return false
  const urlYear = Number(match[1])
  return urlYear >= 1900 && urlYear <= 1939
}

export function isColonialHkgroCrowdEvent(event) {
  return shouldUseHkgroSource(event) && (event?.source ?? 'crowdsubmitted') === 'crowdsubmitted'
}

export function reclassifyColonialCrowdEvent(event) {
  if (!isColonialHkgroCrowdEvent(event)) return event
  const changeKind = normalizeChangeKind(event.change_kind)
  const isDecl =
    event.is_declaration_event === true ||
    (event.is_declaration_event !== false &&
      changeKind !== 'rename' &&
      changeKind !== 'delete' &&
      changeKind !== 'extend')
  const noticeTypes = noticeTypeLabelsForSource('hkgro', changeKind, isDecl)
  return {
    ...event,
    source: 'hkgro',
    notice_type_raw_en: noticeTypes.en,
    notice_type_raw_zh: noticeTypes.zh,
  }
}

/** Stable slug for event_id / submission_id (no street_code). */
export function slugifyForEventId(streetNameEn, streetNameZh) {
  const en = normalizeStreetName(streetNameEn)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  const zh = String(streetNameZh ?? '')
    .trim()
    .replace(/\s+/g, '')
    .slice(0, 16)
  if (en && zh) return `${en}-${zh}`
  if (zh) return zh
  if (en) return en
  return ''
}

export function finalizeCrowdEvent(raw, index = 0) {
  const publicationDate = String(raw.publication_date ?? '').trim()
  const rawNoticeInput =
    raw.gazette_notice_label ?? raw.government_notice_label_en ?? raw.notice_no ?? null
  const noticeLabels = formatGovernmentNoticeLabels(rawNoticeInput)
  const noticeNo = normalizeNoticeNo(rawNoticeInput ?? 'CROWD')
  const submissionId = String(raw.submission_id ?? raw.submissionId ?? index).trim()
  const changeKind = normalizeChangeKind(raw.change_kind)
  const isDecl =
    raw.is_declaration_event === true ||
    (raw.is_declaration_event !== false &&
      changeKind !== 'rename' &&
      changeKind !== 'delete' &&
      changeKind !== 'extend')
  const source = raw.source ?? (shouldUseHkgroSource(raw) ? 'hkgro' : 'crowdsubmitted')
  const noticeTypes = noticeTypeLabelsForSource(source, changeKind, isDecl)
  const displayNames = raw.display_names ?? raw.displayNames ?? null
  const gazetteOnly = raw.gazette_only === true
  const gazetteLocation = normalizeGazetteLocation(raw.gazette_location)
  const planFromLocation = planLabelsFromGazetteLocation(gazetteLocation)
  const planLabelsEn = [
    ...new Set([
      ...(Array.isArray(raw.related_gazette_plan_labels_en) ? raw.related_gazette_plan_labels_en : []),
      ...planFromLocation,
    ]),
  ]
  const planLabelsZh = [
    ...new Set([
      ...(Array.isArray(raw.related_gazette_plan_labels_zh) ? raw.related_gazette_plan_labels_zh : []),
      ...planFromLocation,
    ]),
  ]

  const base = {
    event_id: raw.event_id ?? `crowd|${submissionId}`,
    source,
    publication_date: publicationDate,
    change_kind: changeKind,
    street_name_en: raw.street_name_en ?? null,
    street_name_zh: raw.street_name_zh ?? null,
    previous_street_name_en: raw.previous_street_name_en ?? null,
    previous_street_name_zh: raw.previous_street_name_zh ?? null,
    district_raw_en: raw.district_raw_en ?? gazetteLocation?.parsed?.district_en ?? null,
    district_raw_zh: raw.district_raw_zh ?? gazetteLocation?.parsed?.district_zh ?? null,
    notice_type_raw_en: raw.notice_type_raw_en ?? noticeTypes.en,
    notice_type_raw_zh: raw.notice_type_raw_zh ?? noticeTypes.zh,
    notice_type_normalized: raw.notice_type_normalized ?? changeKind ?? noticeTypes.normalized,
    notice_no: noticeNo,
    government_notice_label_en: raw.government_notice_label_en ?? noticeLabels.en,
    government_notice_label_zh: raw.government_notice_label_zh ?? noticeLabels.zh,
    government_notice_url_en: raw.government_notice_url_en ?? raw.gazette_url ?? null,
    government_notice_url_zh: raw.government_notice_url_zh ?? null,
    related_gazette_plan_urls_en: [],
    related_gazette_plan_urls_zh: [],
    related_gazette_plan_labels_en: planLabelsEn,
    related_gazette_plan_labels_zh: planLabelsZh,
    gazette_location: gazetteLocation,
    is_declaration_event: isDecl,
    evidence_kind: raw.evidence_kind ?? null,
    event_role: normalizeEventRole(raw.event_role),
    derived_from: normalizeDerivedFrom(raw.derived_from),
    evidence_kind_note: raw.evidence_kind_note ?? null,
    submitter_remarks: raw.submitter_remarks ?? raw.remarks ?? null,
    supplementary_evidence: normalizeSupplementaryEvidence(raw.supplementary_evidence),
    reviewed_at: raw.reviewed_at ?? new Date().toISOString().slice(0, 10),
    submission_id: submissionId,
  }

  const withEvidence = enrichEventWithEvidenceKind(base)
  if (gazetteOnly) {
    return {
      ...withEvidence,
      event_role: normalizeEventRole(raw.event_role) ?? null,
    }
  }
  return enrichEvent(withEvidence, displayNames)
}

/** Build one or more crowd events from a batch street entry (optional `history` array). */
export function buildCrowdEventsFromStreetEntry(street, batchDefaults = {}) {
  const history = Array.isArray(street.history) ? street.history : null
  if (!history?.length) return []

  const gazetteOnly = batchDefaults.gazette_only !== false
  const resolvedEn =
    normalizeStreetName(street.english_name ?? street.en) ||
    normalizeStreetName(street.english_name) ||
    null
  const resolvedZh = String(street.chinese_name ?? street.zh ?? street.name ?? '').trim() || null
  const displayNames = batchDefaults.display_names ??
    batchDefaults.displayNames ?? { en: resolvedEn, zh: resolvedZh }

  return history.map((entry, index) => {
    const publicationDate = String(entry.publication_date ?? entry.date ?? '').trim()
    const changeKind = normalizeChangeKind(entry.change_kind) ?? 'declare'
    const nameSlug = slugifyForEventId(resolvedEn, resolvedZh) || String(index + 1)
    const suffix = nameSlug
    const submissionId =
      String(entry.submission_id ?? '').trim() ||
      `${batchDefaults.batch_id ?? 'history'}-${suffix}-${publicationDate}`

    const entryKind = normalizeEvidenceKind(entry.evidence_kind)
    const batchKind = normalizeEvidenceKind(batchDefaults.evidence_kind)
    const evidenceLevel = entry.evidence_level ?? batchDefaults.evidence_level ?? null
    const inheritBatchNotice =
      entryKind === 'gazette_primary' ||
      batchKind === 'gazette_primary' ||
      evidenceLevel === 'gazette' ||
      changeKind === 'rename' ||
      changeKind === 'delete' ||
      changeKind === 'extend'

    return finalizeCrowdEvent({
      submission_id: submissionId,
      gazette_only: gazetteOnly,
      publication_date: publicationDate,
      change_kind: changeKind,
      street_name_en:
        entry.street_name_en ??
        entry.english_name ??
        (changeKind === 'rename' ? resolvedEn : entry.name_en) ??
        resolvedEn,
      street_name_zh:
        entry.street_name_zh ??
        entry.chinese_name ??
        (changeKind === 'rename' ? resolvedZh : entry.name_zh) ??
        (normalizeEventRole(entry.event_role) === 'former_name' ? null : resolvedZh),
      previous_street_name_en: entry.previous_street_name_en ?? entry.previous_english_name ?? null,
      previous_street_name_zh: entry.previous_street_name_zh ?? entry.previous_chinese_name ?? null,
      gazette_notice_label:
        entry.gazette_notice_label ??
        entry.notice_label ??
        (inheritBatchNotice ? batchDefaults.gazette_notice_label : null) ??
        null,
      government_notice_url_en:
        entry.government_notice_url_en ??
        entry.gazette_url ??
        (inheritBatchNotice ? batchDefaults.gazette_url_en : null) ??
        null,
      government_notice_url_zh:
        entry.government_notice_url_zh ??
        (inheritBatchNotice ? batchDefaults.gazette_url_zh : null) ??
        null,
      evidence_kind: entry.evidence_kind ?? batchDefaults.evidence_kind ?? null,
      event_role: entry.event_role ?? null,
      derived_from: entry.derived_from ?? batchDefaults.derived_from ?? null,
      evidence_kind_note: entry.evidence_kind_note ?? null,
      display_names: displayNames,
      is_declaration_event: entry.is_declaration_event,
      submitter_remarks: entry.submitter_remarks ?? entry.remarks ?? null,
      supplementary_evidence: entry.supplementary_evidence ?? batchDefaults.supplementary_evidence ?? null,
      reviewed_at: entry.reviewed_at ?? batchDefaults.reviewed_at ?? null,
      source: entry.source ?? batchDefaults.source ?? null,
      gazette_location: entry.gazette_location ?? batchDefaults.gazette_location ?? null,
      related_gazette_plan_labels_en: entry.related_gazette_plan_labels_en ?? null,
      related_gazette_plan_labels_zh: entry.related_gazette_plan_labels_zh ?? null,
      notice_type_normalized: entry.notice_type_normalized ?? null,
      notice_type_raw_en: entry.notice_type_raw_en ?? null,
      notice_type_raw_zh: entry.notice_type_raw_zh ?? null,
      district_raw_en: entry.district_raw_en ?? street.district_raw_en ?? null,
      district_raw_zh: entry.district_raw_zh ?? street.district_raw_zh ?? null,
    })
  })
}

import { buildSelfHostedPdfUrls } from './egazette-pdf-urls.mjs'

export function finalizeEgazetteEvent(raw, index = 0) {
  const noticeTypeEn = raw.notice_type_raw_en ?? null
  const noticeTypeTc = raw.notice_type_raw_zh ?? null
  const isDecl = isDeclarationEvent(noticeTypeEn, noticeTypeTc)
  const normalized = isDecl ? 'declaration' : normalizeNoticeType(noticeTypeEn, noticeTypeTc)
  const noticeNo = normalizeNoticeNo(raw.notice_no)
  const publicationDate = raw.publication_date
  const noticeKey = raw.notice_key ?? null
  const hosted = noticeKey ? buildSelfHostedPdfUrls(noticeKey) : { en: null, zh: null }

  return {
    event_id: raw.event_id ?? `${publicationDate}|${noticeNo}|${index}`,
    source: 'egazette_pdf',
    publication_date: publicationDate,
    street_name_en: raw.street_name_en ?? null,
    street_name_zh: raw.street_name_zh ?? null,
    district_raw_en: raw.district_raw_en ?? null,
    district_raw_zh: raw.district_raw_zh ?? null,
    notice_type_raw_en: noticeTypeEn,
    notice_type_raw_zh: noticeTypeTc,
    notice_type_normalized: raw.notice_type_normalized ?? normalized,
    notice_no: noticeNo,
    government_notice_label_en: raw.government_notice_label_en ?? null,
    government_notice_label_zh: raw.government_notice_label_zh ?? null,
    government_notice_url_en: raw.government_notice_url_en ?? hosted.en,
    government_notice_url_zh: raw.government_notice_url_zh ?? hosted.zh,
    related_gazette_plan_urls_en: raw.related_gazette_plan_urls_en ?? [],
    related_gazette_plan_urls_zh: raw.related_gazette_plan_urls_zh ?? [],
    related_gazette_plan_labels_en: [
      ...new Set([
        ...(raw.related_gazette_plan_labels_en ?? []),
        ...planLabelsFromGazetteLocation(normalizeGazetteLocation(raw.gazette_location)),
      ]),
    ],
    related_gazette_plan_labels_zh: [
      ...new Set([
        ...(raw.related_gazette_plan_labels_zh ?? []),
        ...planLabelsFromGazetteLocation(normalizeGazetteLocation(raw.gazette_location)),
      ]),
    ],
    gazette_location: normalizeGazetteLocation(raw.gazette_location),
    is_declaration_event: isDecl,
    evidence_kind: resolveEvidenceKind(raw) ?? (hosted.en || hosted.zh ? 'gazette_primary' : 'unknown'),
    derived_from: normalizeDerivedFrom(raw.derived_from),
    evidence_kind_note: raw.evidence_kind_note ?? null,
    notice_key: noticeKey,
    pdf_path_en: raw.pdf_path_en ?? null,
    pdf_path_zh: raw.pdf_path_zh ?? null,
  }
}

export function streetNamesMatch(a, b) {
  const enA = normalizeStreetName(a?.en ?? a?.street_name_en ?? a?.english_name)
  const enB = normalizeStreetName(b?.en ?? b?.street_name_en ?? b?.english_name)
  const zhA = String(a?.zh ?? a?.street_name_zh ?? a?.chinese_name ?? '').trim()
  const zhB = String(b?.zh ?? b?.street_name_zh ?? b?.chinese_name ?? '').trim()
  if (enA && enB && enA === enB) return true
  if (zhA && zhB && zhA === zhB) return true
  return false
}
