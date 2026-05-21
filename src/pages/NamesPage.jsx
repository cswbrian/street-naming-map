import { useNavigate } from 'react-router-dom'
import AppNav from '../components/AppNav'
import PendingDashboard from '../components/PendingDashboard'

function NamesPage() {
  const navigate = useNavigate()

  const openRoadOnMap = ({ englishName, chineseName, namingYear }) => {
    const params = new URLSearchParams()
    if (englishName) params.set('en', englishName)
    if (chineseName) params.set('zh', chineseName)
    const year = Number(namingYear)
    if (Number.isFinite(year)) params.set('year', String(year))
    navigate({ pathname: '/', search: params.toString() })
  }

  return (
    <>
      <header className="app-page-header">
        <AppNav />
      </header>
      <PendingDashboard onOpenRoadOnMap={openRoadOnMap} />
    </>
  )
}

export default NamesPage
