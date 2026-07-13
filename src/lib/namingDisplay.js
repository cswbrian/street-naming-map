import { hasNamingYear } from './submissionStatus.js'

export function formatNamingDate(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const match = text.match(/^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})$/)
  if (!match) return null
  const [, yyyy, mm, dd] = match
  return `${yyyy}.${String(mm).padStart(2, '0')}.${String(dd).padStart(2, '0')}`
}

/** User-facing date: YYYY.MM.DD; bare year unchanged; optional fallback when empty/invalid. */
export function formatDisplayDate(value, { fallback = null } = {}) {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  const formatted = formatNamingDate(text)
  if (formatted) return formatted
  if (/^\d{4}$/.test(text)) return text
  return fallback ?? text
}

export function hasRowNamingDate(row) {
  return Boolean(formatNamingDate(row?.naming_date)) || hasNamingYear(row)
}

export function getNamingDisplay(row, t) {
  const date = formatNamingDate(row?.naming_date)
  if (date) return date
  if (row?.naming_year !== null && row?.naming_year !== undefined && row?.naming_year !== '') {
    return String(row.naming_year)
  }
  return t('pending')
}

/** Extra spellings so the names-table search matches how users type dates (ISO, dots, slashes). */
export function buildDateSearchTokens(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (!match) return text
  const [, y, m, d] = match
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return [
    text,
    `${y}-${mm}-${dd}`,
    `${y}.${mm}.${dd}`,
    `${y}/${mm}/${dd}`,
    `${y}${mm}${dd}`,
    `${dd}/${mm}/${y}`,
    `${dd}.${mm}.${y}`,
    `${dd}-${mm}-${y}`,
    `${y}-${mm}`,
    `${y}.${mm}`,
    `${y}/${mm}`,
  ].join(' ')
}

export function buildRowSearchHaystack(row, t) {
  const details = row?.naming_details
  const dateFields = [
    row?.naming_date,
    details?.canonical_naming_date,
    details?.first_known_naming_date,
  ]
  const dateTokens = dateFields
    .map((value) => buildDateSearchTokens(value))
    .filter(Boolean)
    .join(' ')

  return [
    row?.street_code,
    row?.english_name,
    row?.chinese_name,
    row?.street_type,
    row?.naming_year,
    ...dateFields,
    formatNamingDate(row?.naming_date),
    getNamingDisplay(row, t),
    dateTokens,
  ]
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== '')
    .join(' ')
    .toLowerCase()
}
