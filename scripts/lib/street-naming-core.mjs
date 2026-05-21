export const DECLARATION_PATTERNS = [
  /declaration of street name/i,
  /宣布街道名稱/,
]

export const NOTICE_TYPE_PATTERNS = [
  { id: 'declaration', en: /declaration of street name/i, tc: /宣布街道名稱/ },
  { id: 'replace_description', en: /replacing description of street/i, tc: /取代街道說明/ },
  {
    id: 'notice_intention_change',
    en: /notice of intention to change street name/i,
    tc: /擬更改街道名稱公告/,
  },
  {
    id: 'declaration_change',
    en: /declaration to change street name/i,
    tc: /宣布更改街道名稱/,
  },
  {
    id: 'declaration_delete',
    en: /declaration to delete street name/i,
    tc: /宣布删除街道名稱/,
  },
  { id: 'corrigendum', en: /corrigendum/i, tc: /更正|勘誤/ },
]

export function normalizeStreetName(name) {
  const value = String(name ?? '').trim()
  if (!value) return ''
  if (/^[A-Z0-9\s\-'.]+$/.test(value) && /[A-Z]{2,}/.test(value)) {
    return value
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
  return value
}

export function normalizeNoticeNo(raw) {
  const value = String(raw ?? '').replace(/\s+/g, '').toUpperCase()
  const match = value.match(/(?:G\.N\.?|第)?(\d+)/)
  return match ? `GN${match[1]}` : value
}

/** Pre-2016 eGazette category header for section 111C street-naming declarations. */
const LEGACY_DECLARATION_HEADER_EN = /^(STREET NAMES?|street naming|Street Name)$/i

function isLegacyStreetNamingDeclaration(noticeTypeEn, noticeTypeTc) {
  const en = String(noticeTypeEn ?? '').trim()
  const tc = String(noticeTypeTc ?? '').trim()
  if (!en || !tc || !/街道命名/.test(tc)) return false
  return LEGACY_DECLARATION_HEADER_EN.test(en)
}

export function normalizeNoticeType(noticeTypeEn, noticeTypeTc) {
  for (const pattern of NOTICE_TYPE_PATTERNS) {
    if (
      (noticeTypeEn && pattern.en.test(noticeTypeEn)) ||
      (noticeTypeTc && pattern.tc.test(noticeTypeTc))
    ) {
      return pattern.id
    }
  }
  if (isLegacyStreetNamingDeclaration(noticeTypeEn, noticeTypeTc)) return 'declaration'
  return 'other'
}

export function isDeclarationEvent(noticeTypeEn, noticeTypeTc) {
  if (
    DECLARATION_PATTERNS.some(
      (pattern) =>
        (noticeTypeEn && pattern.test(noticeTypeEn)) ||
        (noticeTypeTc && pattern.test(noticeTypeTc)),
    )
  ) {
    return true
  }
  return isLegacyStreetNamingDeclaration(noticeTypeEn, noticeTypeTc)
}

export function classifyEgazetteEvent(event) {
  const noticeTypeEn = event.notice_type_raw_en ?? null
  const noticeTypeTc = event.notice_type_raw_zh ?? null
  const isDecl = isDeclarationEvent(noticeTypeEn, noticeTypeTc)
  return {
    ...event,
    notice_type_normalized: isDecl ? 'declaration' : normalizeNoticeType(noticeTypeEn, noticeTypeTc),
    is_declaration_event: isDecl,
  }
}

export function makeStreetKey(streetNameEn, streetNameZh) {
  return `${normalizeStreetName(streetNameEn)}|${String(streetNameZh ?? '').trim()}`
}

export function eventDedupeKey(event) {
  const en = normalizeStreetName(event.street_name_en)
  const zh = String(event.street_name_zh ?? '').trim()
  return `${event.publication_date}|${event.notice_no}|${en}|${zh}`
}

export function groupBy(items, keyFn) {
  const map = new Map()
  for (const item of items) {
    const key = keyFn(item)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  }
  return map
}

export function aggregateByStreet(events) {
  const grouped = groupBy(events, (item) => makeStreetKey(item.street_name_en, item.street_name_zh))
  const aggregates = []

  for (const [streetKey, group] of grouped.entries()) {
    if (streetKey === '|') continue
    const ordered = group.toSorted((a, b) => a.publication_date.localeCompare(b.publication_date))
    const declaration = ordered.find((event) => event.is_declaration_event)
    const canonicalNamingDate = declaration?.publication_date ?? null
    const canonicalNamingYear = canonicalNamingDate ? Number(canonicalNamingDate.slice(0, 4)) : null
    const derivationReason = declaration ? 'declaration_earliest' : 'no_declaration_found'
    const [streetNameEn, streetNameZh] = streetKey.split('|')

    aggregates.push({
      street_key: streetKey,
      street_name_en: streetNameEn || null,
      street_name_zh: streetNameZh || null,
      canonical_naming_date: canonicalNamingDate,
      canonical_naming_year: canonicalNamingYear,
      derivation_reason: derivationReason,
      event_history: ordered,
      event_count: ordered.length,
    })
  }

  return aggregates
}

function buildUniqueNameMap(aggregates, field) {
  const counts = new Map()
  for (const item of aggregates) {
    const value = String(item[field] ?? '').trim()
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const uniqueMap = new Map()
  for (const item of aggregates) {
    const value = String(item[field] ?? '').trim()
    if (!value || counts.get(value) !== 1) continue
    uniqueMap.set(value, item)
  }
  return uniqueMap
}

function resolveNamingSource(aggregate, options = {}) {
  const history = aggregate?.event_history ?? []
  const sources = new Set(history.map((e) => e.source).filter(Boolean))
  if (sources.has('landsd') && sources.has('egazette_pdf')) return 'combined'
  if (sources.has('egazette_pdf')) return 'egazette_pdf'
  if (options.defaultSource) return options.defaultSource
  return sources.has('landsd') ? 'landsd_2016_plus' : null
}

export function enrichGeojson(sourceData, aggregates, options = {}) {
  const byKey = new Map(aggregates.map((item) => [item.street_key, item]))
  const byEnUnique = buildUniqueNameMap(aggregates, 'street_name_en')
  const byZhUnique = buildUniqueNameMap(aggregates, 'street_name_zh')

  const enNormMap = new Map()
  const zhNormMap = new Map()
  for (const item of aggregates) {
    const enNorm = normalizeStreetName(item.street_name_en)
    const zhNorm = String(item.street_name_zh ?? '').trim()
    if (enNorm && !enNormMap.has(enNorm)) enNormMap.set(enNorm, item)
    if (zhNorm && !zhNormMap.has(zhNorm)) zhNormMap.set(zhNorm, item)
  }

  let matchedExact = 0
  let matchedFallback = 0
  let unmatched = 0

  const features = sourceData.features.map((feature) => {
    const props = feature.properties ?? {}
    const en = String(props.ENGLISHSTREETNAME ?? '').trim()
    const zh = String(props.CHINESESTREETNAME ?? '').trim()
    const key = makeStreetKey(en, zh)
    const exact = byKey.get(key)
    const enNorm = normalizeStreetName(en)
    const fallback =
      exact ??
      enNormMap.get(enNorm) ??
      zhNormMap.get(zh) ??
      byEnUnique.get(en) ??
      byZhUnique.get(zh) ??
      null

    if (exact) matchedExact += 1
    else if (fallback) matchedFallback += 1
    else unmatched += 1

    return {
      ...feature,
      properties: {
        ...props,
        naming_year: fallback?.canonical_naming_year ?? null,
        naming_date: fallback?.canonical_naming_date ?? null,
        naming_source: fallback ? resolveNamingSource(fallback, options) : null,
        naming_derivation_reason: fallback?.derivation_reason ?? null,
        naming_event_count: fallback?.event_count ?? 0,
      },
    }
  })

  return {
    enriched: {
      ...sourceData,
      name: options.geojsonName ?? 'HK_Streets_Naming',
      features,
    },
    joinStats: {
      matched_exact_features: matchedExact,
      matched_fallback_features: matchedFallback,
      unmatched_features: unmatched,
      total_features: sourceData.features.length,
    },
  }
}

export function mergeEvents(landsdEvents, egazetteEvents) {
  const merged = new Map()
  for (const event of landsdEvents) {
    merged.set(eventDedupeKey(event), { ...event, source: event.source ?? 'landsd' })
  }
  for (const event of egazetteEvents) {
    const key = eventDedupeKey(event)
    if (!merged.has(key)) {
      merged.set(key, { ...event, source: event.source ?? 'egazette_pdf' })
    }
  }
  return [...merged.values()].toSorted((a, b) => {
    const dateCmp = a.publication_date.localeCompare(b.publication_date)
    if (dateCmp !== 0) return dateCmp
    return a.notice_no.localeCompare(b.notice_no)
  })
}

import { buildSelfHostedPdfUrls } from './egazette-pdf-urls.mjs'

export function finalizeEgazetteEvent(raw, index = 0) {
  const noticeTypeEn = raw.notice_type_raw_en ?? null
  const noticeTypeTc = raw.notice_type_raw_zh ?? null
  const isDecl = isDeclarationEvent(noticeTypeEn, noticeTypeTc)
  const normalized = isDecl ? 'declaration' : normalizeNoticeType(noticeTypeEn, noticeTypeTc)
  const noticeNo = normalizeNoticeNo(raw.notice_no)
  const publicationDate = raw.publication_date
  const yearBucket = publicationDate ? Number(publicationDate.slice(0, 4)) : null
  const noticeKey = raw.notice_key ?? null
  const hosted = noticeKey ? buildSelfHostedPdfUrls(noticeKey) : { en: null, zh: null }

  return {
    event_id: raw.event_id ?? `${publicationDate}|${noticeNo}|${index}`,
    source: 'egazette_pdf',
    publication_date: publicationDate,
    street_name_en: raw.street_name_en ?? null,
    street_name_zh: raw.street_name_zh ?? null,
    district_raw_en: raw.district_raw_en ?? null,
    district_raw_zh: raw.district_raw_zh ?? null,
    notice_type_raw_en: noticeTypeEn,
    notice_type_raw_zh: noticeTypeTc,
    notice_type_normalized: normalized,
    notice_no: noticeNo,
    government_notice_label_en: raw.government_notice_label_en ?? null,
    government_notice_label_zh: raw.government_notice_label_zh ?? null,
    government_notice_url_en: raw.government_notice_url_en ?? hosted.en,
    government_notice_url_zh: raw.government_notice_url_zh ?? hosted.zh,
    related_gazette_plan_urls_en: raw.related_gazette_plan_urls_en ?? [],
    related_gazette_plan_urls_zh: raw.related_gazette_plan_urls_zh ?? [],
    related_gazette_plan_labels_en: raw.related_gazette_plan_labels_en ?? [],
    related_gazette_plan_labels_zh: raw.related_gazette_plan_labels_zh ?? [],
    year_bucket: yearBucket,
    is_declaration_event: isDecl,
    notice_key: noticeKey,
    pdf_path_en: raw.pdf_path_en ?? null,
    pdf_path_zh: raw.pdf_path_zh ?? null,
  }
}

export function streetNamesMatch(a, b) {
  const enA = normalizeStreetName(a?.en ?? a?.street_name_en ?? a?.english_name)
  const enB = normalizeStreetName(b?.en ?? b?.street_name_en ?? b?.english_name)
  const zhA = String(a?.zh ?? a?.street_name_zh ?? a?.chinese_name ?? '').trim()
  const zhB = String(b?.zh ?? b?.street_name_zh ?? b?.chinese_name ?? '').trim()
  if (enA && enB && enA === enB) return true
  if (zhA && zhB && zhA === zhB) return true
  return false
}
