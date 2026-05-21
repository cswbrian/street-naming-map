/** Public URL paths for self-hosted eGazette PDFs (Vite base + GitHub Pages). */
export const EGAZETTE_PUBLIC_BASE = '/street-naming-map/egazette'

export function noticeKeyToStem(noticeKey) {
  if (!noticeKey) return null
  const match = String(noticeKey).match(/^(\d+-\d+-\d+-\d+)-\d+$/)
  return match ? match[1] : null
}

export function buildSelfHostedPdfUrls(noticeKey, basePath = EGAZETTE_PUBLIC_BASE) {
  const stem = noticeKeyToStem(noticeKey)
  if (!stem) return { en: null, zh: null }
  const prefix = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  return {
    en: `${prefix}/en/${stem}.pdf`,
    zh: `${prefix}/zh/${stem}.pdf`,
  }
}

export function governmentNoticeUrlsFromEvent(event, basePath = EGAZETTE_PUBLIC_BASE) {
  if (!event) return { en: null, zh: null }

  if (event.source === 'egazette_pdf' && event.notice_key) {
    return buildSelfHostedPdfUrls(event.notice_key, basePath)
  }

  return {
    en: event.government_notice_url_en ?? null,
    zh: event.government_notice_url_zh ?? null,
  }
}
