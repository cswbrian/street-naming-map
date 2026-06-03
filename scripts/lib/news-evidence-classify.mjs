import {
  classifyEgazetteNoticeText,
  isPrimaryNamingNotice,
  isReplaceDescriptionNotice,
  normalizeName,
  parseGazetteDate,
} from './egazette-evidence-classify.mjs'
import { buildSelfHostedPdfUrlsFromStem } from './egazette-pdf-urls.mjs'

const EXTENSION_ONLY_RE = /extension only|擴建|extension\s+only/i
const EXTENSION_NOTICE_RE =
  /extends from the existing|extension of the existing|is an extension of the existing/i
const HK_PLACE_RE = /hk-?place|hkplace/i
const GN_RE = /G\.?\s*N\.?\s*(\d+)/gi

export function isExtensionOnlyRemarks(remarks) {
  return EXTENSION_ONLY_RE.test(String(remarks ?? ''))
}

export function isExtensionNamingNotice(text) {
  return EXTENSION_NOTICE_RE.test(String(text ?? ''))
}

/** G.N. number called out as extension-only in remarks (do not treat its PDF as original naming). */
export function extensionGnFromRemarks(remarks) {
  const m = String(remarks ?? '').match(/G\.?\s*N\.?\s*(\d+)[^.]*extension only/i)
  return m ? m[1] : null
}

export function extractGnNumbers(text) {
  const nums = new Set()
  let m
  const re = new RegExp(GN_RE.source, GN_RE.flags)
  while ((m = re.exec(String(text ?? ''))) !== null) {
    nums.add(m[1])
  }
  return [...nums]
}

export function stemFromHostedUrl(url) {
  const m = String(url ?? '').match(/\/(\d{4}-\d+-\d+-\d+)\.pdf/i)
  return m ? m[1] : null
}

export function stemForGn(gn, stemsIndex, event = null) {
  const fromUrl = stemFromHostedUrl(
    event?.government_notice_url_en ?? event?.government_notice_url_zh,
  )
  if (fromUrl) return fromUrl
  const n = String(gn ?? '').replace(/^GN/i, '')
  if (!n) return null
  return stemsIndex?.[n] ?? null
}

export function streetAppearsInNoticeText(text, event, geoByZh) {
  const en = normalizeName(event.street_name_en)
  const flat = String(text ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (en && flat.includes(en)) return true
  const zh = String(event.street_name_zh ?? '').trim()
  if (zh && geoByZh?.has(zh)) {
    const geoEn = normalizeName(geoByZh.get(zh).en)
    if (geoEn && flat.includes(geoEn)) return true
  }
  return false
}

export function noticeDateFromPdfText(text, fallbackDate) {
  return parseGazetteDate(text) ?? fallbackDate ?? null
}

/**
 * Classify a crowd event tagged evidence_kind news.
 * @returns {{ action: string, patch?: object, remove?: boolean, match?: string, reason?: string }}
 */
export function classifyNewsCrowdEvent(event, ctx) {
  const { stemsIndex, getPdfText, siblings, geoByZh } = ctx
  const remarks = String(event.submitter_remarks ?? '')
  const extOnly = isExtensionOnlyRemarks(remarks)
  const skipGn = extensionGnFromRemarks(remarks)

  const primarySibling = (siblings ?? []).find(
    (e) =>
      e.event_id !== event.event_id &&
      e.evidence_kind === 'gazette_primary' &&
      (e.government_notice_url_en || e.government_notice_url_zh),
  )
  if (primarySibling) {
    return {
      action: 'remove_duplicate',
      match: 'sibling_gazette_primary',
      primary_event_id: primarySibling.event_id,
      reason: `Superseded by ${primarySibling.event_id}`,
    }
  }

  const noticeGn = String(event.notice_no ?? '')
    .replace(/^GN/i, '')
    .trim()
  const candidateGns = new Set()
  if (noticeGn && noticeGn !== 'CROWD') candidateGns.add(noticeGn)
  for (const n of extractGnNumbers(remarks)) candidateGns.add(n)

  const urlStem = stemFromHostedUrl(
    event.government_notice_url_en ?? event.government_notice_url_zh,
  )
  if (urlStem) {
    candidateGns.unshift('url')
  }

  for (const gn of candidateGns) {
    if (gn === 'url') {
      // handled below via urlStem
    } else if (skipGn && String(gn) === String(skipGn)) {
      continue
    }
    const stem = gn === 'url' ? urlStem : stemForGn(gn, stemsIndex, event)
    if (!stem) continue
    const text = getPdfText(stem)
    if (!text) continue

    if (extOnly && isExtensionNamingNotice(text)) {
      continue
    }

    if (extOnly && !streetAppearsInNoticeText(text, event, geoByZh)) {
      continue
    }

    const hosted = buildSelfHostedPdfUrlsFromStem(stem)
    const draft = {
      ...event,
      notice_key: null,
      government_notice_url_en: event.government_notice_url_en ?? hosted.en,
      government_notice_url_zh: event.government_notice_url_zh ?? hosted.zh,
      government_notice_label_en: event.government_notice_label_en ?? `G.N.${gn}`,
      publication_date: event.publication_date,
    }

    if (isReplaceDescriptionNotice(text)) {
      const result = classifyEgazetteNoticeText(text, draft, geoByZh)
      if (result.evidence_kind === 'gazette_inferred') {
        return {
          action: 'upgrade_inferred',
          patch: {
            evidence_kind: 'gazette_inferred',
            evidence_level: 'gazette',
            publication_date: result.publication_date,
            year_bucket: Number(String(result.publication_date).slice(0, 4)),
            derived_from: result.derived_from,
            government_notice_url_en: draft.government_notice_url_en,
            government_notice_url_zh: draft.government_notice_url_zh,
            change_kind: 'declare',
            event_role: 'current_name',
          },
          match: result.match,
        }
      }
    }

    if (
      isPrimaryNamingNotice(text) &&
      streetAppearsInNoticeText(text, event, geoByZh) &&
      !extOnly
    ) {
      const pdfDate = noticeDateFromPdfText(text, event.publication_date)
      return {
        action: 'upgrade_primary',
        patch: {
          evidence_kind: 'gazette_primary',
          evidence_level: 'gazette',
          publication_date: pdfDate,
          year_bucket: pdfDate ? Number(String(pdfDate).slice(0, 4)) : event.year_bucket,
          derived_from: null,
          government_notice_url_en: draft.government_notice_url_en,
          government_notice_url_zh: draft.government_notice_url_zh,
          notice_no: `GN${gn}`,
          government_notice_label_en: `G.N.${gn}`,
          government_notice_label_zh: `第${gn}號`,
          change_kind: 'declare',
          event_role: 'current_name',
          submitter_remarks: remarks.replace(/Original naming per hk-place[^.]*\.?\s*/i, '').trim() ||
            `G.N.${gn} primary naming notice (reclassified from 新聞).`,
        },
        match: 'primary_111c_pdf',
      }
    }

  }

  if (extOnly || HK_PLACE_RE.test(remarks)) {
    return {
      action: 'retain_news',
      match: extOnly ? 'hk_place_extension_gazette' : 'hk_place_only',
      reason: extOnly
        ? 'Original naming date from hk-place; linked G.N. is extension-only 111C notice.'
        : 'hk-place only; no primary gazette on file.',
    }
  }

  return { action: 'retain_news', match: 'unclassified', reason: 'No gazette upgrade rule matched.' }
}
