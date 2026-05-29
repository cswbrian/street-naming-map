import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { isNamesRoutePath } from '../i18n/locale'
import { LOCALES } from '../i18n/translations'
import { useLocale } from '../i18n/LocaleContext'
import {
  getCanonicalUrl,
  getOgImageUrl,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  setAlternateLinks,
  setLink,
  setMeta,
} from '../lib/seo'

function PageSeo() {
  const { locale, t } = useLocale()
  const location = useLocation()
  const isNamesRoute = isNamesRoutePath(location.pathname)

  useEffect(() => {
    const pageLabel = t(isNamesRoute ? 'navNames' : 'navMap')
    const documentTitle = `${t('siteTitle')} · ${pageLabel}`
    const description = t('seoDescription')
    const canonicalUrl = getCanonicalUrl(location.pathname)
    const ogLocale = locale === 'zh' ? 'zh_HK' : 'en'
    const alternateLocale = locale === 'zh' ? 'en' : 'zh_HK'

    document.title = documentTitle
    setMeta('name', 'description', description)
    setMeta('property', 'og:site_name', t('siteTitle'))
    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:title', documentTitle)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', canonicalUrl)
    setMeta('property', 'og:locale', ogLocale)
    setMeta('property', 'og:locale:alternate', alternateLocale)
    const ogImageUrl = getOgImageUrl(window.location.origin)
    setMeta('property', 'og:image', ogImageUrl)
    setMeta('property', 'og:image:width', String(OG_IMAGE_WIDTH))
    setMeta('property', 'og:image:height', String(OG_IMAGE_HEIGHT))
    setMeta('property', 'og:image:type', 'image/png')
    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', documentTitle)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:image', ogImageUrl)
    setLink('canonical', canonicalUrl)
    setAlternateLinks({
      pathname: location.pathname,
      origin: window.location.origin,
      locales: LOCALES,
      isNamesRoute,
    })
  }, [isNamesRoute, locale, location.pathname, t])

  return null
}

export default PageSeo
