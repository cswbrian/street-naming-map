import { Navigate, useLocation } from 'react-router-dom'
import { getPreferredLocale } from '../i18n/locale.js'

function LegacyLocaleRedirect({ segment = '' }) {
  const location = useLocation()
  const locale = getPreferredLocale()
  const pathname = segment ? `/${locale}/${segment}` : `/${locale}`
  return <Navigate to={{ pathname, search: location.search }} replace />
}

export default LegacyLocaleRedirect
