import AppNav from '../components/AppNav'
import AppSiteTitle from '../components/AppSiteTitle'
import UnmappedEventsDashboard from '../components/UnmappedEventsDashboard'

/** Hidden linker queue — not linked from main nav. URL: /{locale}/link-queue */
function LinkQueuePage() {
  return (
    <>
      <header className="app-page-header">
        <AppSiteTitle />
        <AppNav />
      </header>
      <UnmappedEventsDashboard />
    </>
  )
}

export default LinkQueuePage
