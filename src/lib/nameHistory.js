import { formatNoticeLabel } from './formatNoticeLabel.js'

const normalize = (value) => String(value ?? '').trim()

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

/** Entries to show under “Previous name”. Keeps gazette renames but drops duplicate date/notice in the list. */
function filterFormerNameEntries(details) {
  const history = details?.name_history
  if (!Array.isArray(history) || !history.length) return []

  return history.filter((entry) => {
    if (isCurrentGazetteRename(entry, details)) {
      return hasPreviousName(entry)
    }
    return true
  })
}

export function hasNameHistory(details) {
  return filterFormerNameEntries(details).length >= 1
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

/** Former name only (card header already shows the current name). */
function buildHistoryName(entry, locale) {
  const kind = entry.change_kind ?? 'other'
  if (kind === 'rename') {
    return formatName(entry, locale, 'previous')
  }
  return formatName(entry, locale, 'current')
}

export function getHistoryNoticeLink(entry, locale) {
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
export function buildNameHistoryTimelineItems(details, locale, labels) {
  const filtered = filterFormerNameEntries(details)
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
    const pending = hideMeta ? false : !hasGazetteProof(entry)

    items.push({
      id: `${rawDate || 'unknown'}-${index}`,
      date: hideMeta ? null : formatHistoryDate(rawDate),
      dateTime: hideMeta ? null : rawDate || null,
      name,
      pending,
      pendingLabel: pending ? labels.historyGazettePending : null,
      notice: hideMeta ? null : getHistoryNoticeLink(entry, locale),
    })
  }

  return items.length ? items : null
}

/** @deprecated Use buildNameHistoryTimelineItems — kept for any external callers */
export function buildNameHistoryViewModel(details, locale, labels) {
  return buildNameHistoryTimelineItems(details, locale, labels)
}
