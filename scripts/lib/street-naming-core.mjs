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

/** Extract numeric notice id from G.N. / 第…號 / plain digits. */
export function extractNoticeNumber(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  const compact = value.replace(/\s+/g, '')
  if (/^\d+$/.test(compact)) return compact
  const match = value.match(/(?:G\.?\s*N\.?\s*|第\s*)?(\d+)/i)
  return match?.[1] ?? null
}

/**
 * When submitters enter digits only (e.g. "323"), emit LandsD-style bilingual labels.
 * EN: G.N.323 — ZH: 第323號
 */
export function formatGovernmentNoticeLabels(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return { en: null, zh: null }

  const compact = value.replace(/\s+/g, '')
  const digitsOnly = /^\d+$/.test(compact)
  const num = extractNoticeNumber(value)
  if (!num) return { en: value, zh: value }

  if (digitsOnly) {
    return { en: `G.N.${num}`, zh: `第${num}號` }
  }

  const hasEnGn = /G\.?\s*N\.?/i.test(value)
  const hasZhDih = /第/.test(value)
  return {
    en: hasEnGn ? value.replace(/\s+/g, '') : `G.N.${num}`,
    zh: hasZhDih ? value : `第${num}號`,
  }
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

export function normalizeNamingDateExclusions(raw) {
  return {
    streetKeys: new Set(raw?.street_keys ?? []),
    streetCodes: new Set((raw?.street_codes ?? []).map(String)),
  }
}

function isExcludedStreetKey(streetKey, exclusions) {
  return exclusions?.streetKeys?.has(streetKey) ?? false
}

export function aggregateByStreet(events, options = {}) {
  const exclusions = options.namingDateExclusions ?? null
  const grouped = groupBy(events, (item) => makeStreetKey(item.street_name_en, item.street_name_zh))
  const aggregates = []

  for (const [streetKey, group] of grouped.entries()) {
    if (streetKey === '|') continue
    const ordered = group.toSorted((a, b) => a.publication_date.localeCompare(b.publication_date))
    const declaration = ordered.find((event) => event.is_declaration_event)
    let canonicalNamingDate = declaration?.publication_date ?? null
    let canonicalNamingYear = canonicalNamingDate ? Number(canonicalNamingDate.slice(0, 4)) : null
    let derivationReason = declaration ? 'declaration_earliest' : 'no_declaration_found'
    if (isExcludedStreetKey(streetKey, exclusions)) {
      canonicalNamingDate = null
      canonicalNamingYear = null
      derivationReason = 'excluded_manual'
    }
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

export function resolveNamingSource(aggregate, options = {}) {
  const history = aggregate?.event_history ?? []
  const sources = new Set(history.map((e) => e.source).filter(Boolean))
  const hasCrowd = sources.has('crowdsubmitted')
  const hasLandsd = sources.has('landsd')
  const hasEgazette = sources.has('egazette_pdf')
  if ([hasCrowd, hasLandsd, hasEgazette].filter(Boolean).length >= 2) return 'combined'
  if (hasCrowd) return 'crowdsubmitted'
  if (hasLandsd && hasEgazette) return 'combined'
  if (hasEgazette) return 'egazette_pdf'
  if (options.defaultSource) return options.defaultSource
  return hasLandsd ? 'landsd_2016_plus' : null
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

  const excludedCodes = options.namingDateExclusions?.streetCodes ?? new Set()

  const features = sourceData.features.map((feature) => {
    const props = feature.properties ?? {}
    const streetCode = String(props.STREETCODE ?? '').trim()
    if (streetCode && excludedCodes.has(streetCode)) {
      unmatched += 1
      return {
        ...feature,
        properties: {
          ...props,
          naming_year: null,
          naming_date: null,
          naming_source: null,
          naming_derivation_reason: 'excluded_manual',
          naming_event_count: 0,
        },
      }
    }

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

    const excluded = isExcludedStreetKey(key, options.namingDateExclusions)

    return {
      ...feature,
      properties: {
        ...props,
        naming_year: excluded ? null : (fallback?.canonical_naming_year ?? null),
        naming_date: excluded ? null : (fallback?.canonical_naming_date ?? null),
        naming_source: excluded ? null : fallback ? resolveNamingSource(fallback, options) : null,
        naming_derivation_reason: excluded
          ? 'excluded_manual'
          : (fallback?.derivation_reason ?? null),
        naming_event_count: excluded ? 0 : (fallback?.event_count ?? 0),
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

export function mergeEvents(landsdEvents, egazetteEvents, crowdEvents = []) {
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
  for (const event of crowdEvents) {
    const key = eventDedupeKey(event)
    if (!merged.has(key)) {
      merged.set(key, { ...event, source: event.source ?? 'crowdsubmitted' })
    }
  }
  return [...merged.values()].toSorted((a, b) => {
    const dateCmp = String(a.publication_date ?? '').localeCompare(String(b.publication_date ?? ''))
    if (dateCmp !== 0) return dateCmp
    return String(a.notice_no ?? '').localeCompare(String(b.notice_no ?? ''))
  })
}

export function finalizeCrowdEvent(raw, index = 0) {
  const publicationDate = String(raw.publication_date ?? '').trim()
  const rawNoticeInput =
    raw.gazette_notice_label ?? raw.government_notice_label_en ?? raw.notice_no ?? null
  const noticeLabels = formatGovernmentNoticeLabels(rawNoticeInput)
  const noticeNo = normalizeNoticeNo(rawNoticeInput ?? 'CROWD')
  const submissionId = String(raw.submission_id ?? raw.submissionId ?? index).trim()
  const isDecl = raw.is_declaration_event !== false

  return {
    event_id: raw.event_id ?? `crowd|${submissionId}`,
    source: 'crowdsubmitted',
    publication_date: publicationDate,
    street_name_en: raw.street_name_en ?? null,
    street_name_zh: raw.street_name_zh ?? null,
    district_raw_en: null,
    district_raw_zh: null,
    notice_type_raw_en: 'Declaration of street name (crowdsource)',
    notice_type_raw_zh: '街道命名（眾包）',
    notice_type_normalized: isDecl ? 'declaration' : 'other',
    notice_no: noticeNo,
    government_notice_label_en:
      raw.government_notice_label_en ?? noticeLabels.en,
    government_notice_label_zh:
      raw.government_notice_label_zh ?? noticeLabels.zh,
    government_notice_url_en: raw.government_notice_url_en ?? raw.gazette_url ?? null,
    government_notice_url_zh: raw.government_notice_url_zh ?? null,
    related_gazette_plan_urls_en: [],
    related_gazette_plan_urls_zh: [],
    related_gazette_plan_labels_en: [],
    related_gazette_plan_labels_zh: [],
    year_bucket: publicationDate ? Number(publicationDate.slice(0, 4)) : null,
    is_declaration_event: isDecl,
    proof_pdf_url: raw.proof_pdf_url ?? null,
    submitter_remarks: raw.submitter_remarks ?? raw.remarks ?? null,
    reviewed_at: raw.reviewed_at ?? null,
    submission_id: submissionId,
  }
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
