import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppNav from '../components/AppNav'
import AppSiteTitle from '../components/AppSiteTitle'
import StreetEventTimeline from '../components/StreetEventTimeline'
import { useLocale, useLocalePath } from '../i18n/LocaleContext'
import { trackSelectRoad, trackShareRoad } from '../lib/analytics.js'
import { loadStreetTimelines } from '../lib/loadStreetTimelines.js'
import { buildStreetTimelineItems, buildTimelineEventLabels } from '../lib/nameHistory.js'
import { buildRoadKey } from '../lib/roadKey'
import { buildRoadSearchParams, buildStreetShareUrl } from '../lib/roadShareUrl.js'
import { applyPageSeo, getCanonicalUrl } from '../lib/seo.js'
import { buildStreetPagePath } from '../lib/streetPageUrl.js'

function buildStreetSeoCopy(timeline, locale, t) {
  const nameZh = String(timeline?.street_name_zh ?? '').trim()
  const nameEn = String(timeline?.street_name_en ?? '').trim()
  const displayName = locale === 'zh' ? nameZh || nameEn : nameEn || nameZh
  const year = timeline?.canonical_naming_year
  const eventCount = timeline?.event_count ?? timeline?.name_history?.length ?? 0
  const title = t('streetPageTitle', { name: displayName })
  const description = t('streetPageDescription', {
    name: displayName,
    year: year || t('unknownYear'),
    count: eventCount,
  })
  return { title, description, displayName }
}

function StreetPage() {
  const { pageId } = useParams()
  const { locale, t } = useLocale()
  const navigate = useNavigate()
  const mapPath = useLocalePath()
  const [timeline, setTimeline] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        setIsLoading(true)
        setNotFound(false)
        const data = await loadStreetTimelines()
        const match = data.timelines.find((row) => String(row.page_id ?? '').trim() === pageId)
        if (!mounted) return
        if (!match) {
          setTimeline(null)
          setNotFound(true)
        } else {
          setTimeline(match)
        }
      } catch {
        if (mounted) setNotFound(true)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [pageId])

  const timelineLabels = useMemo(() => buildTimelineEventLabels(t), [t])
  const displayNames = useMemo(
    () => ({
      en: timeline?.street_name_en || '',
      zh: timeline?.street_name_zh || '',
    }),
    [timeline],
  )
  const timelineItems = useMemo(
    () =>
      timeline
        ? buildStreetTimelineItems(timeline.name_history, locale, timelineLabels, displayNames, {
            idPrefix: timeline.timeline_id,
            t,
          })
        : [],
    [timeline, locale, timelineLabels, displayNames, t],
  )

  useEffect(() => {
    if (!timeline || typeof window === 'undefined') return
    const { title, description } = buildStreetSeoCopy(timeline, locale, t)
    const canonicalUrl = getCanonicalUrl(buildStreetPagePath(locale, pageId))
    applyPageSeo({
      title,
      description,
      canonicalUrl,
      locale,
      origin: window.location.origin,
      routeSuffix: `streets/${pageId}`,
      siteName: t('siteTitle'),
    })
  }, [timeline, locale, pageId, t])

  const openOnMap = useCallback(() => {
    if (!timeline) return
    const year = Number(timeline.canonical_naming_year)
    const code = String(timeline.street_code ?? '').trim()
    trackSelectRoad({
      method: 'street_page',
      hasYear: Number.isFinite(year) && year > 0,
      isPending: !Number.isFinite(year) || year <= 0,
      englishName: timeline.street_name_en,
      chineseName: timeline.street_name_zh,
    })
    const params = buildRoadSearchParams({
      roadKey: code
        ? buildRoadKey(null, null, code)
        : buildRoadKey(timeline.street_name_en, timeline.street_name_zh),
      year,
    })
    navigate({ pathname: mapPath, search: params.toString() })
  }, [timeline, navigate, mapPath])

  const shareUrl =
    typeof window !== 'undefined' && pageId
      ? buildStreetShareUrl({ origin: window.location.origin, locale, pageId })
      : null

  const handleShare = useCallback(async () => {
    if (!shareUrl) return
    trackShareRoad('street_page')
    try {
      if (navigator.share) {
        await navigator.share({
          url: shareUrl,
          title: timeline?.street_name_en || timeline?.street_name_zh || '',
        })
        return
      }
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch {
      /* user dismissed share sheet */
    }
  }, [shareUrl, timeline])

  const canOpenMap =
    timeline?.geometry_link?.status === 'active' && Boolean(timeline?.street_code)

  return (
    <>
      <header className="app-page-header">
        <AppSiteTitle />
        <AppNav />
      </header>
      <div className="street-page">
        {isLoading ? <p className="street-page-status">{t('loadingReport')}</p> : null}
        {!isLoading && notFound ? (
          <div className="street-page-empty">
            <p>{t('streetPageNotFound')}</p>
            <Link to={mapPath} className="street-page-link">
              {t('navMap')}
            </Link>
          </div>
        ) : null}
        {!isLoading && timeline ? (
          <>
            <header className="street-page-header">
              <div className="street-page-names">
                {timeline.street_name_zh ? (
                  <h1 className="street-page-name-zh">{timeline.street_name_zh}</h1>
                ) : null}
                {timeline.street_name_en ? (
                  <p className="street-page-name-en">{timeline.street_name_en}</p>
                ) : null}
              </div>
              <div className="street-page-actions">
                {canOpenMap ? (
                  <button type="button" className="street-page-action-btn" onClick={openOnMap}>
                    {t('streetPageOpenMap')}
                  </button>
                ) : null}
                {shareUrl ? (
                  <button type="button" className="street-page-action-btn is-secondary" onClick={handleShare}>
                    {shareCopied ? t('mapRoadShareCopied') : t('mapRoadShare')}
                  </button>
                ) : null}
              </div>
            </header>
            {timeline.canonical_naming_year ? (
              <p className="street-page-meta">
                {t('streetPageNamingYear', { year: timeline.canonical_naming_year })}
              </p>
            ) : null}
            <StreetEventTimeline items={timelineItems} variant="detail" locale={locale} t={t} />
          </>
        ) : null}
      </div>
    </>
  )
}

export default StreetPage
