import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  getRouteSuffixFromPath,
  isAboutRoutePath,
  isLinkQueueRoutePath,
  isNamesRoutePath,
  isStreetRoutePath,
  isTimelinesRoutePath,
} from '../i18n/locale'
import { useLocale } from '../i18n/LocaleContext'
import { applyPageSeo, getCanonicalUrl } from '../lib/seo'

function PageSeo() {
  const { locale, t } = useLocale()
  const location = useLocation()
  const routeSuffix = getRouteSuffixFromPath(location.pathname)
  const isAboutRoute = isAboutRoutePath(location.pathname)
  const isNamesRoute = isNamesRoutePath(location.pathname)
  const isLinkQueueRoute = isLinkQueueRoutePath(location.pathname)
  const isTimelinesRoute = isTimelinesRoutePath(location.pathname)
  const isStreetRoute = isStreetRoutePath(location.pathname)

  useEffect(() => {
    if (isStreetRoute) return

    const pageLabel = t(
      isAboutRoute
        ? 'navAbout'
        : isNamesRoute
          ? 'navNames'
          : isTimelinesRoute
            ? 'navTimelines'
            : isLinkQueueRoute
              ? 'linkQueueTitle'
              : 'navMap',
    )
    const documentTitle = `${t('siteTitle')} · ${pageLabel}`
    const description = isAboutRoute
      ? t('aboutSeoDescription')
      : isTimelinesRoute
        ? t('timelinesSeoDescription')
        : isLinkQueueRoute
          ? t('linkQueueSeoDescription')
          : t('seoDescription')
    const canonicalUrl = getCanonicalUrl(location.pathname)

    applyPageSeo({
      title: documentTitle,
      description,
      canonicalUrl,
      locale,
      origin: window.location.origin,
      routeSuffix,
      siteName: t('siteTitle'),
    })
  }, [
    isAboutRoute,
    isLinkQueueRoute,
    isNamesRoute,
    isStreetRoute,
    isTimelinesRoute,
    locale,
    location.pathname,
    routeSuffix,
    t,
  ])

  return null
}

export default PageSeo
