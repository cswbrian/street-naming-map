import { useNavigate } from 'react-router-dom'
import AppNav from '../components/AppNav'
import AppSiteTitle from '../components/AppSiteTitle'
import TimelinesDashboard from '../components/TimelinesDashboard'
import { trackSelectRoad } from '../lib/analytics.js'
import { buildRoadKey } from '../lib/roadKey'
import { buildRoadSearchParams } from '../lib/roadShareUrl.js'
import { useLocalePath } from '../i18n/LocaleContext'

function TimelinesPage() {
  const navigate = useNavigate()
  const mapPath = useLocalePath()

  const openRoadOnMap = ({ englishName, chineseName, namingYear }) => {
    const year = Number(namingYear)
    trackSelectRoad({
      method: 'timelines_table',
      hasYear: Number.isFinite(year) && year > 0,
      isPending: !Number.isFinite(year) || year <= 0,
      englishName,
      chineseName,
    })
    const params = buildRoadSearchParams({
      roadKey: buildRoadKey(englishName, chineseName),
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
      <TimelinesDashboard onOpenRoadOnMap={openRoadOnMap} />
    </>
  )
}

export default TimelinesPage
