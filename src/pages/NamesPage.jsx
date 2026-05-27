import { useNavigate } from 'react-router-dom'
import AppNav from '../components/AppNav'
import AppSiteTitle from '../components/AppSiteTitle'
import PendingDashboard from '../components/PendingDashboard'
import { useLocalePath } from '../i18n/LocaleContext'

function NamesPage() {
  const navigate = useNavigate()
  const mapPath = useLocalePath()

  const openRoadOnMap = ({ englishName, chineseName, namingYear }) => {
    const params = new URLSearchParams()
    if (englishName) params.set('en', englishName)
    if (chineseName) params.set('zh', chineseName)
    const year = Number(namingYear)
    if (Number.isFinite(year)) params.set('year', String(year))
    navigate({ pathname: mapPath, search: params.toString() })
  }

  return (
    <>
      <header className="app-page-header">
        <AppSiteTitle />
        <AppNav />
      </header>
      <PendingDashboard onOpenRoadOnMap={openRoadOnMap} />
    </>
  )
}

export default NamesPage
