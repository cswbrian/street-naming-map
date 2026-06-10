import { formatNoticeLabel } from './formatNoticeLabel.js'
import { buildRoadKey } from './roadKey.js'
import {
  isPlaceholderNoticeLabel,
  pickHostedNoticeUrl,
  resolveNoticeDisplayLabel,
  resolveNoticeUrlsForDetails,
} from './noticeUrls.js'

/** Keys for notice lookup; avoid English-only keys when several streets share the same EN name. */
export function buildNoticeLookupKeys(row) {
  const keys = new Set()
  const details = row?.naming_details
  if (row?.road_key) keys.add(row.road_key)
  if (details?.street_key) keys.add(details.street_key)
  const code = String(row.street_code ?? details?.street_code ?? '').trim()
  if (code) keys.add(`code:${code}`)
  const nameKey = buildRoadKey(row.english_name, row.chinese_name, '')
  if (nameKey?.includes('|')) keys.add(nameKey)
  return keys
}

export function buildNoticeResolveKeys({ roadKey, enName, zhName, streetCode }) {
  const keys = []
  if (roadKey) keys.push(roadKey)
  const code = String(streetCode ?? '').trim()
  if (code) keys.push(`code:${code}`)
  const nameKey = buildRoadKey(enName, zhName, '')
  if (nameKey?.includes('|')) keys.push(nameKey)
  return keys
}

function resolveStoredNoticeUrls(namingDetails, options = {}) {
  const urls = resolveNoticeUrlsForDetails(namingDetails, options)
  return {
    en: urls.en ?? null,
    zh: urls.zh ?? null,
  }
}

function noticeLinkFromUrls(urls, locale, label, pdfLocales) {
  if (!label) return null
  const url = pickHostedNoticeUrl(urls, locale === 'zh' ? 'zh' : 'en', pdfLocales)
  return { url: url ?? null, label }
}

export function getNoticeLink(namingDetails, locale, options = {}) {
  if (!namingDetails) return null

  const label = resolveNoticeDisplayLabel(namingDetails, locale)
  if (!label) return null

  const urls = resolveStoredNoticeUrls(namingDetails, options)
  return noticeLinkFromUrls(urls, locale, label, options.pdfLocales)
}

export function buildNoticeLookup(roads = [], options = {}) {
  const lookup = new Map()
  const noticeIndex = options.noticeIndex ?? null
  for (const row of roads) {
    const details = row?.naming_details
    if (!details) continue
    const { en, zh } = resolveStoredNoticeUrls(details, { noticeIndex })
    if (!en && !zh) continue
    for (const key of buildNoticeLookupKeys(row)) {
      lookup.set(key, details)
    }
  }
  return lookup
}

export function resolveNoticeLink({
  roadKey,
  enName,
  zhName,
  streetCode,
  lookup,
  locale,
  noticeIndex,
  pdfLocales,
}) {
  if (!lookup?.size) return null
  for (const key of buildNoticeResolveKeys({ roadKey, enName, zhName, streetCode })) {
    if (!key) continue
    const link = getNoticeLink(lookup.get(key), locale, { noticeIndex, pdfLocales })
    if (link?.url || link?.label) return link
  }
  return null
}
