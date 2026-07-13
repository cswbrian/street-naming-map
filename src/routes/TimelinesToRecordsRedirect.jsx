import { Navigate, useParams } from 'react-router-dom'

/** Redirect /:locale/timelines → /:locale/records */
function TimelinesToRecordsRedirect() {
  const { locale } = useParams()
  return <Navigate to={`/${locale}/records`} replace />
}

export default TimelinesToRecordsRedirect
