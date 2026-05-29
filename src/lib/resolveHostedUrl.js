/**
 * Resolve a stored site path to a browser URL using Vite's BASE_URL.
 * Handles legacy `/street-naming-map/egazette/...` paths from GitHub Pages hosting.
 */
export function resolveHostedUrl(url) {
  if (!url) return null
  const text = String(url).trim()
  if (/^https?:\/\//i.test(text)) return text

  let path = text.replace(/^\/street-naming-map(?=\/)/, '')
  if (!path.startsWith('/')) path = `/${path}`

  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${base}${path}`
}
