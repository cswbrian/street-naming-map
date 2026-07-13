import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  getRouteSuffixFromPath,
  isAboutRoutePath,
  isLinkQueueRoutePath,
  isNamesRoutePath,
  isStreetRoutePath,
  isRecordsRoutePath,
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
  const isRecordsRoute = isRecordsRoutePath(location.pathname)
  const isStreetRoute = isStreetRoutePath(location.pathname)

  useEffect(() => {
    if (isStreetRoute) return

    const pageLabel = t(
      isAboutRoute
        ? 'navAbout'
        : isNamesRoute
          ? 'navNames'
          : isRecordsRoute
            ? 'navRecords'
            : isLinkQueueRoute
              ? 'linkQueueTitle'
              : 'navMap',
    )
    const documentTitle = `${t('siteTitle')} · ${pageLabel}`
    const description = isAboutRoute
      ? t('aboutSeoDescription')
      : isRecordsRoute
        ? t('recordsSeoDescription')
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
    isRecordsRoute,
    locale,
    location.pathname,
    routeSuffix,
    t,
  ])

  return null
}

export default PageSeo
