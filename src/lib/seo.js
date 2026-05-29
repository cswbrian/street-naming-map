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

export function getLocalePath(locale, isNamesRoute) {
  return isNamesRoute ? `${BASE_PATH}/${locale}/names` : `${BASE_PATH}/${locale}`
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

export function setAlternateLinks({ pathname, origin, locales, isNamesRoute }) {
  document.head.querySelectorAll('link[rel="alternate"][data-seo-managed="true"]').forEach((node) => {
    node.remove()
  })

  locales.forEach((locale) => {
    const href = `${origin}${getLocalePath(locale, isNamesRoute)}`
    const link = document.createElement('link')
    link.setAttribute('rel', 'alternate')
    link.setAttribute('hreflang', locale === 'zh' ? 'zh-HK' : locale)
    link.setAttribute('href', href)
    link.dataset.seoManaged = 'true'
    document.head.appendChild(link)
  })

  const defaultHref = `${origin}${getLocalePath('zh', isNamesRoute)}`
  const defaultLink = document.createElement('link')
  defaultLink.setAttribute('rel', 'alternate')
  defaultLink.setAttribute('hreflang', 'x-default')
  defaultLink.setAttribute('href', defaultHref)
  defaultLink.dataset.seoManaged = 'true'
  document.head.appendChild(defaultLink)
}
