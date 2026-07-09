export function buildStreetPagePath(locale, pageId) {
  const id = String(pageId ?? '').trim()
  if (!id) return `/${locale}`
  return `/${locale}/streets/${encodeURIComponent(id)}`
}

export function buildStreetPageUrl({ origin, locale, pageId }) {
  return `${origin}${buildStreetPagePath(locale, pageId)}`
}

export function getPageIdFromPath(pathname) {
  const match = String(pathname ?? '').match(/\/streets\/([^/]+)\/?$/)
  return match ? decodeURIComponent(match[1]) : null
}

export function isStreetRoutePath(pathname) {
  return /\/streets\/[^/]+\/?$/.test(String(pathname ?? ''))
}
