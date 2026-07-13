import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale } from '../i18n/LocaleContext'
import { getPeriodLabel, PERIOD_GROUP_DEFS } from '../i18n/translations'
import { loadStreetTimelines } from '../lib/loadStreetTimelines.js'
import { buildStreetPagePath } from '../lib/streetPageUrl.js'
import {
  getLatestHistoryDate,
  buildStreetTimelineItems,
  buildTimelineEventLabels,
  buildTimelineRowSearchHaystack,
  buildTimelineSearchLabelSets,
  buildTimelineEventTypeFilterStats,
  timelineRowMatchesEventType,
} from '../lib/nameHistory.js'
import { buildTimelinePeriodCounts, timelineRowMatchesPeriod } from '../lib/timelinePeriodFilter.js'
import { trackNamesFilter } from '../lib/analytics.js'
import ActivePeriodFilterChip from './ActivePeriodFilterChip.jsx'
import NamingYearPeriodsPanel from './NamingYearPeriodsPanel.jsx'
import RecordsFlowIntro from './RecordsFlowIntro.jsx'
import StreetEventTimeline from './StreetEventTimeline.jsx'

const formatNumber = (locale, value) =>
  new Intl.NumberFormat(locale === 'zh' ? 'zh-HK' : 'en-US').format(Number(value) || 0)

function statusLabel(status, t) {
  const key = `timelinesStatus_${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

/** Normalize geometry_link.status for filter chips (active vs everything else as unlinked). */
function linkStatusKey(row) {
  return row?.geometry_link?.status === 'active' ? 'active' : 'unlinked'
}

function sortIndicator(sortConfig, key) {
  if (sortConfig.key !== key) return ''
  return sortConfig.direction === 'asc' ? ' ▲' : ' ▼'
}

function TimelinesDashboard({ onOpenRoadOnMap, embedded = false, onOpenGazetteNotice = null }) {
  const { locale, t } = useLocale()
  const [report, setReport] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchText, setSearchText] = useState('')
  const [periodFilter, setPeriodFilter] = useState(null)
  const [linkStatusFilter, setLinkStatusFilter] = useState(null)
  const [eventTypeFilter, setEventTypeFilter] = useState(null)
  const [expandedEventKey, setExpandedEventKey] = useState(null)
  const [sortConfig, setSortConfig] = useState({ key: 'street', direction: 'asc' })

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        setError('')
        const data = await loadStreetTimelines()
        if (mounted) setReport(data)
      } catch {
        if (mounted) setError('timelinesReportError')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const timelineLabels = useMemo(() => buildTimelineEventLabels(t), [t])
  const searchLabelSets = useMemo(() => buildTimelineSearchLabelSets(), [])

  const rows = useMemo(
    () => (Array.isArray(report?.timelines) ? report.timelines : []),
    [report],
  )

  const periodStats = useMemo(() => {
    const counts = buildTimelinePeriodCounts(rows)
    return PERIOD_GROUP_DEFS.map((group) => ({
      id: group.id,
      label: getPeriodLabel(group, locale),
      count: counts.get(group.id) ?? 0,
    }))
  }, [locale, rows])

  const handlePeriodFilterChange = useCallback((periodId) => {
    setPeriodFilter((prev) => {
      const next = prev === periodId ? null : periodId
      trackNamesFilter('period', periodId, next !== null)
      return next
    })
  }, [])

  const rowsAfterPeriod = useMemo(() => {
    if (!periodFilter) return rows
    return rows.filter((row) => timelineRowMatchesPeriod(row, periodFilter))
  }, [rows, periodFilter])

  const linkStatusFilterOptions = useMemo(() => {
    let active = 0
    let unlinked = 0
    for (const row of rowsAfterPeriod) {
      if (linkStatusKey(row) === 'active') active += 1
      else unlinked += 1
    }
    return [
      { id: 'active', label: t('timelinesOnMap'), count: active },
      { id: 'unlinked', label: t('timelinesUnlinked'), count: unlinked },
    ].filter((option) => option.count > 0)
  }, [rowsAfterPeriod, t])

  const handleLinkStatusFilterChange = useCallback((statusKey) => {
    setLinkStatusFilter((prev) => {
      const next = prev === statusKey ? null : statusKey
      trackNamesFilter('link_status', statusKey, next !== null)
      return next
    })
  }, [])

  useEffect(() => {
    if (!linkStatusFilter) return
    if (!linkStatusFilterOptions.some((option) => option.id === linkStatusFilter)) {
      setLinkStatusFilter(null)
    }
  }, [linkStatusFilter, linkStatusFilterOptions])

  const rowsAfterLinkStatus = useMemo(() => {
    if (!linkStatusFilter) return rowsAfterPeriod
    return rowsAfterPeriod.filter((row) => linkStatusKey(row) === linkStatusFilter)
  }, [rowsAfterPeriod, linkStatusFilter])

  const eventTypeFilterOptions = useMemo(
    () => buildTimelineEventTypeFilterStats(rowsAfterLinkStatus, timelineLabels),
    [rowsAfterLinkStatus, timelineLabels],
  )

  const handleEventTypeFilterChange = useCallback((typeKey) => {
    setEventTypeFilter((prev) => {
      const next = prev === typeKey ? null : typeKey
      trackNamesFilter('event_type', typeKey, next !== null)
      return next
    })
  }, [])

  useEffect(() => {
    if (!eventTypeFilter) return
    if (!eventTypeFilterOptions.some((option) => option.id === eventTypeFilter)) {
      setEventTypeFilter(null)
    }
  }, [eventTypeFilter, eventTypeFilterOptions])

  const loweredQuery = searchText.trim().toLowerCase()

  const filteredRows = useMemo(() => {
    let list = rowsAfterLinkStatus
    if (eventTypeFilter) {
      list = list.filter((row) => timelineRowMatchesEventType(row, eventTypeFilter))
    }
    if (!loweredQuery) return list
    return list.filter((row) => buildTimelineRowSearchHaystack(row, searchLabelSets).includes(loweredQuery))
  }, [rowsAfterLinkStatus, eventTypeFilter, loweredQuery, searchLabelSets])

  const sortedRows = useMemo(() => {
    const sign = sortConfig.direction === 'asc' ? 1 : -1
    return [...filteredRows].toSorted((a, b) => {
      let aValue
      let bValue
      if (sortConfig.key === 'timeline') {
        aValue = getLatestHistoryDate(a.name_history) || a.canonical_naming_date || ''
        bValue = getLatestHistoryDate(b.name_history) || b.canonical_naming_date || ''
      } else if (sortConfig.key === 'status') {
        aValue = String(a.geometry_link?.status ?? '')
        bValue = String(b.geometry_link?.status ?? '')
      } else {
        aValue = `${a.street_name_zh ?? ''} ${a.street_name_en ?? ''}`.toLowerCase()
        bValue = `${b.street_name_zh ?? ''} ${b.street_name_en ?? ''}`.toLowerCase()
      }
      if (aValue < bValue) return -1 * sign
      if (aValue > bValue) return 1 * sign
      return String(a.timeline_id ?? '').localeCompare(String(b.timeline_id ?? ''))
    })
  }, [filteredRows, sortConfig])

  const toggleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: key === 'timeline' ? 'desc' : 'asc' }
    })
  }

  const handleToggleEvent = useCallback((eventKey) => {
    setExpandedEventKey((prev) => (prev === eventKey ? null : eventKey))
  }, [])

  const content = (
    <>
      {!embedded ? (
        <header className="link-queue-header">
          <h1 className="link-queue-title">{t('recordsTitle')}</h1>
          <p className="link-queue-intro">{t('timelinesIntro')}</p>
          <RecordsFlowIntro />
        </header>
      ) : null}

      {isLoading ? <p className="pending-dashboard-note">{t('loadingReport')}</p> : null}
      {!isLoading && error ? (
        <p className="pending-dashboard-note">
          {error === 'timelinesReportError' ? t('timelinesReportError') : error}
        </p>
      ) : null}

      {!isLoading && !error && report ? (
        <div className="pending-dashboard-layout">
          <aside className="pending-dashboard-aside" aria-label={t('periodStatsTitle')}>
            <NamingYearPeriodsPanel
              locale={locale}
              t={t}
              periodStats={periodStats}
              periodFilter={periodFilter}
              onPeriodFilterChange={handlePeriodFilterChange}
              subtitleKey="timelinesPeriodSubtitle"
              hintKey="timelinesPeriodStatsHint"
            />
          </aside>

          <div className="pending-dashboard-main">
            <ActivePeriodFilterChip periodId={periodFilter} onClear={() => setPeriodFilter(null)} />
            <div className="pending-table-controls">
              <input
                type="text"
                className="pending-search-input"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t('timelinesSearch')}
              />
              <span>
                {t('timelinesShowing', {
                  shown: formatNumber(locale, filteredRows.length),
                  total: formatNumber(locale, rows.length),
                })}
              </span>
            </div>

            {linkStatusFilterOptions.length ? (
              <div
                className="street-event-type-filters pending-filter-row"
                role="group"
                aria-label={t('timelinesFilterTitle')}
              >
                <div className="pending-filter-group pending-filter-group--event-type">
                  {linkStatusFilterOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`pending-filter-btn pending-filter-btn--event-type ${linkStatusFilter === option.id ? 'is-active' : ''}`}
                      onClick={() => handleLinkStatusFilterChange(option.id)}
                      aria-pressed={linkStatusFilter === option.id}
                    >
                      {option.label}
                      <span className="pending-filter-count">{formatNumber(locale, option.count)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {eventTypeFilterOptions.length ? (
              <div
                className="street-event-type-filters pending-filter-row"
                role="group"
                aria-label={t('timelinesEventTypeFilterTitle')}
              >
                <div className="pending-filter-group pending-filter-group--event-type">
                  {eventTypeFilterOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`pending-filter-btn pending-filter-btn--event-type ${eventTypeFilter === option.id ? 'is-active' : ''}`}
                      onClick={() => handleEventTypeFilterChange(option.id)}
                      aria-pressed={eventTypeFilter === option.id}
                    >
                      {option.label}
                      <span className="pending-filter-count">{formatNumber(locale, option.count)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="pending-table-wrap">
              <table className="pending-table timelines-table">
                <colgroup>
                  <col className="timelines-col-street" />
                  <col className="timelines-col-status" />
                  <col className="timelines-col-timeline" />
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <button type="button" className="pending-sort-header" onClick={() => toggleSort('street')}>
                        {t('colStreet')}
                        <span>{sortIndicator(sortConfig, 'street')}</span>
                      </button>
                    </th>
                    <th>
                      <button type="button" className="pending-sort-header" onClick={() => toggleSort('status')}>
                        {t('colStatus')}
                        <span>{sortIndicator(sortConfig, 'status')}</span>
                      </button>
                    </th>
                    <th>
                      <button type="button" className="pending-sort-header" onClick={() => toggleSort('timeline')}>
                        {t('colNameHistory')}
                        <span>{sortIndicator(sortConfig, 'timeline')}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.slice(0, 500).map((row) => {
                    const nameZh = row.street_name_zh || ''
                    const nameEn = row.street_name_en || ''
                    const status = row.geometry_link?.status ?? 'unlinked'
                    const canOpenMap =
                      status === 'active' &&
                      row.street_code &&
                      typeof onOpenRoadOnMap === 'function'
                    const isLinked = status === 'active'
                    const displayNames = { en: nameEn, zh: nameZh }
                    const openOnMap = () =>
                      onOpenRoadOnMap({
                        englishName: nameEn,
                        chineseName: nameZh,
                        streetCode: row.street_code,
                        namingYear: row.canonical_naming_year,
                      })

                    const streetCell = row.page_id ? (
                      <Link
                        to={buildStreetPagePath(locale, row.page_id)}
                        className="street-page-street-link"
                      >
                        {nameZh ? <span className="link-queue-street-zh">{nameZh}</span> : null}
                        {nameEn ? <span className="link-queue-street-en">{nameEn}</span> : null}
                      </Link>
                    ) : (
                      <>
                        {nameZh ? <span className="link-queue-street-zh">{nameZh}</span> : null}
                        {nameEn ? <span className="link-queue-street-en">{nameEn}</span> : null}
                        {!isLinked && row.street_code ? (
                          <span className="link-queue-district">{row.street_code}</span>
                        ) : null}
                        {!isLinked && !row.street_code && row.timeline_id ? (
                          <span className="link-queue-district">{row.timeline_id}</span>
                        ) : null}
                      </>
                    )

                    const statusPillLabel = statusLabel(status, t)
                    const statusPill = canOpenMap ? (
                      <button
                        type="button"
                        className="timelines-status-map-link"
                        onClick={openOnMap}
                        aria-label={t('timelinesOpenMapStatus', {
                          status: statusPillLabel,
                          code: row.street_code,
                          name: nameEn || nameZh,
                        })}
                      >
                        {statusPillLabel} · {row.street_code}
                      </button>
                    ) : (
                      <span className={`timelines-status-pill is-${status}`}>{statusPillLabel}</span>
                    )

                    return (
                      <tr key={row.timeline_id}>
                        <td>
                          <div className="link-queue-street-cell">{streetCell}</div>
                        </td>
                        <td>
                          <div className="timelines-status-cell">{statusPill}</div>
                        </td>
                        <td className="timelines-timeline-cell">
                          <StreetEventTimeline
                            items={buildStreetTimelineItems(row.name_history, locale, timelineLabels, displayNames, {
                              idPrefix: row.timeline_id,
                              t,
                            })}
                            variant="table"
                            expandable
                            locale={locale}
                            t={t}
                            expandedEventKey={expandedEventKey}
                            onToggleEvent={handleToggleEvent}
                            onOpenGazetteNotice={onOpenGazetteNotice}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {sortedRows.length > 500 ? (
              <p className="pending-dashboard-note">{t('truncatedRows')}</p>
            ) : null}
            {!sortedRows.length ? (
              <p className="pending-dashboard-note">{t('timelinesEmpty')}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )

  if (embedded) return content

  return (
    <section className="pending-dashboard timelines-dashboard">
      {content}
    </section>
  )
}

export default TimelinesDashboard
