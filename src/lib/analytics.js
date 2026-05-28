const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID

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

export function trackPageView(pathname, search = '') {
  if (!isAnalyticsEnabled() || typeof window.gtag !== 'function') return

  const pagePath = `${pathname}${search}`

  window.gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
    page_title: document.title,
  })
}
