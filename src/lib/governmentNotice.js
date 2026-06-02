import { formatNoticeLabel } from './formatNoticeLabel.js'
import { buildRoadKey } from './roadKey.js'
import { resolveHostedUrl } from './resolveHostedUrl.js'

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

export function getNoticeLink(namingDetails, locale) {
  if (!namingDetails) return null
  const zhUrl = resolveHostedUrl(namingDetails.government_notice_url_zh)
  const enUrl = resolveHostedUrl(namingDetails.government_notice_url_en)
  const rawEn = namingDetails.government_notice_label_en
  const rawZh = namingDetails.government_notice_label_zh
  const zhLabel = formatNoticeLabel(rawZh || rawEn, 'zh')
  const enLabel = formatNoticeLabel(rawEn || rawZh, 'en')
  if (locale === 'zh') {
    if (zhUrl) return { url: zhUrl, label: zhLabel }
    if (enUrl) return { url: enUrl, label: enLabel }
  } else {
    if (enUrl) return { url: enUrl, label: enLabel }
    if (zhUrl) return { url: zhUrl, label: zhLabel }
  }
  return null
}

export function buildNoticeLookup(roads = []) {
  const lookup = new Map()
  for (const row of roads) {
    const details = row?.naming_details
    if (!details) continue
    if (!details.government_notice_url_en && !details.government_notice_url_zh) continue
    for (const key of buildNoticeLookupKeys(row)) {
      lookup.set(key, details)
    }
  }
  return lookup
}

export function resolveNoticeLink({ roadKey, enName, zhName, streetCode, lookup, locale }) {
  if (!lookup?.size) return null
  for (const key of buildNoticeResolveKeys({ roadKey, enName, zhName, streetCode })) {
    if (!key) continue
    const link = getNoticeLink(lookup.get(key), locale)
    if (link) return link
  }
  return null
}
