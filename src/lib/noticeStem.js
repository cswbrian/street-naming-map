export function noticeStemFromUrl(url) {
  const text = String(url ?? '').trim()
  const match = text.match(/\/egazette\/(?:en|zh)\/([^/?#]+)\.pdf/i)
  return match ? decodeURIComponent(match[1]) : null
}

export function noticeStemFromEntry(entry) {
  return (
    noticeStemFromUrl(entry?.notice_url_en) ||
    noticeStemFromUrl(entry?.notice_url_zh) ||
    null
  )
}
