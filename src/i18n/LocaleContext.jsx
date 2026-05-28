import { createContext, useContext, useEffect, useMemo } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  createTranslator,
  formatBilingualStreetName,
  getPreferredLocale,
  isLocale,
  isNamesRoutePath,
} from './locale.js'
import GoogleAnalytics from '../components/GoogleAnalytics.jsx'
import PageSeo from '../components/PageSeo.jsx'
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from './translations.js'

const LocaleContext = createContext(null)

function localePath(nextLocale, isNamesRoute) {
  return isNamesRoute ? `/${nextLocale}/names` : `/${nextLocale}`
}

export function LocaleProvider({ children }) {
  const { locale: localeParam } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isNamesRoute = isNamesRoutePath(location.pathname)

  if (!isLocale(localeParam)) {
    const preferred = getPreferredLocale()
    const nextPath = localePath(preferred, isNamesRoute)
    return <Navigate to={{ pathname: nextPath, search: location.search }} replace />
  }

  const locale = localeParam
  const t = useMemo(() => createTranslator(locale), [locale])

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    document.documentElement.lang = locale === 'zh' ? 'zh-HK' : 'en'
  }, [locale])

  const setLocale = (nextLocale) => {
    if (!isLocale(nextLocale) || nextLocale === locale) return
    navigate(
      { pathname: localePath(nextLocale, isNamesRoute), search: location.search },
      { replace: true },
    )
  }

  const toggleLocale = () => setLocale(locale === 'zh' ? 'en' : 'zh')

  const value = useMemo(
    () => ({
      locale,
      t,
      setLocale,
      toggleLocale,
      formatStreetName: formatBilingualStreetName,
    }),
    [locale, t],
  )

  return (
    <LocaleContext.Provider value={value}>
      <PageSeo />
      <GoogleAnalytics />
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider')
  }
  return context
}

export function useLocalePath(suffix = '') {
  const { locale } = useLocale()
  if (!suffix) return `/${locale}`
  return `/${locale}/${suffix.replace(/^\//, '')}`
}
