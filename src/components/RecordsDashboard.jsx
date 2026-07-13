import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLocale } from '../i18n/LocaleContext'
import RecordsFlowIntro from './RecordsFlowIntro.jsx'
import GazettesRecordsTab from './GazettesRecordsTab.jsx'
import TimelinesDashboard from './TimelinesDashboard.jsx'

function RecordsDashboard({ onOpenRoadOnMap }) {
  const { t } = useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'streets' ? 'streets' : 'gazettes'
  const expandNotice = searchParams.get('notice')

  const setView = useCallback(
    (nextView) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (nextView === 'gazettes') params.delete('view')
          else params.set('view', nextView)
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const handleOpenGazetteNotice = useCallback(
    (stem) => {
      if (!stem) return
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          params.delete('view')
          params.set('notice', stem)
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const handleExpandNoticeChange = useCallback(
    (stem) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (stem) params.set('notice', stem)
          else params.delete('notice')
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return (
    <section className="pending-dashboard timelines-dashboard records-dashboard">
      <header className="link-queue-header">
        <h1 className="link-queue-title">{t('recordsTitle')}</h1>
        <RecordsFlowIntro />
      </header>

      <div className="records-view-tabs" role="tablist" aria-label={t('recordsViewTabsAria')}>
        <button
          type="button"
          role="tab"
          id="records-tab-gazettes"
          aria-selected={view === 'gazettes'}
          aria-controls="records-panel-gazettes"
          className={`records-view-tab ${view === 'gazettes' ? 'is-active' : ''}`}
          onClick={() => setView('gazettes')}
        >
          {t('recordsTabGazettes')}
        </button>
        <button
          type="button"
          role="tab"
          id="records-tab-streets"
          aria-selected={view === 'streets'}
          aria-controls="records-panel-streets"
          className={`records-view-tab ${view === 'streets' ? 'is-active' : ''}`}
          onClick={() => setView('streets')}
        >
          {t('recordsTabStreets')}
        </button>
      </div>

      <div
        id="records-panel-gazettes"
        role="tabpanel"
        aria-labelledby="records-tab-gazettes"
        hidden={view !== 'gazettes'}
      >
        {view === 'gazettes' ? (
          <GazettesRecordsTab
            expandNoticeStem={expandNotice}
            onExpandNoticeChange={handleExpandNoticeChange}
          />
        ) : null}
      </div>

      <div
        id="records-panel-streets"
        role="tabpanel"
        aria-labelledby="records-tab-streets"
        hidden={view !== 'streets'}
      >
        {view === 'streets' ? (
          <TimelinesDashboard
            embedded
            onOpenRoadOnMap={onOpenRoadOnMap}
            onOpenGazetteNotice={handleOpenGazetteNotice}
          />
        ) : null}
      </div>
    </section>
  )
}

export default RecordsDashboard
