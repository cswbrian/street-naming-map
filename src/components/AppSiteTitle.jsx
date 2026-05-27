import { Link } from 'react-router-dom'
import { useLocale, useLocalePath } from '../i18n/LocaleContext'

function AppSiteTitle() {
  const { t } = useLocale()
  const mapPath = useLocalePath()

  return (
    <Link to={mapPath} className="app-site-title">
      {t('siteTitle')}
    </Link>
  )
}

export default AppSiteTitle
