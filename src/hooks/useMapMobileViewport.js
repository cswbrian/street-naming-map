import { useEffect, useState } from 'react'
import { isMapMobileViewport, MAP_MOBILE_MEDIA } from '../lib/mapViewport.js'

export function useMapMobileViewport() {
  const [isMobile, setIsMobile] = useState(isMapMobileViewport)

  useEffect(() => {
    const media = window.matchMedia(MAP_MOBILE_MEDIA)
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return isMobile
}
