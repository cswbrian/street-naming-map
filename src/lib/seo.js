export const SITE_ORIGIN = 'https://street.monsoonclub.co'
export const OG_IMAGE_FILENAME = 'og-image.png'
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '')

export function getSiteBaseUrl(origin = SITE_ORIGIN) {
  return `${origin}${BASE_PATH}`
}

export function getOgImageUrl(origin = SITE_ORIGIN) {
  return `${getSiteBaseUrl(origin)}/${OG_IMAGE_FILENAME}`
}

export function getCanonicalUrl(pathname, origin = typeof window !== 'undefined' ? window.location.origin : SITE_ORIGIN) {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${origin}${BASE_PATH}${path}`
}

export function getLocalePath(locale, routeSuffix = '') {
  return routeSuffix ? `${BASE_PATH}/${locale}/${routeSuffix}` : `${BASE_PATH}/${locale}`
}

function queryMeta(attr, key) {
  return document.head.querySelector(`meta[${attr}="${key}"]`)
}

export function setMeta(attr, key, content) {
  if (!content) return
  let element = queryMeta(attr, key)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attr, key)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

export function setLink(rel, href, extraAttrs = {}) {
  const attrKey = Object.entries(extraAttrs)
    .map(([name, value]) => `[${name}="${value}"]`)
    .join('')
  const selector = `link[rel="${rel}"]${attrKey}`
  let element = document.head.querySelector(selector)
  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', rel)
    Object.entries(extraAttrs).forEach(([name, value]) => {
      element.setAttribute(name, value)
    })
    document.head.appendChild(element)
  }
  element.setAttribute('href', href)
}

export function setAlternateLinks({ pathname, origin, locales, routeSuffix = '' }) {
  document.head.querySelectorAll('link[rel="alternate"][data-seo-managed="true"]').forEach((node) => {
    node.remove()
  })

  locales.forEach((locale) => {
    const href = routeSuffix.startsWith('streets/')
      ? `${origin}${getLocalePath(locale)}/${routeSuffix}`
      : `${origin}${getLocalePath(locale, routeSuffix)}`
    const link = document.createElement('link')
    link.setAttribute('rel', 'alternate')
    link.setAttribute('hreflang', locale === 'zh' ? 'zh-HK' : locale)
    link.setAttribute('href', href)
    link.dataset.seoManaged = 'true'
    document.head.appendChild(link)
  })

  const defaultHref = routeSuffix.startsWith('streets/')
    ? `${origin}${getLocalePath('zh')}/${routeSuffix}`
    : `${origin}${getLocalePath('zh', routeSuffix)}`
  const defaultLink = document.createElement('link')
  defaultLink.setAttribute('rel', 'alternate')
  defaultLink.setAttribute('hreflang', 'x-default')
  defaultLink.setAttribute('href', defaultHref)
  defaultLink.dataset.seoManaged = 'true'
  document.head.appendChild(defaultLink)
}

export function applyPageSeo({
  title,
  description,
  canonicalUrl,
  locale,
  origin,
  routeSuffix = '',
  siteName,
}) {
  const ogLocale = locale === 'zh' ? 'zh_HK' : 'en'
  const alternateLocale = locale === 'zh' ? 'en' : 'zh_HK'

  document.title = title
  setMeta('name', 'description', description)
  setMeta('property', 'og:site_name', siteName)
  setMeta('property', 'og:type', 'website')
  setMeta('property', 'og:title', title)
  setMeta('property', 'og:description', description)
  setMeta('property', 'og:url', canonicalUrl)
  setMeta('property', 'og:locale', ogLocale)
  setMeta('property', 'og:locale:alternate', alternateLocale)
  const ogImageUrl = getOgImageUrl(origin)
  setMeta('property', 'og:image', ogImageUrl)
  setMeta('property', 'og:image:width', String(OG_IMAGE_WIDTH))
  setMeta('property', 'og:image:height', String(OG_IMAGE_HEIGHT))
  setMeta('property', 'og:image:type', 'image/png')
  setMeta('name', 'twitter:card', 'summary_large_image')
  setMeta('name', 'twitter:title', title)
  setMeta('name', 'twitter:description', description)
  setMeta('name', 'twitter:image', ogImageUrl)
  setLink('canonical', canonicalUrl)
  setAlternateLinks({
    pathname: canonicalUrl,
    origin,
    locales: ['zh', 'en'],
    routeSuffix,
  })
}
