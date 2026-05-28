const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID

let timelineTrackTimer = null

export function isAnalyticsEnabled() {
  return (
    import.meta.env.PROD &&
    typeof MEASUREMENT_ID === 'string' &&
    MEASUREMENT_ID.startsWith('G-')
  )
}

export function initAnalytics() {
  if (!isAnalyticsEnabled() || window.__gaInitialized) return

  window.__gaInitialized = true
  window.dataLayer = window.dataLayer || []

  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }

  window.gtag('js', new Date())
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
  document.head.appendChild(script)
}

export function trackEvent(name, params = {}) {
  if (!isAnalyticsEnabled() || typeof window.gtag !== 'function') return
  window.gtag('event', name, params)
}

export function trackPageView(pathname, search = '') {
  if (!isAnalyticsEnabled() || typeof window.gtag !== 'function') return

  const pagePath = `${pathname}${search}`

  window.gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
    page_title: document.title,
  })
}

export function trackSelectRoad({ method, hasYear, isPending }) {
  trackEvent('select_road', {
    method,
    has_year: hasYear ? 'yes' : 'no',
    is_pending: isPending ? 'yes' : 'no',
  })
}

export function trackTimelineYear(year, method = 'slider') {
  if (!Number.isFinite(year)) return

  if (method === 'road') {
    if (timelineTrackTimer) {
      window.clearTimeout(timelineTrackTimer)
      timelineTrackTimer = null
    }
    trackEvent('timeline_year', { year, method })
    return
  }

  if (timelineTrackTimer) window.clearTimeout(timelineTrackTimer)
  timelineTrackTimer = window.setTimeout(() => {
    trackEvent('timeline_year', { year, method })
    timelineTrackTimer = null
  }, 800)
}

export function trackTimelinePlay(action, year) {
  trackEvent('timeline_play', {
    action,
    year: Number.isFinite(year) ? year : undefined,
  })
}

export function trackEraFilter(eraId, enabled) {
  trackEvent('filter_era', { era_id: eraId, enabled: enabled ? 'yes' : 'no' })
}

export function trackRegionFilter(regionId, enabled) {
  trackEvent('filter_region', { region_id: regionId, enabled: enabled ? 'yes' : 'no' })
}

export function trackSubdistrictSelect(subdistrictId) {
  trackEvent('select_subdistrict', { subdistrict_id: subdistrictId })
}

export function trackNamesFilter(filterType, value, enabled = true) {
  trackEvent('filter_names', {
    filter_type: filterType,
    value,
    enabled: enabled ? 'yes' : 'no',
  })
}

export function trackContributeOpen(source, variant = 'add') {
  trackEvent('contribute_open', { source, variant })
}

export function trackNoticeOpen(source) {
  trackEvent('notice_open', { source })
}

export function trackLocaleChange(locale) {
  trackEvent('locale_change', { locale })
}

export function trackThemeChange(theme) {
  trackEvent('theme_change', { theme })
}
