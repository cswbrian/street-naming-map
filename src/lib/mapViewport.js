/** Matches map HUD mobile styles in app.css */
export const MAP_MOBILE_MEDIA = '(max-width: 820px)'

export function isMapMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MAP_MOBILE_MEDIA).matches
}

export function getDefaultMapPanelCollapse() {
  const collapsed = isMapMobileViewport()
  return {
    evolution: collapsed,
    navigator: collapsed,
    timeline: collapsed,
  }
}
