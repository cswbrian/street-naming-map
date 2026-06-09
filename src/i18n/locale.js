import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, LOCALES, translations } from './translations.js'

export function isLocale(value) {
  return LOCALES.includes(value)
}

export function getPreferredLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  if (isLocale(stored)) return stored
  const browser = window.navigator.language?.toLowerCase() ?? ''
  return browser.startsWith('zh') ? 'zh' : 'en'
}

export function formatBilingualStreetName(zhName, enName) {
  const zh = String(zhName ?? '').trim()
  const en = String(enName ?? '').trim()
  if (zh && en) return `${zh} ${en}`
  return zh || en || '-'
}

export function isNamesRoutePath(pathname) {
  return /\/names\/?$/.test(pathname)
}

export function isAboutRoutePath(pathname) {
  return /\/about\/?$/.test(pathname)
}

export function isLinkQueueRoutePath(pathname) {
  return /\/link-queue\/?$/.test(pathname)
}

export function isTimelinesRoutePath(pathname) {
  return /\/timelines\/?$/.test(pathname)
}

export function getRouteSuffixFromPath(pathname) {
  if (isNamesRoutePath(pathname)) return 'names'
  if (isAboutRoutePath(pathname)) return 'about'
  if (isTimelinesRoutePath(pathname)) return 'timelines'
  if (isLinkQueueRoutePath(pathname)) return 'link-queue'
  return ''
}

export function localePathForSuffix(locale, suffix = '') {
  return suffix ? `/${locale}/${suffix}` : `/${locale}`
}

export function replacePathLocale(pathname, nextLocale) {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return `/${nextLocale}`
  if (isLocale(segments[0])) {
    segments[0] = nextLocale
    return `/${segments.join('/')}`
  }
  return `/${nextLocale}/${segments.join('/')}`
}

export function createTranslator(locale) {
  const dictionary = translations[locale] ?? translations.en
  return (key, vars) => {
    let text = dictionary[key] ?? translations.en[key] ?? key
    if (vars) {
      Object.entries(vars).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, String(value))
      })
    }
    return text
  }
}
