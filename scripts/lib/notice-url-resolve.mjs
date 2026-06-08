import { access, readdir } from 'node:fs/promises'
import path from 'node:path'
import {
  buildSelfHostedPdfUrlsFromStem,
  governmentNoticeUrlsFromEvent,
  normalizeStoredHostedPath,
} from './egazette-pdf-urls.mjs'
import { extractNoticeNumber } from './street-naming-core.mjs'

const PLACEHOLDER_NOTICE = /^(crowd|unknown|n\/a|none)$/i
const EGAZETTE_BASE = '/egazette'

export function isPlaceholderNoticeLabel(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return true
  if (PLACEHOLDER_NOTICE.test(text)) return true
  return !extractNoticeNumber(text)
}

export function parseCitingFromRemarks(remarks) {
  const text = String(remarks ?? '')
  const m =
    text.match(/cited\s+in\s+G\.?\s*N\.?\s*(\d+)[^\d]{0,48}(\d{4}-\d{2}-\d{2})/i) ||
    text.match(/引述[^\d]*第?\s*(\d+)\s*號?[^\d]{0,48}(\d{4}-\d{2}-\d{2})/i)
  if (!m) return null
  return { noticeLabel: `G.N.${m[1]}`, publicationDate: m[2], noticeNo: m[1] }
}

export function urlsFromStored(enRaw, zhRaw) {
  return {
    en: normalizeStoredHostedPath(enRaw) ?? null,
    zh: normalizeStoredHostedPath(zhRaw) ?? null,
  }
}

export function urlsFromStem(stem) {
  return buildSelfHostedPdfUrlsFromStem(stem, EGAZETTE_BASE)
}

/** Drop hosted PDF paths when the file is not published under public/egazette. */
export async function filterUrlsToPublishedFiles(urls, options = {}) {
  const enDir = options.enDir ?? path.join(options.projectRoot ?? '', 'public', 'egazette', 'en')
  const zhDir = options.zhDir ?? path.join(options.projectRoot ?? '', 'public', 'egazette', 'zh')
  const next = { en: urls?.en ?? null, zh: urls?.zh ?? null }

  const check = async (url, dir) => {
    if (!url) return null
    const name = String(url).match(/\/([^/]+\.pdf)$/i)?.[1]
    if (!name) return url
    try {
      await access(path.join(dir, name))
      return url
    } catch {
      return null
    }
  }

  next.en = await check(next.en, enDir)
  next.zh = await check(next.zh, zhDir)
  return next
}

/** stem → ["en","zh"] for PDFs that exist on disk */
export async function buildPdfLocaleIndex(options = {}) {
  const enDir = options.enDir ?? path.join(options.projectRoot ?? '', 'public', 'egazette', 'en')
  const zhDir = options.zhDir ?? path.join(options.projectRoot ?? '', 'public', 'egazette', 'zh')
  const map = {}

  const addDir = async (dir, lang) => {
    let files = []
    try {
      files = await readdir(dir)
    } catch {
      return
    }
    for (const name of files) {
      if (!name.endsWith('.pdf')) continue
      const stem = name.replace(/\.pdf$/i, '')
      if (!map[stem]) map[stem] = []
      if (!map[stem].includes(lang)) map[stem].push(lang)
    }
  }

  await addDir(enDir, 'en')
  await addDir(zhDir, 'zh')
  return map
}

export function urlsFromNoticeStemIndex(noticeNo, index) {
  const num = extractNoticeNumber(noticeNo)
  if (!num || !index) return { en: null, zh: null }
  const stem = index[num] ?? index[String(num)]
  return urlsFromStem(stem)
}

export function urlsFromLegacyGnPath(publicationDate, noticeNo) {
  const num = extractNoticeNumber(noticeNo)
  const year = String(publicationDate ?? '').slice(0, 4)
  if (!num || !/^\d{4}$/.test(year)) return { en: null, zh: null }
  return urlsFromStem(`${year}-gn${num}`)
}

export function urlsFromEventHistory(history, noticeNo) {
  const target = extractNoticeNumber(noticeNo)
  if (!target || !Array.isArray(history)) return { en: null, zh: null }

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const event = history[i]
    const eventNo = extractNoticeNumber(
      event?.notice_no ?? event?.government_notice_label_en ?? event?.government_notice_label_zh,
    )
    if (eventNo !== target) continue
    const urls = urlsFromStored(event?.government_notice_url_en, event?.government_notice_url_zh)
    if (urls.en || urls.zh) return urls
    if (event?.notice_key) {
      const stem = String(event.notice_key).match(/^(\d+-\d+-\d+-\d+)-\d+$/)?.[1]
      const fromStem = urlsFromStem(stem)
      if (fromStem.en || fromStem.zh) return fromStem
    }
  }
  return { en: null, zh: null }
}

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

/** @param {string} egazetteEnDir */
export async function buildNoticeStemIndex(egazetteEnDir) {
  const index = {}
  let files = []
  try {
    files = await readdir(egazetteEnDir)
  } catch {
    return index
  }
  for (const name of files) {
    if (!name.endsWith('.pdf')) continue
    const stem = name.replace(/\.pdf$/i, '')
    const num = stem.split('-').pop()
    if (num && /^\d+$/.test(num)) index[num] = stem
  }
  return index
}

export async function enrichDerivedFromEntry(entry, context) {
  if (!entry || typeof entry !== 'object') return entry
  const next = { ...entry }
  let urls = resolveDerivedCitationUrls(next, context)
  if (context.filterPublished) {
    urls = await filterUrlsToPublishedFiles(urls, context)
  }
  next.government_notice_url_en =
    next.government_notice_url_en ?? urls.en ?? null
  next.government_notice_url_zh =
    next.government_notice_url_zh ?? urls.zh ?? null
  if (!next.notice_label) {
    const parsed = parseCitingFromRemarks(context.remarks)
    if (parsed) next.notice_label = parsed.noticeLabel
  }
  if (!next.publication_date) {
    const parsed = parseCitingFromRemarks(context.remarks)
    if (parsed) next.publication_date = parsed.publicationDate
  }
  return next
}

export async function resolveAggregateNoticeUrls(aggregate, noticeIndex, options = {}) {
  const history = Array.isArray(aggregate?.event_history) ? aggregate.event_history : []
  const canonicalEventId = aggregate?.canonical_evidence_event_id
  const canonicalEvent =
    (canonicalEventId && history.find((e) => e.event_id === canonicalEventId)) ||
    history.find(
      (e) =>
        e.evidence_kind === aggregate?.canonical_evidence_kind &&
        e.publication_date === aggregate?.canonical_naming_date,
    ) ||
    null

  const derived = canonicalEvent?.derived_from?.[0]
  if (derived) {
    const enriched = await enrichDerivedFromEntry(derived, {
      remarks: canonicalEvent?.submitter_remarks,
      history,
      noticeIndex,
      filterPublished: options.filterPublished,
      projectRoot: options.projectRoot,
    })
    let urls = urlsFromStored(enriched.government_notice_url_en, enriched.government_notice_url_zh)
    if (options.filterPublished) {
      urls = await filterUrlsToPublishedFiles(urls, options)
    }
    if (urls.en || urls.zh) return { urls, derivedFrom: [enriched], canonicalEvent }
  }

  if (canonicalEvent) {
    let fromCanonical = governmentNoticeUrlsFromEvent(canonicalEvent)
    if (options.filterPublished) {
      fromCanonical = await filterUrlsToPublishedFiles(fromCanonical, options)
    }
    if (fromCanonical.en || fromCanonical.zh) {
      return {
        urls: fromCanonical,
        derivedFrom: canonicalEvent?.derived_from ?? null,
        canonicalEvent,
      }
    }
  }

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const event = history[i]
    let fromEvent = governmentNoticeUrlsFromEvent(event)
    if (options.filterPublished) {
      fromEvent = await filterUrlsToPublishedFiles(fromEvent, options)
    }
    if (fromEvent.en || fromEvent.zh) {
      return { urls: fromEvent, derivedFrom: canonicalEvent?.derived_from ?? null, canonicalEvent }
    }
  }

  return { urls: { en: null, zh: null }, derivedFrom: canonicalEvent?.derived_from ?? null, canonicalEvent }
}
