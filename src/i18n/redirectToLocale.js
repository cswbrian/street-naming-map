import { getPreferredLocale, isLocale, isNamesRoutePath } from './locale.js'

export function redirectToLocaleIfNeeded() {
  if (typeof window === 'undefined') return

  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'
  const { pathname, search, hash } = window.location

  let relative = pathname
  if (basename !== '/' && pathname.startsWith(basename)) {
    relative = pathname.slice(basename.length) || '/'
  }

  const segments = relative.split('/').filter(Boolean)
  const first = segments[0]

  if (isLocale(first)) return

  const locale = getPreferredLocale()
  let nextPath = `/${locale}`

  if (first === 'names' && segments.length === 1) {
    nextPath = `/${locale}/names`
  } else if (isNamesRoutePath(relative)) {
    nextPath = `/${locale}/names`
  }

  const prefix = basename === '/' ? '' : basename
  window.location.replace(`${prefix}${nextPath}${search}${hash}`)
}
