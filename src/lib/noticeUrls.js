import { extractNoticeNumber, formatNoticeLabel } from './formatNoticeLabel.js'
import { resolveHostedUrl } from './resolveHostedUrl.js'

const PLACEHOLDER_NOTICE = /^(crowd|unknown|n\/a|none)$/i
const EGAZETTE_BASE = '/egazette'

/** @param {string | null | undefined} raw */
export function isPlaceholderNoticeLabel(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return true
  if (PLACEHOLDER_NOTICE.test(text)) return true
  return !extractNoticeNumber(text)
}

/** Parse "cited in G.N.8147 (2025-12-19)" from submitter remarks. */
export function parseCitingFromRemarks(remarks) {
  const text = String(remarks ?? '')
  const m =
    text.match(/cited\s+in\s+G\.?\s*N\.?\s*(\d+)[^\d]{0,48}(\d{4}-\d{2}-\d{2})/i) ||
    text.match(/引述[^\d]*第?\s*(\d+)\s*號?[^\d]{0,48}(\d{4}-\d{2}-\d{2})/i)
  if (!m) return null
  return { noticeLabel: `G.N.${m[1]}`, publicationDate: m[2], noticeNo: m[1] }
}

export function urlsFromStem(stem) {
  if (!stem) return { en: null, zh: null }
  return {
    en: resolveHostedUrl(`${EGAZETTE_BASE}/en/${stem}.pdf`),
    zh: resolveHostedUrl(`${EGAZETTE_BASE}/zh/${stem}.pdf`),
  }
}

/** @param {string | null | undefined} hostedPath */
export function stemFromHostedPath(hostedPath) {
  const text = String(hostedPath ?? '')
  const archive = text.match(/\/(\d{4}-\d{2}-\d{2}-\d+)\.pdf/i)
  if (archive) return archive[1]
  const legacy = text.match(/\/(\d{4}-gn\d+)\.pdf/i)
  if (legacy) return legacy[1]
  return null
}

/**
 * Pick a PDF URL that exists on the site (see egazette-pdf-locales.json).
 * @param {{ en?: string | null, zh?: string | null }} urls
 * @param {'en' | 'zh'} locale
 * @param {Record<string, string[]> | null | undefined} pdfLocales stem → ['en','zh']
 */
export function pickHostedNoticeUrl(urls, locale, pdfLocales) {
  const en = urls?.en ?? null
  const zh = urls?.zh ?? null
  if (!en && !zh) return null
  const stem = stemFromHostedPath(en || zh)
  const langs = stem && pdfLocales ? pdfLocales[stem] : null
  if (locale === 'zh') {
    if (zh && (!langs || langs.includes('zh'))) return zh
    return en
  }
  if (en && (!langs || langs.includes('en'))) return en
  return zh
}

export function urlsFromStored(enRaw, zhRaw) {
  return {
    en: resolveHostedUrl(enRaw) ?? null,
    zh: resolveHostedUrl(zhRaw) ?? null,
  }
}

/** @param {string | null | undefined} noticeNo @param {Record<string, string> | null | undefined} index */
export function urlsFromNoticeStemIndex(noticeNo, index) {
  const num = extractNoticeNumber(noticeNo)
  if (!num || !index) return { en: null, zh: null }
  const stem = index[num] ?? index[String(num)]
  return urlsFromStem(stem)
}

/** Try legacy hosted path {year}-gn{no}.pdf */
export function urlsFromLegacyGnPath(publicationDate, noticeNo) {
  const num = extractNoticeNumber(noticeNo)
  const year = String(publicationDate ?? '').slice(0, 4)
  if (!num || !/^\d{4}$/.test(year)) return { en: null, zh: null }
  return urlsFromStem(`${year}-gn${num}`)
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} history
 * @param {string | null | undefined} noticeNo
 */
export function urlsFromEventHistory(history, noticeNo) {
  const target = extractNoticeNumber(noticeNo)
  if (!target || !Array.isArray(history)) return { en: null, zh: null }

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const event = history[i]
    const eventNo = extractNoticeNumber(
      event?.notice_no ?? event?.government_notice_label_en ?? event?.government_notice_label_zh,
    )
    if (eventNo !== target) continue
    const urls = urlsFromStored(
      event?.government_notice_url_en,
      event?.government_notice_url_zh,
    )
    if (urls.en || urls.zh) return urls
    if (event?.notice_key) {
      const stem = String(event.notice_key).match(/^(\d+-\d+-\d+-\d+)-\d+$/)?.[1]
      const fromStem = urlsFromStem(stem)
      if (fromStem.en || fromStem.zh) return fromStem
    }
  }
  return { en: null, zh: null }
}

/**
 * @param {Record<string, unknown> | null | undefined} entry
 * @param {{ remarks?: string | null, history?: unknown[], noticeIndex?: Record<string, string> | null, batchUrls?: { en?: string | null, zh?: string | null } }} context
 */
export function resolveDerivedCitationUrls(entry, context = {}) {
  if (!entry) return { en: null, zh: null }

  let urls = urlsFromStored(entry.government_notice_url_en, entry.government_notice_url_zh)
  if (urls.en || urls.zh) return urls

  if (context.batchUrls?.en || context.batchUrls?.zh) {
    return urlsFromStored(context.batchUrls.en, context.batchUrls.zh)
  }

  const remarks = parseCitingFromRemarks(context.remarks)
  const citingNo =
    extractNoticeNumber(entry.notice_label) ??
    remarks?.noticeNo ??
    extractNoticeNumber(entry.cited_notice_label)
  const citingDate = entry.publication_date ?? remarks?.publicationDate ?? null

  urls = urlsFromEventHistory(context.history, citingNo)
  if (urls.en || urls.zh) return urls

  urls = urlsFromNoticeStemIndex(citingNo, context.noticeIndex)
  if (urls.en || urls.zh) return urls

  return urlsFromLegacyGnPath(citingDate, citingNo)
}

/**
 * Resolve hosted PDF URLs for a naming_details aggregate.
 * @param {Record<string, unknown> | null | undefined} details
 * @param {{ noticeIndex?: Record<string, string> | null, eventHistory?: unknown[] }} options
 */
export function resolveNoticeUrlsForDetails(details, options = {}) {
  if (!details) return { en: null, zh: null }

  const history = options.eventHistory ?? details.event_history ?? null
  const noticeIndex = options.noticeIndex ?? null
  const canonical =
    details.name_history?.find((item) => item.date === details.canonical_naming_date) ??
    details.name_history?.[details.name_history.length - 1]

  let urls = urlsFromStored(
    details.government_notice_url_en,
    details.government_notice_url_zh,
  )
  if (urls.en || urls.zh) return urls

  const kind = String(details.canonical_evidence_kind ?? details.evidence_kind ?? '').trim()
  const derived = details.derived_from?.[0]

  if (kind === 'gazette_inferred' && derived) {
    urls = resolveDerivedCitationUrls(derived, {
      remarks: canonical?.submitter_remarks,
      history,
      noticeIndex,
    })
    if (urls.en || urls.zh) return urls
  }

  if (canonical) {
    urls = urlsFromStored(canonical.notice_url_en, canonical.notice_url_zh)
    if (urls.en || urls.zh) return urls
  }

  const noticeNo =
    details.notice_no ??
    details.government_notice_label_en ??
    details.government_notice_label_zh
  urls = urlsFromEventHistory(history, noticeNo)
  if (urls.en || urls.zh) return urls

  urls = urlsFromNoticeStemIndex(noticeNo, noticeIndex)
  if (urls.en || urls.zh) return urls

  if (details.notice_key) {
    const stem = String(details.notice_key).match(/^(\d+-\d+-\d+-\d+)-\d+$/)?.[1]
    urls = urlsFromStem(stem)
    if (urls.en || urls.zh) return urls
  }

  return urlsFromLegacyGnPath(details.canonical_naming_date, noticeNo)
}

/** Best label for 來源 column (skips CROWD placeholders). */
export function resolveNoticeDisplayLabel(details, locale) {
  if (!details) return null

  const kind = String(details.canonical_evidence_kind ?? details.evidence_kind ?? '').trim()
  const derived = details.derived_from?.[0]
  const loc = locale === 'zh' ? 'zh' : 'en'

  if (kind === 'gazette_inferred' && derived) {
    const citingRaw = derived.notice_label
    const citedRaw = derived.cited_notice_label
    const raw = citingRaw && !isPlaceholderNoticeLabel(citingRaw) ? citingRaw : citedRaw
    if (raw && !isPlaceholderNoticeLabel(raw)) {
      return formatNoticeLabel(raw, loc)
    }
  }

  const rawEn = details.government_notice_label_en
  const rawZh = details.government_notice_label_zh
  const raw = loc === 'zh' ? rawZh || rawEn : rawEn || rawZh
  if (!raw || isPlaceholderNoticeLabel(raw)) return null
  return formatNoticeLabel(raw, loc)
}
