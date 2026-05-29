import { formatNoticeLabel } from './formatNoticeLabel.js'
import { buildStreetMatchKeys } from './roadKey.js'
import { resolveHostedUrl } from './resolveHostedUrl.js'

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
    const keys = new Set([
      row.road_key,
      details.street_key,
      ...buildStreetMatchKeys(row.english_name, row.chinese_name, row.street_code),
    ])
    for (const key of keys) {
      if (key) lookup.set(key, details)
    }
  }
  return lookup
}

export function resolveNoticeLink({ roadKey, enName, zhName, streetCode, lookup, locale }) {
  if (!lookup?.size) return null
  const keys = [roadKey, ...buildStreetMatchKeys(enName, zhName, streetCode)]
  for (const key of keys) {
    if (!key) continue
    const link = getNoticeLink(lookup.get(key), locale)
    if (link) return link
  }
  return null
}
