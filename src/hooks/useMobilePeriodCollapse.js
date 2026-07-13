import { useEffect, useState } from 'react'

const MOBILE_PERIOD_QUERY = '(max-width: 819px)'

export function useMobilePeriodCollapse() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_PERIOD_QUERY).matches : false,
  )
  const [isOpen, setIsOpen] = useState(() =>
    typeof window !== 'undefined' ? !window.matchMedia(MOBILE_PERIOD_QUERY).matches : true,
  )

  useEffect(() => {
    const media = window.matchMedia(MOBILE_PERIOD_QUERY)
    const sync = () => {
      const mobile = media.matches
      setIsMobile(mobile)
      if (!mobile) setIsOpen(true)
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return { isMobile, isOpen, setIsOpen, toggle: () => setIsOpen((v) => !v) }
}
