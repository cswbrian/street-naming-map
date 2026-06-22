import { createTranslator } from '../i18n/locale.js'
import { getEvidenceKindBadge } from './evidenceKindBadge.js'
import {
  getTimelineEventTypeKey,
  getTimelineEventTypeLabel,
  TIMELINE_EVENT_TYPE_FILTER_ORDER,
  getEventTypeLabelForKey,
} from './mapSurfaceDisplay.js'
import { formatNoticeLabel } from './formatNoticeLabel.js'
import { normalizeStreetNameForMatch } from './roadKey.js'

const normalize = (value) => String(value ?? '').trim()

function namesMatchEntryAndDisplay(entry, displayNames) {
  const entryEn = normalizeStreetNameForMatch(entry.name_en)
  const entryZh = normalize(entry.name_zh)
  const displayEn = normalizeStreetNameForMatch(displayNames?.en)
  const displayZh = normalize(displayNames?.zh)
  if (displayEn && entryEn && displayEn === entryEn) return true
  if (displayZh && entryZh && displayZh === entryZh) return true
  return false
}

function hasPreviousName(entry) {
  return Boolean(normalize(entry.previous_name_en) || normalize(entry.previous_name_zh))
}

function isTimelineEntry(entry, displayNames) {
  const role = String(entry.event_role ?? '').trim()
  if (role === 'current_name' || role === 'former_name' || role === 'built' || role === 'name_removed') {
    return true
  }
  if (entry.change_kind === 'declare' && namesMatchEntryAndDisplay(entry, displayNames)) {
    return true
  }
  return entry.change_kind === 'rename' || entry.change_kind === 'declare' || entry.change_kind === 'extend'
}

/** All naming events for the chip timeline (including current name). */
function filterTimelineEntries(details, displayNames = null) {
  const history = details?.name_history
  if (!Array.isArray(history) || !history.length) return []

  return history.filter((entry) => {
    if (!isTimelineEntry(entry, displayNames)) return false
    if (entry.change_kind === 'rename' && !hasPreviousName(entry) && entry.event_role !== 'built') {
      return false
    }
    return true
  })
}

export function hasNameHistory(details, displayNames = null) {
  return filterTimelineEntries(details, displayNames).length >= 1
}

export function formatHistoryDate(date) {
  const text = normalize(date)
  if (!text) return '—'
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return text
  const [, year, month, day] = match
  if (month === '01' && day === '01') return String(year)
  return `${year}.${month}.${day}`
}

function formatName(entry, locale, field = 'current') {
  const zh = normalize(field === 'previous' ? entry.previous_name_zh : entry.name_zh)
  const en = normalize(field === 'previous' ? entry.previous_name_en : entry.name_en)
  if (locale === 'zh') return zh || en || '—'
  return en || zh || '—'
}

function hasGazetteProof(entry) {
  return Boolean(normalize(entry.notice_url_en) || normalize(entry.notice_url_zh))
}

function hasDerivedGazetteProof(entry) {
  const derived = entry.derived_from?.[0]
  if (!derived) return false
  return Boolean(
    normalize(derived.government_notice_url_en) || normalize(derived.government_notice_url_zh),
  )
}

function hasSupplementaryDocumentProof(entry) {
  const items = entry.supplementary_evidence
  if (!Array.isArray(items)) return false
  return items.some(
    (item) =>
      normalize(item?.document_url) ||
      normalize(item?.government_notice_url_en) ||
      normalize(item?.government_notice_url_zh),
  )
}

function getHistoryEntryPendingMeta(entry, labels) {
  const kind = String(entry.evidence_kind ?? '').trim()
  if (hasGazetteProof(entry) || kind === 'gazette_primary') {
    return { pending: false, pendingLabel: null }
  }
  if (kind === 'research') {
    return {
      pending: !hasSupplementaryDocumentProof(entry),
      pendingLabel: labels.evidenceResearch ?? null,
    }
  }
  if (kind === 'gazette_inferred') {
    return {
      pending: !hasDerivedGazetteProof(entry),
      pendingLabel: labels.historyGazetteInferred ?? labels.historyGazettePending,
    }
  }
  if (kind === 'news') return { pending: false, pendingLabel: labels.evidenceNews ?? null }
  if (kind === 'hearsay') return { pending: false, pendingLabel: labels.evidenceHearsay ?? null }
  if (kind === 'legal_other') {
    return { pending: false, pendingLabel: labels.evidenceLegalOther ?? null }
  }
  if (kind === 'gazette_mention' || kind === 'legal_mention' || kind === 'news_mention' || kind === 'research_mention') {
    return {
      pending: !hasGazetteProof(entry) && !hasSupplementaryDocumentProof(entry),
      pendingLabel: null,
    }
  }
  if (kind === 'unknown' || !kind) {
    return { pending: true, pendingLabel: labels.historyGazettePending }
  }
  return { pending: false, pendingLabel: null }
}

/** Former name only (card header already shows the current name). */
function buildHistoryName(entry, locale) {
  if (entry.event_role === 'built') {
    return formatName(entry, locale, 'current')
  }
  const kind = entry.change_kind ?? 'other'
  if (kind === 'rename') {
    // Former-name renames: show the name introduced at this date (e.g. 太子道 after G.N.119).
    if (entry.event_role === 'former_name' || entry.event_role === 'current_name') {
      return formatName(entry, locale, 'current')
    }
    return formatName(entry, locale, 'previous')
  }
  return formatName(entry, locale, 'current')
}

function getSupplementaryNoticeLink(entry, locale) {
  const items = entry.supplementary_evidence
  if (!Array.isArray(items) || !items.length) return null
  const doc =
    items.find((item) => normalize(item.document_url)) ??
    items.find(
      (item) => normalize(item.government_notice_url_en) || normalize(item.government_notice_url_zh),
    )
  if (!doc) return null
  const url =
    normalize(doc.document_url) ||
    normalize(doc.government_notice_url_en) ||
    normalize(doc.government_notice_url_zh)
  if (!url) return null
  const label =
    locale === 'zh'
      ? doc.publisher_zh || doc.publisher || doc.document_label || '研究'
      : doc.publisher || doc.document_label || 'Research'
  return { url, label }
}

export function getHistoryNoticeLink(entry, locale) {
  if (entry.evidence_kind === 'gazette_inferred' && entry.derived_from?.[0]) {
    const derived = entry.derived_from[0]
    const citedRaw = derived.cited_notice_label ?? entry.notice_label_en ?? entry.notice_label_zh
    const label =
      locale === 'zh'
        ? formatNoticeLabel(citedRaw, 'zh') || citedRaw || '憲報'
        : formatNoticeLabel(citedRaw, 'en') || citedRaw || 'Gazette'
    const url =
      locale === 'zh'
        ? normalize(derived.government_notice_url_zh) ||
          normalize(derived.government_notice_url_en)
        : normalize(derived.government_notice_url_en) ||
          normalize(derived.government_notice_url_zh)
    if (url) return { url, label }
    if (label) return { url: null, label }
  }

  const supplementary = getSupplementaryNoticeLink(entry, locale)
  if (supplementary) return supplementary

  const url = normalize(entry.notice_url_en) || normalize(entry.notice_url_zh)
  if (!url) return null
  const raw = entry.notice_label_en ?? entry.notice_label_zh ?? ''
  const fullLabel =
    locale === 'zh'
      ? formatNoticeLabel(raw, 'zh') || entry.notice_label_en || '憲報'
      : formatNoticeLabel(raw, 'en') || entry.notice_label_en || 'Gazette'
  if (entry.evidence_kind === 'gazette_primary') {
    return {
      url,
      label: locale === 'zh' ? '憲報' : 'Gazette',
      title: fullLabel,
    }
  }
  return { url, label: fullLabel }
}

function getNoticeReferenceLabel(noticeLink) {
  if (!noticeLink) return null
  return noticeLink.title ?? noticeLink.label ?? null
}

/** Newest-first sort for raw name_history rows (undated entries last). */
export function sortHistoryEntriesByDateDesc(events) {
  if (!Array.isArray(events)) return []
  return [...events].toSorted((a, b) => {
    const dateA = normalize(a.date)
    const dateB = normalize(b.date)
    if (!dateA && !dateB) return 0
    if (!dateA) return 1
    if (!dateB) return -1
    return dateB.localeCompare(dateA)
  })
}

/** Latest ISO date from name_history, or empty string. */
export function getLatestHistoryDate(events) {
  const ordered = sortHistoryEntriesByDateDesc(events)
  return normalize(ordered[0]?.date)
}

export function buildTimelineEventLabels(t) {
  return {
    historyGazettePending: t('historyGazettePending'),
    historyGazetteInferred: t('historyGazetteInferred'),
    evidenceNews: t('evidenceNews'),
    evidenceHearsay: t('evidenceHearsay'),
    evidenceLegalOther: t('evidenceLegalOther'),
    evidenceResearch: t('evidenceResearch'),
    eventTypeDeclare: t('eventTypeDeclare'),
    eventTypeRename: t('eventTypeRename'),
    eventTypeFormerName: t('eventTypeFormerName'),
    eventTypeEarliestMention: t('eventTypeEarliestMention'),
    eventTypeExtend: t('eventTypeExtend'),
    eventTypeBuilt: t('eventTypeBuilt'),
    eventTypeNameRemoved: t('eventTypeNameRemoved'),
  }
}

const TIMELINE_SEARCH_LOCALES = ['en', 'zh']

/** Label sets for timeline search (EN + ZH event type strings). */
export function buildTimelineSearchLabelSets() {
  return Object.fromEntries(
    TIMELINE_SEARCH_LOCALES.map((locale) => [
      locale,
      buildTimelineEventLabels(createTranslator(locale)),
    ]),
  )
}

/** Search haystack for one timelines table row (includes UI event-type labels). */
export function buildTimelineRowSearchHaystack(row, labelSets) {
  const displayNames = {
    en: row.street_name_en,
    zh: row.street_name_zh,
  }
  const history = Array.isArray(row.name_history) ? row.name_history : []
  const ordered = sortHistoryEntriesByDateDesc(history)
  const eventTerms = []

  for (const entry of ordered) {
    for (const locale of TIMELINE_SEARCH_LOCALES) {
      const labels = labelSets?.[locale]
      if (!labels) continue
      const t = createTranslator(locale)
      const eventType = buildTimelineEventRowMeta(entry, locale, labels, displayNames, ordered, null)
        .eventType
      if (eventType) eventTerms.push(eventType)
      const evidenceBadge = getEvidenceKindBadge(entry.evidence_kind, t)
      if (evidenceBadge?.label) eventTerms.push(evidenceBadge.label)
    }
  }

  return [
    row.timeline_id,
    row.street_code,
    row.street_name_en,
    row.street_name_zh,
    row.geometry_link?.status,
    row.geometry_link?.district_hint,
    ...eventTerms,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function getTimelineEventTypeKeysForRow(row) {
  const history = Array.isArray(row?.name_history) ? row.name_history : []
  const ordered = sortHistoryEntriesByDateDesc(history)
  const keys = new Set()
  for (const entry of ordered) {
    const key = getTimelineEventTypeKey(entry, ordered)
    if (key) keys.add(key)
  }
  return keys
}

/** Filter options with counts for timelines table event-type chips. */
export function buildTimelineEventTypeFilterStats(rows, labels) {
  const counts = new Map()
  for (const row of rows) {
    for (const key of getTimelineEventTypeKeysForRow(row)) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return TIMELINE_EVENT_TYPE_FILTER_ORDER.filter((id) => (counts.get(id) ?? 0) > 0).map((id) => ({
    id,
    label: getEventTypeLabelForKey(id, labels),
    count: counts.get(id) ?? 0,
  }))
}

/** True when the row has at least one event of the given type key. */
export function timelineRowMatchesEventType(row, typeKey) {
  if (!typeKey) return true
  return getTimelineEventTypeKeysForRow(row).has(typeKey)
}

/** Summary fields for one timelines-dashboard event row. */
export function buildTimelineEventRowMeta(entry, locale, labels, displayNames, ordered, t) {
  const sourceMeta = buildTimelineSourceMeta(entry, locale, labels, t)
  return {
    date: formatHistoryDate(entry.date),
    dateTime: normalize(entry.date) || null,
    eventType: getTimelineEventTypeLabel(entry, labels, ordered),
    name: buildHistoryName(entry, locale),
    previousName: hasPreviousName(entry) ? formatName(entry, locale, 'previous') : null,
    isCurrent: String(entry.event_role ?? '').trim() === 'current_name',
    pending: sourceMeta.pending,
    pendingLabel: sourceMeta.pendingLabel,
    notice: sourceMeta.notice,
  }
}

/** Source link/label for one timeline row — matches dashboard table (badge label + G.N. in title). */
function buildTimelineSourceMeta(entry, locale, labels, t) {
  const noticeLink = getHistoryNoticeLink(entry, locale)
  const pendingMeta = getHistoryEntryPendingMeta(entry, labels)
  const badge = t ? getEvidenceKindBadge(entry.evidence_kind, t) : null

  if (!badge) {
    return {
      pending: pendingMeta.pending,
      pendingLabel: pendingMeta.pendingLabel,
      notice: noticeLink,
    }
  }

  const referenceLabel = getNoticeReferenceLabel(noticeLink)
  return {
    pending: pendingMeta.pending,
    pendingLabel: pendingMeta.pending ? badge.label : null,
    notice: {
      url: noticeLink?.url ?? null,
      label: badge.label,
      title: referenceLabel ? `${badge.hint} — ${referenceLabel}` : badge.hint,
      kind: badge.kind,
    },
  }
}

function buildPendingTimelineItem(labels, pendingDisplay) {
  const meta = {
    date: null,
    dateTime: null,
    eventType: labels.eventTypeDeclare ?? null,
    name: null,
    previousName: null,
    isCurrent: true,
    pending: true,
    pendingLabel: pendingDisplay,
    notice: null,
  }
  return { id: 'pending-current', entry: null, meta, ...meta }
}

/** All raw name_history rows as unified timeline items (newest first, no filtering). */
export function buildStreetTimelineItems(events, locale, labels, displayNames = null, options = {}) {
  const ordered = sortHistoryEntriesByDateDesc(events)
  const idPrefix = normalize(options.idPrefix)
  let hasCurrentEntry = false

  const items = ordered.map((entry, index) => {
    const isCurrent = String(entry.event_role ?? '').trim() === 'current_name'
    if (isCurrent) hasCurrentEntry = true
    const meta = buildTimelineEventRowMeta(entry, locale, labels, displayNames, ordered, options.t)
    const id = idPrefix
      ? `${idPrefix}:${index}`
      : `${entry.event_role ?? 'event'}-${normalize(entry.date) || 'undated'}-${index}`
    return { id, entry, meta, ...meta }
  })

  if (!hasCurrentEntry && options.pendingDisplay) {
    items.unshift(buildPendingTimelineItem(labels, options.pendingDisplay))
  }

  return items.length ? items : null
}

/** @deprecated Use buildStreetTimelineItems — kept for backward compatibility. */
export function buildNameHistoryTimelineItems(
  details,
  locale,
  labels,
  displayNames = null,
  options = {},
) {
  return buildStreetTimelineItems(details?.name_history, locale, labels, displayNames, options)
}

function buildChineseNameMismatchRemark(entry, displayNames, locale) {
  const displayZh = normalize(displayNames?.zh)
  const entryZh = normalize(entry.name_zh)
  const displayEn = normalizeStreetNameForMatch(displayNames?.en)
  const entryEn = normalizeStreetNameForMatch(entry.name_en)
  if (!displayZh || !entryZh || displayZh === entryZh) return null
  if (displayEn && entryEn && displayEn !== entryEn) return null
  if (!hasGazetteProof(entry)) return null
  return locale === 'zh'
    ? `憲報中文為「${entryZh}」；現行圖資為「${displayZh}」。`
    : `Gazette Chinese 「${entryZh}」; current map name 「${displayZh}」.`
}

function stripRedundantMismatchClause(raw) {
  return normalize(raw)
    .replace(/\s*Gazette Chinese:\s*[^;]+;\s*current DB name:\s*[^.]+\.?\s*/gi, '')
    .replace(/\s*憲報中文[：:]\s*[^；;]+[；;]\s*現行[^。.]+[。.]?\s*/g, '')
    .trim()
}

/** Card remarks for naming caveats (e.g. gazette vs map Chinese name). */
export function buildNamingRemarks(details, displayNames, locale) {
  const history = details?.name_history
  if (!Array.isArray(history) || !history.length) return null

  const remarks = []
  for (const entry of history) {
    const mismatch = buildChineseNameMismatchRemark(entry, displayNames, locale)
    if (mismatch) remarks.push(mismatch)

    const cleaned = stripRedundantMismatchClause(entry.submitter_remarks)
    if (cleaned) remarks.push(cleaned)
  }

  const unique = [...new Set(remarks.map((text) => normalize(text)).filter(Boolean))]
  return unique.length
    ? unique.map((text) => {
        const original = remarks.find((candidate) => normalize(candidate) === text)
        return original ?? text
      })
    : null
}

/** @deprecated Use buildNameHistoryTimelineItems — kept for any external callers */
export function buildNameHistoryViewModel(details, locale, labels) {
  return buildNameHistoryTimelineItems(details, locale, labels)
}
