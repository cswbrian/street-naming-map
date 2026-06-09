import { Fragment, useEffect, useMemo, useState } from 'react'
import { useLocale } from '../i18n/LocaleContext'
import { loadStreetTimelines } from '../lib/loadStreetTimelines.js'
import { formatNamingDate } from '../lib/namingDisplay.js'

const STATUS_ORDER = ['active', 'unlinked', 'abolished', 'disputed', 'legacy_event_code']

const formatNumber = (locale, value) =>
  new Intl.NumberFormat(locale === 'zh' ? 'zh-HK' : 'en-US').format(Number(value) || 0)

function buildSearchHaystack(row) {
  return [
    row.timeline_id,
    row.street_code,
    row.street_name_en,
    row.street_name_zh,
    row.geometry_link?.status,
    row.geometry_link?.district_hint,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function statusLabel(status, t) {
  const key = `timelinesStatus_${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

function TimelinesDashboard({ onOpenRoadOnMap }) {
  const { locale, t } = useLocale()
  const [report, setReport] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
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

  const rows = useMemo(
    () => (Array.isArray(report?.timelines) ? report.timelines : []),
    [report],
  )

  const statusStats = useMemo(() => {
    const counts = new Map()
    rows.forEach((row) => {
      const status = row.geometry_link?.status ?? 'unlinked'
      counts.set(status, (counts.get(status) ?? 0) + 1)
    })
    return STATUS_ORDER.filter((id) => (counts.get(id) ?? 0) > 0).map((id) => ({
      id,
      count: counts.get(id) ?? 0,
      label: statusLabel(id, t),
    }))
  }, [rows, t])

  const loweredQuery = searchText.trim().toLowerCase()

  const filteredRows = useMemo(() => {
    let list = rows
    if (statusFilter) {
      list = list.filter((row) => (row.geometry_link?.status ?? 'unlinked') === statusFilter)
    }
    if (!loweredQuery) return list
    return list.filter((row) => buildSearchHaystack(row).includes(loweredQuery))
  }, [rows, statusFilter, loweredQuery])

  const sortedRows = useMemo(() => {
    const sign = sortConfig.direction === 'asc' ? 1 : -1
    return [...filteredRows].toSorted((a, b) => {
      let aValue
      let bValue
      if (sortConfig.key === 'year') {
        aValue = Number(a.canonical_naming_year) || 0
        bValue = Number(b.canonical_naming_year) || 0
      } else if (sortConfig.key === 'events') {
        aValue = Number(a.event_count) || 0
        bValue = Number(b.event_count) || 0
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
      return { key, direction: key === 'year' ? 'desc' : 'asc' }
    })
  }

  const totals = report?.totals

  return (
    <section className="pending-dashboard timelines-dashboard">
      <header className="link-queue-header">
        <h1 className="link-queue-title">{t('timelinesTitle')}</h1>
        <p className="link-queue-intro">{t('timelinesIntro')}</p>
      </header>

      {isLoading ? <p className="pending-dashboard-note">{t('loadingReport')}</p> : null}
      {!isLoading && error ? (
        <p className="pending-dashboard-note">
          {error === 'timelinesReportError' ? t('timelinesReportError') : error}
        </p>
      ) : null}

      {!isLoading && !error && report ? (
        <div className="pending-dashboard-layout">
          <aside className="pending-dashboard-aside" aria-label={t('timelinesFilterTitle')}>
            <section className="pending-stats-section">
              <h2 className="pending-stats-title">{t('timelinesTotalsTitle')}</h2>
              <div className="pending-stats-grid">
                <div className="pending-stat-card">
                  <h3>{t('timelinesTotal')}</h3>
                  <strong>{formatNumber(locale, totals?.timelines ?? rows.length)}</strong>
                </div>
                <div className="pending-stat-card">
                  <h3>{t('timelinesOnMap')}</h3>
                  <strong>{formatNumber(locale, totals?.linked_active ?? 0)}</strong>
                </div>
                <div className="pending-stat-card">
                  <h3>{t('timelinesUnlinked')}</h3>
                  <strong>{formatNumber(locale, totals?.unlinked ?? 0)}</strong>
                </div>
              </div>
            </section>

            <section className="pending-stats-section">
              <h2 className="pending-stats-title">{t('timelinesFilterTitle')}</h2>
              <div className="pending-filter-row">
                <div className="pending-filter-group pending-filter-group--list" role="group">
                  <button
                    type="button"
                    className={`pending-filter-btn ${!statusFilter ? 'is-active' : ''}`}
                    onClick={() => setStatusFilter(null)}
                    aria-pressed={!statusFilter}
                  >
                    {t('filterAll')}
                    <span className="pending-filter-count">{formatNumber(locale, rows.length)}</span>
                  </button>
                  {statusStats.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`pending-filter-btn ${statusFilter === item.id ? 'is-active' : ''}`}
                      onClick={() => setStatusFilter((prev) => (prev === item.id ? null : item.id))}
                      aria-pressed={statusFilter === item.id}
                    >
                      {item.label}
                      <span className="pending-filter-count">{formatNumber(locale, item.count)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </aside>

          <div className="pending-dashboard-main">
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

            <div className="pending-table-wrap">
              <table className="pending-table timelines-table">
                <thead>
                  <tr>
                    <th>
                      <button type="button" className="pending-sort-header" onClick={() => toggleSort('street')}>
                        {t('colStreet')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="pending-sort-header" onClick={() => toggleSort('year')}>
                        {t('colNaming')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="pending-sort-header" onClick={() => toggleSort('events')}>
                        {t('timelinesColEvents')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="pending-sort-header" onClick={() => toggleSort('status')}>
                        {t('colStatus')}
                      </button>
                    </th>
                    <th>{t('timelinesColActions')}</th>
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
                    const isExpanded = expandedId === row.timeline_id
                    return (
                      <Fragment key={row.timeline_id}>
                        <tr>
                          <td>
                            <div className="link-queue-street-cell">
                              {nameZh ? <span className="link-queue-street-zh">{nameZh}</span> : null}
                              {nameEn ? <span className="link-queue-street-en">{nameEn}</span> : null}
                              {row.street_code ? (
                                <span className="link-queue-district">{row.street_code}</span>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            {row.canonical_naming_date
                              ? formatNamingDate(row.canonical_naming_date)
                              : t('unknownYear')}
                          </td>
                          <td>{row.event_count ?? 0}</td>
                          <td>
                            <span className={`timelines-status-pill is-${status}`}>
                              {statusLabel(status, t)}
                            </span>
                          </td>
                          <td className="timelines-actions-cell">
                            {canOpenMap ? (
                              <button
                                type="button"
                                className="link-queue-copy-btn"
                                onClick={() =>
                                  onOpenRoadOnMap({
                                    englishName: nameEn,
                                    chineseName: nameZh,
                                    namingYear: row.canonical_naming_year,
                                  })
                                }
                              >
                                {t('timelinesOpenMap')}
                              </button>
                            ) : null}
                            {(row.name_history?.length ?? 0) > 0 ? (
                              <button
                                type="button"
                                className="link-queue-copy-btn"
                                onClick={() =>
                                  setExpandedId((prev) =>
                                    prev === row.timeline_id ? null : row.timeline_id,
                                  )
                                }
                              >
                                {isExpanded ? t('timelinesHideHistory') : t('timelinesShowHistory')}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr key={`${row.timeline_id}-history`} className="timelines-history-row">
                            <td colSpan={5}>
                              <ol className="timelines-history-list">
                                {(row.name_history ?? []).map((event, index) => (
                                  <li key={`${row.timeline_id}-${index}`}>
                                    <strong>{formatNamingDate(event.date)}</strong>
                                    {' · '}
                                    {event.name_zh || event.name_en || '—'}
                                    {event.change_kind ? ` (${event.change_kind})` : ''}
                                    {event.notice_label_en ? ` · ${event.notice_label_en}` : ''}
                                  </li>
                                ))}
                              </ol>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
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
    </section>
  )
}

export default TimelinesDashboard
