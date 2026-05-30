/** Site-root path for self-hosted PDFs (Vite BASE_URL is applied in the app). */
export const EGAZETTE_PUBLIC_BASE = '/egazette'

/** Strip legacy GitHub Pages repo prefix from stored paths. */
export function normalizeStoredHostedPath(url) {
  if (!url) return url
  const text = String(url).trim()
  if (/^https?:\/\//i.test(text)) return text
  return text.replace(/^\/street-naming-map(?=\/)/, '')
}

export function noticeKeyToStem(noticeKey) {
  if (!noticeKey) return null
  const match = String(noticeKey).match(/^(\d+-\d+-\d+-\d+)-\d+$/)
  return match ? match[1] : null
}

/** Parse cgn/egn archive filenames like cgn200408518104.pdf → stem 2004-08-51-8104 */
export function parseEgazetteArchiveFilename(filePath) {
  const base = String(filePath ?? '')
    .split(/[/\\]/)
    .pop()
    ?.replace(/\.pdf$/i, '')
  if (!base) return null

  const match = base.match(/^(cgn|egn)(\d{4})(\d{2})(\d{2})(\d+)$/i)
  if (match) {
    const [, type, year, volume, gno, noticeNo] = match
    const stem = `${year}-${volume}-${gno}-${noticeNo}`
    return {
      type: type.toLowerCase(),
      year,
      volume,
      gno,
      notice_no: noticeNo,
      notice_label: `G.N.${noticeNo}`,
      stem,
    }
  }

  const legacyGn = base.match(/^(\d{4})-gn(\d+)$/i)
  if (legacyGn) {
    const [, year, noticeNo] = legacyGn
    const stem = `${year}-gn${noticeNo}`
    return {
      type: 'egn',
      year,
      volume: null,
      gno: null,
      notice_no: noticeNo,
      notice_label: `G.N.${noticeNo}`,
      stem,
    }
  }

  return null
}

export function buildSelfHostedPdfUrlsFromStem(stem, basePath = EGAZETTE_PUBLIC_BASE) {
  if (!stem) return { en: null, zh: null }
  const prefix = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  return {
    en: `${prefix}/en/${stem}.pdf`,
    zh: `${prefix}/zh/${stem}.pdf`,
  }
}

export function buildSelfHostedPdfUrls(noticeKey, basePath = EGAZETTE_PUBLIC_BASE) {
  const stem = noticeKeyToStem(noticeKey)
  if (!stem) return { en: null, zh: null }
  return buildSelfHostedPdfUrlsFromStem(stem, basePath)
}

export function governmentNoticeUrlsFromEvent(event, basePath = EGAZETTE_PUBLIC_BASE) {
  if (!event) return { en: null, zh: null }

  if (event.source === 'egazette_pdf' && event.notice_key) {
    return buildSelfHostedPdfUrls(event.notice_key, basePath)
  }

  if (event.notice_stem) {
    return buildSelfHostedPdfUrlsFromStem(event.notice_stem, basePath)
  }

  return {
    en: normalizeStoredHostedPath(event.government_notice_url_en) ?? null,
    zh: normalizeStoredHostedPath(event.government_notice_url_zh) ?? null,
  }
}
