import { getEvidenceKindBadge } from './evidenceKindBadge.js'
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
  if (kind === 'unknown' || !kind) {
    return { pending: true, pendingLabel: labels.historyGazettePending }
  }
  return { pending: false, pendingLabel: null }
}

function hasOtherTimelineEntry(entry, ordered = []) {
  return ordered.some((other) => other !== entry)
}

function getTimelineEventTypeLabel(entry, labels, displayNames = null, ordered = []) {
  const role = String(entry.event_role ?? '').trim()
  const kind = String(entry.change_kind ?? '').trim()
  if (role === 'built') return labels.eventTypeBuilt ?? labels.eventRoleBuilt ?? null
  if (role === 'name_removed') return labels.eventTypeNameRemoved ?? labels.eventRoleNameRemoved ?? null
  if (kind === 'extend') return labels.eventTypeExtend ?? null
  if (role === 'current_name') {
    // Gazette may say "rename" even when no other timeline row exists yet — show Named.
    // Once a former_name (or other) row is recorded, show Rename.
    if (kind === 'rename' && hasOtherTimelineEntry(entry, ordered)) {
      return labels.eventTypeRename ?? null
    }
    if (kind === 'rename') {
      return labels.eventTypeCurrentName ?? labels.eventRoleCurrentName ?? null
    }
    return labels.eventTypeCurrentName ?? labels.eventRoleCurrentName ?? null
  }
  if (role === 'former_name') return labels.eventTypeFormerName ?? labels.eventRoleFormerName ?? null
  if (kind === 'rename') return labels.eventTypeRename ?? null
  if (kind === 'declare' && namesMatchEntryAndDisplay(entry, displayNames)) {
    return labels.eventTypeCurrentName ?? labels.eventRoleCurrentName ?? null
  }
  return labels.eventTypeFormerName ?? labels.eventRoleFormerName ?? null
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

/** Structured items for NameHistoryList. */
export function buildNameHistoryTimelineItems(
  details,
  locale,
  labels,
  displayNames = null,
  options = {},
) {
  const filtered = details ? filterTimelineEntries(details, displayNames) : []
  const ordered = [...filtered].toSorted((a, b) => {
    const dateA = normalize(a.date)
    const dateB = normalize(b.date)
    if (!dateA && !dateB) return 0
    if (!dateA) return 1
    if (!dateB) return -1
    return dateB.localeCompare(dateA)
  })

  const items = []
  const shownNames = new Set()
  let hasCurrentEntry = false

  for (const [index, entry] of ordered.entries()) {
    const isCurrent = String(entry.event_role ?? '').trim() === 'current_name'
    if (isCurrent) hasCurrentEntry = true

    const name = buildHistoryName(entry, locale)
    const streetName = normalize(name) && name !== '—' ? name : null
    const isBuiltNoName = entry.event_role === 'built' && !streetName
    if (!isBuiltNoName && !streetName) continue
    if (streetName && !isCurrent && shownNames.has(streetName)) continue

    if (streetName) shownNames.add(streetName)
    const rawDate = normalize(entry.date)
    const sourceMeta = buildTimelineSourceMeta(entry, locale, labels, options.t)
    const eventType = getTimelineEventTypeLabel(entry, labels, displayNames, ordered)

    items.push({
      id: `${entry.event_role ?? 'event'}-${rawDate || 'undated'}-${index}`,
      date: rawDate ? formatHistoryDate(rawDate) : null,
      dateTime: rawDate || null,
      eventType,
      name: streetName,
      isCurrent,
      pending: sourceMeta.pending,
      pendingLabel: sourceMeta.pendingLabel,
      notice: sourceMeta.notice,
    })
  }

  if (!hasCurrentEntry && options.pendingDisplay) {
    items.unshift({
      id: 'pending-current',
      date: null,
      dateTime: null,
      eventType: labels.eventTypeCurrentName ?? labels.eventRoleCurrentName ?? null,
      name: null,
      isCurrent: true,
      pending: true,
      pendingLabel: options.pendingDisplay,
      notice: null,
    })
  }

  return items.length ? items : null
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
