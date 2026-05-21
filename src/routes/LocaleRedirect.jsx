import { Navigate, useLocation } from 'react-router-dom'
import { getPreferredLocale } from '../i18n/locale.js'

function LocaleRedirect() {
  const location = useLocation()
  const locale = getPreferredLocale()
  return <Navigate to={{ pathname: `/${locale}`, search: location.search }} replace />
}

export default LocaleRedirect
