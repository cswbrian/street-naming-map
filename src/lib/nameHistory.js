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

function isCurrentGazetteRename(entry, details) {
  const currentSince = normalize(
    details?.current_name_since_date ?? details?.canonical_naming_date ?? '',
  )
  const date = normalize(entry.date)
  return (
    currentSince &&
    date === currentSince &&
    entry.change_kind === 'rename' &&
    hasGazetteProof(entry)
  )
}

function hasPreviousName(entry) {
  return Boolean(normalize(entry.previous_name_en) || normalize(entry.previous_name_zh))
}

function isHistoryOnlyEntry(entry, displayNames) {
  const role = String(entry.event_role ?? '').trim()
  if (role === 'current_name') return false
  if (role === 'former_name' || role === 'built' || role === 'name_removed') return true
  if (entry.change_kind === 'declare' && namesMatchEntryAndDisplay(entry, displayNames)) {
    return false
  }
  return entry.change_kind === 'rename' || entry.change_kind === 'declare'
}

/** Entries for 舊稱 / timeline: former names, built, etc. — not current_name. */
function filterFormerNameEntries(details, displayNames = null) {
  const history = details?.name_history
  if (!Array.isArray(history) || !history.length) return []

  return history.filter((entry) => {
    if (!isHistoryOnlyEntry(entry, displayNames)) return false
    if (entry.change_kind === 'rename' && !hasPreviousName(entry) && entry.event_role !== 'built') {
      return false
    }
    if (isCurrentGazetteRename(entry, details)) {
      return hasPreviousName(entry)
    }
    return true
  })
}

export function hasNameHistory(details, displayNames = null) {
  return filterFormerNameEntries(details, displayNames).length >= 1
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

function getHistoryEntryPendingMeta(entry, labels) {
  const kind = String(entry.evidence_kind ?? '').trim()
  if (hasGazetteProof(entry) || kind === 'gazette_primary') {
    return { pending: false, pendingLabel: null }
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

function getEventRoleLabel(entry, labels) {
  const role = String(entry.event_role ?? '').trim()
  if (role === 'built') return labels.eventRoleBuilt ?? null
  if (role === 'name_removed') return labels.eventRoleNameRemoved ?? null
  return null
}

/** Former name only (card header already shows the current name). */
function buildHistoryName(entry, locale) {
  if (entry.event_role === 'built') {
    return formatName(entry, locale, 'current')
  }
  const kind = entry.change_kind ?? 'other'
  if (kind === 'rename') {
    return formatName(entry, locale, 'previous')
  }
  return formatName(entry, locale, 'current')
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

  const url = normalize(entry.notice_url_en) || normalize(entry.notice_url_zh)
  if (!url) return null
  const raw = entry.notice_label_en ?? entry.notice_label_zh ?? ''
  const label =
    locale === 'zh'
      ? formatNoticeLabel(raw, 'zh') || entry.notice_label_en || '憲報'
      : formatNoticeLabel(raw, 'en') || entry.notice_label_en || 'Gazette'
  return { url, label }
}

/** Structured items for NameHistoryList. */
export function buildNameHistoryTimelineItems(details, locale, labels, displayNames = null) {
  const filtered = filterFormerNameEntries(details, displayNames)
  if (!filtered.length) return null

  const items = []
  const shownNames = new Set()

  for (const [index, entry] of filtered.entries()) {
    const hideMeta = isCurrentGazetteRename(entry, details)
    const name = buildHistoryName(entry, locale)
    if (!name || name === '—') continue
    if (hideMeta && shownNames.has(name)) continue

    shownNames.add(name)
    const rawDate = normalize(entry.date)
    const pendingMeta = hideMeta ? { pending: false, pendingLabel: null } : getHistoryEntryPendingMeta(entry, labels)

    const roleLabel = hideMeta ? null : getEventRoleLabel(entry, labels)

    items.push({
      id: `${rawDate || 'unknown'}-${index}`,
      date: hideMeta ? null : formatHistoryDate(rawDate),
      dateTime: hideMeta ? null : rawDate || null,
      name,
      roleLabel,
      pending: pendingMeta.pending,
      pendingLabel: pendingMeta.pendingLabel,
      notice: hideMeta ? null : getHistoryNoticeLink(entry, locale),
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
