const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

const EN_MONTH =
  'January|February|March|April|May|June|July|August|September|October|November|December'

function toIsoDate(year, month, day) {
  return `${String(year)}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`
}

function toIsoFromEnglish(dayRaw, monthRaw, yearRaw) {
  const month = MONTHS[String(monthRaw).toLowerCase()]
  if (!month) return null
  return toIsoDate(yearRaw, month, dayRaw)
}

function parseAllChineseDates(text) {
  const dates = []
  for (const match of String(text ?? '').matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) {
    dates.push(toIsoDate(match[1], match[2], match[3]))
  }
  return dates
}

function parseAllEnglishDates(text) {
  const dates = []
  const re = new RegExp(`(\\d{1,2})\\s+(${EN_MONTH})\\s+(\\d{4})`, 'gi')
  for (const match of String(text ?? '').matchAll(re)) {
    const iso = toIsoFromEnglish(match[1], match[2], match[3])
    if (iso) dates.push(iso)
  }
  return dates
}

/** Gazette publication date from the footer/signatory block, not body cross-references. */
export function parseGazetteFooterDate(textEn = '', textZh = '') {
  const en = String(textEn).trim()
  const zh = String(textZh).trim()

  const zhFooter = zh.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*地政總署署長/)
  if (zhFooter) return toIsoDate(zhFooter[1], zhFooter[2], zhFooter[3])

  const enFooter = en.match(
    new RegExp(
      `(\\d{1,2})\\s+(${EN_MONTH})\\s+(\\d{4})\\s+.+?\\s+for\\s+Director\\s+of\\s+Lands`,
      'is',
    ),
  )
  if (enFooter) return toIsoFromEnglish(enFooter[1], enFooter[2], enFooter[3])

  const zhDates = parseAllChineseDates(zh)
  if (zhDates.length) return zhDates.at(-1)

  const enDates = parseAllEnglishDates(en)
  if (enDates.length) return enDates.at(-1)

  return null
}

export function applyFooterPublicationDate(event, extraction) {
  const footerDate = parseGazetteFooterDate(extraction?.text_en, extraction?.text_zh)
  if (!footerDate || event.publication_date === footerDate) return event

  const index = String(event.event_id ?? '').split('|').at(-1) ?? '0'
  return {
    ...event,
    publication_date: footerDate,
    year_bucket: Number(footerDate.slice(0, 4)),
    event_id: `${footerDate}|${event.notice_no}|${index}`,
  }
}
