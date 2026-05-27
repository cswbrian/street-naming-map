import { hasNamingYear } from './submissionStatus.js'

export function formatNamingDate(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const match = text.match(/^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})$/)
  if (!match) return null
  const [, yyyy, mm, dd] = match
  return `${yyyy}.${String(mm).padStart(2, '0')}.${String(dd).padStart(2, '0')}`
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
