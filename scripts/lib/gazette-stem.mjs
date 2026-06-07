import path from 'node:path'
import { access } from 'node:fs/promises'
import {
  buildSelfHostedPdfUrlsFromStem,
  normalizeStoredHostedPath,
  noticeKeyToStem,
  parseEgazetteArchiveFilename,
} from './egazette-pdf-urls.mjs'
import { extractNoticeNumber } from './street-naming-core.mjs'

/** Colonial: 1909-gn184 or 1975-gn702-703 */
export const COLONIAL_STEM_RE = /^\d{4}-gn[\d-]+$/i

/** Modern eGazette: 2023-27-22-3377 */
export const MODERN_STEM_RE = /^\d{4}-\d+-\d+-\d+$/

export function normalizeNoticeStem(stem) {
  const text = String(stem ?? '').trim()
  if (!text) return null
  const colonial = text.match(/^(\d{4})-gn(\d+)$/i)
  if (colonial) return `${colonial[1]}-gn${colonial[2]}`
  return text
}

export function isValidNoticeStem(stem) {
  const normalized = normalizeNoticeStem(stem)
  if (!normalized) return false
  return COLONIAL_STEM_RE.test(normalized) || MODERN_STEM_RE.test(normalized)
}

export function stemFromHostedUrl(url) {
  const normalized = normalizeStoredHostedPath(url)
  if (!normalized || !normalized.startsWith('/egazette/')) return null
  const match = normalized.match(/\/egazette\/(?:en|zh)\/([^/]+)\.pdf$/i)
  return match ? normalizeNoticeStem(match[1]) : null
}

export function isSelfHostedGazetteUrl(url) {
  const normalized = normalizeStoredHostedPath(url)
  return Boolean(normalized && normalized.startsWith('/egazette/'))
}

export function isExternalGazetteUrl(url) {
  const text = String(url ?? '').trim()
  return /^https?:\/\//i.test(text)
}

export function stemFromColonialGn(publicationDate, noticeNo) {
  const num = extractNoticeNumber(noticeNo)
  const year = String(publicationDate ?? '').slice(0, 4)
  if (!num || !/^\d{4}$/.test(year)) return null
  const raw = String(noticeNo ?? '').trim().toUpperCase()
  if (!raw || raw === 'GNCROWD' || raw === 'GNUNKNOWN') return null
  return `${year}-gn${num}`
}

export function stemFromEventId(eventId) {
  const text = String(eventId ?? '').replace(/-\d{5}$/, '')
  const colonial = text.match(/(\d{4}-gn\d+(?:-\d+)*)/i)
  if (colonial) {
    const candidate = normalizeNoticeStem(colonial[1])
    if (isValidNoticeStem(candidate)) return candidate
  }
  const modern = text.match(/(\d{4}-\d+-\d+-\d+)/)
  if (modern) return modern[1]
  return null
}

export function stemFromSubmissionId(submissionId) {
  return stemFromEventId(submissionId)
}

/** Infer canonical hosted PDF stem for an event. Hosted URL stems win over stored notice_stem. */
export function resolveNoticeStem(event) {
  if (!event || typeof event !== 'object') return null

  if (event.notice_key) {
    const fromKey = noticeKeyToStem(event.notice_key)
    if (fromKey && isValidNoticeStem(fromKey)) return fromKey
  }

  for (const url of [event.government_notice_url_en, event.government_notice_url_zh]) {
    const fromUrl = stemFromHostedUrl(url)
    if (fromUrl && isValidNoticeStem(fromUrl)) return fromUrl
  }

  const existing = normalizeNoticeStem(event.notice_stem)
  if (existing && isValidNoticeStem(existing)) return existing

  for (const ref of [event.submission_id, event.event_id]) {
    const fromId = stemFromSubmissionId(ref)
    if (fromId && isValidNoticeStem(fromId)) return fromId
  }

  const colonial = stemFromColonialGn(event.publication_date, event.notice_no)
  if (colonial && isValidNoticeStem(colonial)) return colonial

  return null
}

export function expectedUrlsForStem(stem) {
  return buildSelfHostedPdfUrlsFromStem(normalizeNoticeStem(stem))
}

export function urlsMatchStem(stem, urls = {}) {
  const expected = expectedUrlsForStem(stem)
  const en = normalizeStoredHostedPath(urls.en)
  const zh = normalizeStoredHostedPath(urls.zh)
  const enOk = !en || !isSelfHostedGazetteUrl(en) || en === expected.en
  const zhOk = !zh || !isSelfHostedGazetteUrl(zh) || zh === expected.zh
  return enOk && zhOk
}

export async function loadPublishedStemSet(projectRoot) {
  const enDir = path.join(projectRoot, 'public', 'egazette', 'en')
  const zhDir = path.join(projectRoot, 'public', 'egazette', 'zh')
  const stems = new Map()

  const scan = async (dir, lang) => {
    let files = []
    try {
      const { readdir } = await import('node:fs/promises')
      files = await readdir(dir)
    } catch {
      return
    }
    for (const name of files) {
      if (!name.toLowerCase().endsWith('.pdf')) continue
      const stem = normalizeNoticeStem(name.replace(/\.pdf$/i, ''))
      if (!stem) continue
      const entry = stems.get(stem) ?? { en: false, zh: false }
      entry[lang] = true
      stems.set(stem, entry)
    }
  }

  await scan(enDir, 'en')
  await scan(zhDir, 'zh')
  return stems
}

export async function publishedPdfExists(stem, lang, projectRoot) {
  const normalized = normalizeNoticeStem(stem)
  if (!normalized) return false
  const filePath = path.join(projectRoot, 'public', 'egazette', lang, `${normalized}.pdf`)
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export function eventNeedsHostedPrimaryPdf(event) {
  if (!event) return false
  if (event.evidence_kind !== 'gazette_primary') return false
  if (isExternalGazetteUrl(event.government_notice_url_en)) return false
  if (isExternalGazetteUrl(event.government_notice_url_zh)) return false
  if (isSelfHostedGazetteUrl(event.government_notice_url_en)) return true
  if (isSelfHostedGazetteUrl(event.government_notice_url_zh)) return true
  if (event.notice_stem) return true
  if (event.notice_key) return true
  return false
}

export function backfillEventGazetteFields(event, publishedStems) {
  const next = { ...event }
  let changed = false

  const stem = resolveNoticeStem(next)
  if (stem && next.notice_stem !== stem) {
    next.notice_stem = stem
    changed = true
  }

  if (!stem) return { event: next, changed }

  const expected = expectedUrlsForStem(stem)
  const locales = publishedStems?.get(stem)

  if (locales?.en && !isExternalGazetteUrl(next.government_notice_url_en)) {
    if (next.government_notice_url_en !== expected.en) {
      next.government_notice_url_en = expected.en
      changed = true
    }
  }

  if (locales?.zh && !isExternalGazetteUrl(next.government_notice_url_zh)) {
    if (next.government_notice_url_zh !== expected.zh) {
      next.government_notice_url_zh = expected.zh
      changed = true
    }
  }

  return { event: next, changed }
}

export function lintEventGazette(event, options = {}) {
  const issues = []
  const stem = normalizeNoticeStem(event.notice_stem) ?? resolveNoticeStem(event)
  const enUrl = normalizeStoredHostedPath(event.government_notice_url_en)
  const zhUrl = normalizeStoredHostedPath(event.government_notice_url_zh)

  if (stem && !isValidNoticeStem(stem)) {
    issues.push({ level: 'error', code: 'invalid_stem', message: `Invalid notice_stem: ${stem}` })
  }

  if (enUrl && isSelfHostedGazetteUrl(enUrl)) {
    const urlStem = stemFromHostedUrl(enUrl)
    if (!urlStem) {
      issues.push({ level: 'error', code: 'bad_url', message: `Malformed EN URL: ${enUrl}` })
    } else if (stem && urlStem !== stem) {
      issues.push({
        level: 'error',
        code: 'stem_url_mismatch',
        message: `notice_stem ${stem} ≠ EN URL stem ${urlStem}`,
      })
    } else if (!stem) {
      issues.push({
        level: 'warn',
        code: 'missing_stem',
        message: `Self-hosted EN URL without notice_stem: ${enUrl}`,
      })
    }
  }

  if (zhUrl && isSelfHostedGazetteUrl(zhUrl)) {
    const urlStem = stemFromHostedUrl(zhUrl)
    if (stem && urlStem && urlStem !== stem) {
      issues.push({
        level: 'error',
        code: 'stem_url_mismatch',
        message: `notice_stem ${stem} ≠ ZH URL stem ${urlStem}`,
      })
    }
  }

  if (stem && (isSelfHostedGazetteUrl(enUrl) || isSelfHostedGazetteUrl(zhUrl))) {
    if (!urlsMatchStem(stem, { en: enUrl, zh: zhUrl })) {
      issues.push({
        level: 'error',
        code: 'url_pattern',
        message: `URLs must be /egazette/{en|zh}/${stem}.pdf`,
      })
    }
  }

  if (eventNeedsHostedPrimaryPdf(event) && isSelfHostedGazetteUrl(enUrl)) {
    if (!stem) {
      issues.push({
        level: 'error',
        code: 'primary_missing_stem',
        message: 'Self-hosted gazette_primary event needs notice_stem',
      })
    } else if (options.requirePublishedPdf !== false) {
      const hasEn = options.publishedStems?.get(stem)?.en
      if (!hasEn) {
        issues.push({
          level: 'error',
          code: 'missing_pdf',
          message: `Missing public/egazette/en/${stem}.pdf`,
        })
      }
    }
  }

  return issues
}

/** Parse inbox/archive filename → stem (for contributor docs + lint helpers). */
export function stemFromPdfFilename(filename) {
  const parsed = parseEgazetteArchiveFilename(filename)
  if (parsed?.stem) return normalizeNoticeStem(parsed.stem)
  return stemFromHostedUrl(`/egazette/en/${filename}`)
}
