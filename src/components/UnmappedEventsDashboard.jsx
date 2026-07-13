import { useEffect, useMemo, useState } from 'react'
import { useLocale } from '../i18n/LocaleContext'
import LinkDraftPanel from './LinkDraftPanel.jsx'
import { loadUnmappedEvents } from '../lib/loadUnmappedEvents.js'
import { formatDisplayDate } from '../lib/namingDisplay.js'

const SOURCE_ORDER = ['landsd', 'egazette_pdf', 'crowdsubmitted', 'hkgro']
const KIND_ORDER = ['declare', 'rename', 'extend', 'delete']

const formatNumber = (locale, value) =>
  new Intl.NumberFormat(locale === 'zh' ? 'zh-HK' : 'en-US').format(Number(value) || 0)

function buildSearchHaystack(row) {
  return [
    row.event_id,
    row.street_name_en,
    row.street_name_zh,
    row.district_raw_en,
    row.district_raw_zh,
    row.notice_no,
    row.change_kind,
    row.source,
    row.legacy_street_code,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function sourceLabel(source, t) {
  const key = `linkQueueSource_${source}`
  const translated = t(key)
  return translated === key ? source : translated
}

function UnmappedEventsDashboard() {
  const { locale, t } = useLocale()
  const [report, setReport] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchText, setSearchText] = useState('')
  const [sourceFilter, setSourceFilter] = useState(null)
  const [kindFilter, setKindFilter] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' })
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        setError('')
        const data = await loadUnmappedEvents()
        if (mounted) setReport(data)
      } catch {
        if (mounted) setError('linkQueueReportError')
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
    () => (Array.isArray(report?.events) ? report.events : []),
    [report],
  )

  const sourceStats = useMemo(() => {
    const counts = new Map(SOURCE_ORDER.map((id) => [id, 0]))
    rows.forEach((row) => {
      const src = row.source ?? 'unknown'
      counts.set(src, (counts.get(src) ?? 0) + 1)
    })
    return SOURCE_ORDER.filter((id) => (counts.get(id) ?? 0) > 0).map((id) => ({
      id,
      count: counts.get(id) ?? 0,
      label: sourceLabel(id, t),
    }))
  }, [rows, t])

  const kindStats = useMemo(() => {
    const counts = new Map()
    rows.forEach((row) => {
      const kind = row.change_kind ?? 'other'
      counts.set(kind, (counts.get(kind) ?? 0) + 1)
    })
    return KIND_ORDER.filter((id) => (counts.get(id) ?? 0) > 0).map((id) => ({
      id,
      count: counts.get(id) ?? 0,
      label: id,
    }))
  }, [rows])

  const loweredQuery = searchText.trim().toLowerCase()

  const filteredRows = useMemo(() => {
    let list = rows
    if (sourceFilter) {
      list = list.filter((row) => row.source === sourceFilter)
    }
    if (kindFilter) {
      list = list.filter((row) => row.change_kind === kindFilter)
    }
    if (!loweredQuery) return list
    return list.filter((row) => buildSearchHaystack(row).includes(loweredQuery))
  }, [rows, sourceFilter, kindFilter, loweredQuery])

  const sortedRows = useMemo(() => {
    const sign = sortConfig.direction === 'asc' ? 1 : -1
    return [...filteredRows].toSorted((a, b) => {
      let aValue
      let bValue
      if (sortConfig.key === 'street') {
        aValue = `${a.street_name_zh ?? ''} ${a.street_name_en ?? ''}`.toLowerCase()
        bValue = `${b.street_name_zh ?? ''} ${b.street_name_en ?? ''}`.toLowerCase()
      } else if (sortConfig.key === 'source') {
        aValue = String(a.source ?? '')
        bValue = String(b.source ?? '')
      } else {
        aValue = String(a.publication_date ?? '')
        bValue = String(b.publication_date ?? '')
      }
      if (aValue < bValue) return -1 * sign
      if (aValue > bValue) return 1 * sign
      return String(a.event_id ?? '').localeCompare(String(b.event_id ?? ''))
    })
  }, [filteredRows, sortConfig])

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.event_id)),
    [rows, selectedIds],
  )

  const visibleIds = useMemo(
    () => sortedRows.slice(0, 500).map((row) => row.event_id),
    [sortedRows],
  )

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  const toggleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: key === 'date' ? 'desc' : 'asc' }
    })
  }

  const toggleRow = (eventId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const copyEventId = async (eventId) => {
    try {
      await navigator.clipboard.writeText(eventId)
      setCopiedId(eventId)
      window.setTimeout(() => setCopiedId((current) => (current === eventId ? null : current)), 2000)
    } catch {
      setCopiedId(null)
    }
  }

  const mappedCount = report?.totals?.mapped_event_ids ?? 0
  const unmappedCount = report?.totals?.unmapped_events ?? rows.length

  return (
    <section className="pending-dashboard link-queue-dashboard">
      <header className="link-queue-header">
        <h1 className="link-queue-title">{t('linkQueueTitle')}</h1>
        <p className="link-queue-intro">{t('linkQueueIntro')}</p>
        <p className="link-queue-hint">{t('linkQueueHint')}</p>
      </header>

      {isLoading ? <p className="pending-dashboard-note">{t('loadingReport')}</p> : null}
      {!isLoading && error ? (
        <p className="pending-dashboard-note">
          {error === 'linkQueueReportError' ? t('linkQueueReportError') : error}
        </p>
      ) : null}

      {!isLoading && !error && report ? (
        <div className="pending-dashboard-layout link-queue-layout">
          <aside
            className="pending-dashboard-aside"
            aria-label={t('linkQueueSourceFilterTitle')}
          >
            <section className="pending-stats-section">
              <h2 className="pending-stats-title">{t('linkQueueTotalsTitle')}</h2>
              <div className="pending-stats-grid">
                <div className="pending-stat-card link-queue-stat-card">
                  <h3>{t('linkQueueMapped')}</h3>
                  <strong>{formatNumber(locale, mappedCount)}</strong>
                </div>
                <div className="pending-stat-card link-queue-stat-card is-active">
                  <h3>{t('linkQueueUnmapped')}</h3>
                  <strong>{formatNumber(locale, unmappedCount)}</strong>
                </div>
              </div>
            </section>

            <section className="pending-stats-section">
              <h2 className="pending-stats-title">{t('linkQueueSourceFilterTitle')}</h2>
              <div className="pending-filter-row">
                <div className="pending-filter-group pending-filter-group--list" role="group">
                  <button
                    type="button"
                    className={`pending-filter-btn ${!sourceFilter ? 'is-active' : ''}`}
                    onClick={() => setSourceFilter(null)}
                    aria-pressed={!sourceFilter}
                  >
                    {t('filterAll')}
                    <span className="pending-filter-count">{formatNumber(locale, rows.length)}</span>
                  </button>
                  {sourceStats.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`pending-filter-btn ${sourceFilter === item.id ? 'is-active' : ''}`}
                      onClick={() => setSourceFilter((prev) => (prev === item.id ? null : item.id))}
                      aria-pressed={sourceFilter === item.id}
                    >
                      {item.label}
                      <span className="pending-filter-count">{formatNumber(locale, item.count)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="pending-stats-section">
              <h2 className="pending-stats-title">{t('linkQueueKindFilterTitle')}</h2>
              <div className="pending-filter-row">
                <div className="pending-filter-group pending-filter-group--list" role="group">
                  <button
                    type="button"
                    className={`pending-filter-btn ${!kindFilter ? 'is-active' : ''}`}
                    onClick={() => setKindFilter(null)}
                    aria-pressed={!kindFilter}
                  >
                    {t('filterAll')}
                  </button>
                  {kindStats.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`pending-filter-btn ${kindFilter === item.id ? 'is-active' : ''}`}
                      onClick={() => setKindFilter((prev) => (prev === item.id ? null : item.id))}
                      aria-pressed={kindFilter === item.id}
                    >
                      {item.label}
                      <span className="pending-filter-count">{formatNumber(locale, item.count)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <LinkDraftPanel
              selectedRows={selectedRows}
              onClearSelection={() => setSelectedIds(new Set())}
            />
          </aside>

          <div className="pending-dashboard-main">
            <div className="pending-table-controls">
              <input
                type="text"
                className="pending-search-input"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t('linkQueueSearch')}
              />
              <span>
                {t('linkQueueShowing', {
                  shown: formatNumber(locale, filteredRows.length),
                  total: formatNumber(locale, rows.length),
                })}
              </span>
            </div>

            <div className="pending-table-wrap">
              <table className="pending-table link-queue-table">
                <colgroup>
                  <col className="link-queue-col-select" />
                  <col className="link-queue-col-date" />
                  <col className="pending-col-street" />
                  <col className="link-queue-col-kind" />
                  <col className="link-queue-col-source" />
                  <col className="link-queue-col-notice" />
                  <col className="link-queue-col-id" />
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        aria-label={t('linkQueueSelectAll')}
                      />
                    </th>
                    <th>
                      <button type="button" className="pending-sort-header" onClick={() => toggleSort('date')}>
                        {t('colNaming')}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="pending-sort-header" onClick={() => toggleSort('street')}>
                        {t('colStreet')}
                      </button>
                    </th>
                    <th>{t('linkQueueColKind')}</th>
                    <th>
                      <button type="button" className="pending-sort-header" onClick={() => toggleSort('source')}>
                        {t('colPipeline')}
                      </button>
                    </th>
                    <th>{t('colNotice')}</th>
                    <th>{t('linkQueueColEventId')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.slice(0, 500).map((row) => {
                    const nameZh = row.street_name_zh || ''
                    const nameEn = row.street_name_en || ''
                    const district = row.district_raw_zh || row.district_raw_en || ''
                    return (
                      <tr key={row.event_id} className={selectedIds.has(row.event_id) ? 'is-selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.event_id)}
                            onChange={() => toggleRow(row.event_id)}
                            aria-label={row.event_id}
                          />
                        </td>
                        <td>{formatDisplayDate(row.publication_date, { fallback: '—' })}</td>
                        <td>
                          <div className="link-queue-street-cell">
                            {nameZh ? <span className="link-queue-street-zh">{nameZh}</span> : null}
                            {nameEn ? <span className="link-queue-street-en">{nameEn}</span> : null}
                            {!nameZh && !nameEn ? <span className="link-queue-street-missing">—</span> : null}
                            {district ? (
                              <span className="link-queue-district">{district}</span>
                            ) : null}
                          </div>
                        </td>
                        <td>{row.change_kind || '—'}</td>
                        <td>{sourceLabel(row.source, t)}</td>
                        <td>{row.notice_no || '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="link-queue-copy-btn"
                            title={t('linkQueueCopyId')}
                            onClick={() => copyEventId(row.event_id)}
                          >
                            {copiedId === row.event_id ? t('linkQueueCopied') : t('linkQueueCopyId')}
                          </button>
                          <code className="link-queue-event-id">{row.event_id}</code>
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
              <p className="pending-dashboard-note">{t('linkQueueEmpty')}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default UnmappedEventsDashboard
