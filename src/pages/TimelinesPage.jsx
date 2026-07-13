import { useNavigate } from 'react-router-dom'
import AppNav from '../components/AppNav'
import AppSiteTitle from '../components/AppSiteTitle'
import RecordsDashboard from '../components/RecordsDashboard'
import RecordsNotificationBar from '../components/RecordsNotificationBar'
import { trackSelectRoad } from '../lib/analytics.js'
import { buildRoadKey } from '../lib/roadKey'
import { buildRoadSearchParams } from '../lib/roadShareUrl.js'
import { useLocalePath } from '../i18n/LocaleContext'

function TimelinesPage() {
  const navigate = useNavigate()
  const mapPath = useLocalePath()

  const openRoadOnMap = ({ englishName, chineseName, streetCode, namingYear }) => {
    const year = Number(namingYear)
    const code = String(streetCode ?? '').trim()
    trackSelectRoad({
      method: 'timelines_table',
      hasYear: Number.isFinite(year) && year > 0,
      isPending: !Number.isFinite(year) || year <= 0,
      englishName,
      chineseName,
    })
    const params = buildRoadSearchParams({
      roadKey: code ? buildRoadKey(null, null, code) : buildRoadKey(englishName, chineseName),
      year,
    })
    navigate({ pathname: mapPath, search: params.toString() })
  }

  return (
    <>
      <header className="app-page-header">
        <AppSiteTitle />
        <AppNav />
      </header>
      <RecordsNotificationBar />
      <RecordsDashboard onOpenRoadOnMap={openRoadOnMap} />
    </>
  )
}

export default TimelinesPage
