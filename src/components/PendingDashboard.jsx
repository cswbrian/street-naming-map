import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLocale } from '../i18n/LocaleContext'
import { getPeriodLabel, getRoadTypeLabel, PERIOD_GROUP_DEFS } from '../i18n/translations'
import ContributeActionIcon from './ContributeActionIcon.jsx'
import { buildSingleStreetFormUrl } from '../lib/contributeForm.js'
import { trackContributeOpen, trackNamesFilter, trackNoticeOpen } from '../lib/analytics.js'
import { getNoticeLink } from '../lib/governmentNotice.js'
import { hasStreetName } from '../lib/roadKey'
import {
  EVIDENCE_FILTER_KIND_ORDER,
  getEvidenceKindBadge,
  isEvidenceFilterId,
  resolveDisplayEvidenceKind,
} from '../lib/evidenceKindBadge.js'
import { hasNamingYear } from '../lib/submissionStatus.js'

const DATA_URL = `${import.meta.env.BASE_URL}data/master/pending-naming-years.json`
const NOTICE_STEMS_URL = `${import.meta.env.BASE_URL}data/master/egazette-notice-stems.json`
const PDF_LOCALES_URL = `${import.meta.env.BASE_URL}data/master/egazette-pdf-locales.json`

const LIST_FILTERS = ['all', 'pending']

const FILTER_LABEL_KEYS = {
  all: 'filterAll',
  pending: 'filterPendingDate',
}

const ROAD_TYPE_PRIORITY = {
  Highway: 1,
  'Main Road': 2,
  'Secondary Road': 3,
  'Restricted Road': 4,
  Tunnel: 5,
  Track: 6,
  'Unknown Type': 99,
}

const formatNumber = (locale, value) =>
  new Intl.NumberFormat(locale === 'zh' ? 'zh-HK' : 'en-US').format(Number(value) || 0)

import {
  buildRowSearchHaystack,
  formatNamingDate,
  getNamingDisplay,
  hasRowNamingDate,
} from '../lib/namingDisplay.js'

const getPeriodGroupId = (row) => {
  if (!hasNamingYear(row)) return 'unknown'
  const year = Number(row.naming_year)
  const matched = PERIOD_GROUP_DEFS.find(
    (group) =>
      group.id !== 'unknown' && year >= Number(group.start) && year <= Number(group.end),
  )
  return matched?.id ?? 'unknown'
}

function PendingDashboard({ onOpenRoadOnMap }) {
  const { locale, t } = useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const filterFromUrl = searchParams.get('filter') || 'all'
  const evidenceFromUrl = searchParams.get('evidence') || ''
  const [report, setReport] = useState(null)
  const [noticeStemIndex, setNoticeStemIndex] = useState(null)
  const [pdfLocales, setPdfLocales] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [error, setError] = useState('')
  const [listFilter, setListFilter] = useState(() =>
    LIST_FILTERS.includes(filterFromUrl) ? filterFromUrl : 'all',
  )
  const [sortConfig, setSortConfig] = useState({ key: 'year', direction: 'desc' })
  const [typeFilter, setTypeFilter] = useState(null)
  const [periodFilter, setPeriodFilter] = useState(null)
  const [evidenceFilter, setEvidenceFilter] = useState(() =>
    isEvidenceFilterId(evidenceFromUrl) ? evidenceFromUrl : null,
  )

  const syncSearchParams = (next) => {
    const params = new URLSearchParams()
    const list = next?.listFilter ?? listFilter
    const evidence = next?.evidenceFilter ?? evidenceFilter
    if (list && list !== 'all') params.set('filter', list)
    if (evidence) params.set('evidence', evidence)
    setSearchParams(params, { replace: true })
  }

  useEffect(() => {
    if (LIST_FILTERS.includes(filterFromUrl)) {
      setListFilter(filterFromUrl)
    }
  }, [filterFromUrl])

  useEffect(() => {
    setEvidenceFilter(isEvidenceFilterId(evidenceFromUrl) ? evidenceFromUrl : null)
  }, [evidenceFromUrl])

  const handleListFilterChange = (id) => {
    trackNamesFilter('list', id)
    setListFilter(id)
    if (id === 'all') {
      setTypeFilter(null)
      setPeriodFilter(null)
    }
    syncSearchParams({ listFilter: id, evidenceFilter })
  }

  const handleEvidenceFilterChange = (kind) => {
    const next = evidenceFilter === kind ? null : kind
    trackNamesFilter('evidence', kind, next !== null)
    setEvidenceFilter(next)
    syncSearchParams({ listFilter, evidenceFilter: next })
  }

  const handleTypeFilterChange = (type) => {
    setTypeFilter((prev) => {
      const next = prev === type ? null : type
      trackNamesFilter('road_type', type, next !== null)
      return next
    })
  }

  const handlePeriodFilterChange = (periodId) => {
    setPeriodFilter((prev) => {
      const next = prev === periodId ? null : periodId
      trackNamesFilter('period', periodId, next !== null)
      return next
    })
  }

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        setError('')
        const [reportRes, stemsRes, localesRes] = await Promise.all([
          fetch(DATA_URL),
          fetch(NOTICE_STEMS_URL),
          fetch(PDF_LOCALES_URL),
        ])
        if (!reportRes.ok) throw new Error('report')
        const data = await reportRes.json()
        if (mounted) {
          setReport(data)
          if (stemsRes.ok) {
            setNoticeStemIndex(await stemsRes.json())
          }
          if (localesRes.ok) {
            setPdfLocales(await localesRes.json())
          }
        }
      } catch {
        if (mounted) setError('reportError')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const rows = useMemo(() => {
    const allRows = Array.isArray(report?.roads) ? report.roads : []
    return allRows.filter((row) => hasStreetName(row.english_name, row.chinese_name))
  }, [report])

  const coverage = useMemo(() => {
    const total = rows.length
    const named = rows.filter((row) => hasNamingYear(row)).length
    const pct = total ? (named / total) * 100 : 0
    return { total, named, pending: total - named, pct }
  }, [rows])

  const loweredQuery = searchText.trim().toLowerCase()

  const getNamingDisplayForRow = (row) => getNamingDisplay(row, t)

  const filteredRows = useMemo(() => {
    let list = rows
    if (listFilter === 'pending') {
      list = list.filter((row) => !hasNamingYear(row) && !formatNamingDate(row.naming_date))
    }
    if (typeFilter) {
      list = list.filter((row) => (row.street_type || 'Unknown Type') === typeFilter)
    }
    if (periodFilter) {
      list = list.filter((row) => getPeriodGroupId(row) === periodFilter)
    }
    if (evidenceFilter) {
      list = list.filter(
        (row) => resolveDisplayEvidenceKind(row.naming_details) === evidenceFilter,
      )
    }
    if (!loweredQuery) return list
    return list.filter((row) => buildRowSearchHaystack(row, t).includes(loweredQuery))
  }, [rows, loweredQuery, listFilter, typeFilter, periodFilter, evidenceFilter, t])

  const sortedRows = useMemo(() => {
    const getStreetName = (row) =>
      `${row.chinese_name || ''} ${row.english_name || ''}`.trim().toLowerCase()
    const getType = (row) => String(row.street_type || '').toLowerCase()
    const getYear = (row) => {
      const date = formatNamingDate(row.naming_date)
      if (date) return Number(date.replaceAll('.', ''))
      const year = Number(row.naming_year)
      if (Number.isFinite(year)) return year * 10000 + 101
      return -1
    }
    const getNotice = (row) => {
      const link = getNoticeLink(row.naming_details, locale, {
        noticeIndex: noticeStemIndex,
        pdfLocales,
      })
      return (link?.label ?? '').toLowerCase()
    }

    const getComparableValue = (row, key) => {
      if (key === 'street') return getStreetName(row)
      if (key === 'type') return getType(row)
      if (key === 'year') return getYear(row)
      return getNotice(row)
    }

    const sign = sortConfig.direction === 'asc' ? 1 : -1
    const sorted = [...filteredRows].sort((a, b) => {
      const aValue = getComparableValue(a, sortConfig.key)
      const bValue = getComparableValue(b, sortConfig.key)
      if (aValue < bValue) return -1 * sign
      if (aValue > bValue) return 1 * sign
      return getStreetName(a).localeCompare(getStreetName(b))
    })
    return sorted
  }, [filteredRows, sortConfig, locale, noticeStemIndex, pdfLocales])

  const toggleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: 'asc' }
    })
  }

  const roadTypeStats = useMemo(() => {
    const counts = new Map()
    rows.forEach((row) => {
      const type = row.street_type || 'Unknown Type'
      counts.set(type, (counts.get(type) ?? 0) + 1)
    })
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => {
        const pa = ROAD_TYPE_PRIORITY[a.label] ?? 50
        const pb = ROAD_TYPE_PRIORITY[b.label] ?? 50
        if (pa !== pb) return pa - pb
        if (b.count !== a.count) return b.count - a.count
        return a.label.localeCompare(b.label)
      })
  }, [rows])

  const evidenceFilterOptions = useMemo(() => {
    const counts = new Map(EVIDENCE_FILTER_KIND_ORDER.map((kind) => [kind, 0]))
    rows.forEach((row) => {
      const kind = resolveDisplayEvidenceKind(row.naming_details)
      if (kind && counts.has(kind)) counts.set(kind, (counts.get(kind) ?? 0) + 1)
    })
    return EVIDENCE_FILTER_KIND_ORDER.filter((kind) => (counts.get(kind) ?? 0) > 0).map(
      (kind) => ({
        id: kind,
        count: counts.get(kind) ?? 0,
        badge: getEvidenceKindBadge(kind, t),
      }),
    )
  }, [rows, t])

  const periodStats = useMemo(() => {
    const counts = new Map(PERIOD_GROUP_DEFS.map((group) => [group.id, 0]))
    rows.forEach((row) => {
      const periodId = getPeriodGroupId(row)
      counts.set(periodId, (counts.get(periodId) ?? 0) + 1)
    })
    return PERIOD_GROUP_DEFS.map((group) => ({
      id: group.id,
      label: getPeriodLabel(group, locale),
      count: counts.get(group.id) ?? 0,
    }))
  }, [locale, rows])

  return (
    <section className="pending-dashboard">

      {isLoading ? <p className="pending-dashboard-note">{t('loadingReport')}</p> : null}
      {!isLoading && error ? (
        <p className="pending-dashboard-note">{error === 'reportError' ? t('reportError') : error}</p>
      ) : null}

      {!isLoading && !error && report ? (
        <div className="pending-dashboard-layout">
          <aside
            className="pending-dashboard-aside"
            aria-label={`${t('roadTypesTitle')} / ${t('periodStatsTitle')}`}
          >
            <section className="pending-stats-section pending-stats-section--road-types">
              <h2 className="pending-stats-title">{t('roadTypesTitle')}</h2>
              <div className="pending-stats-grid">
                {roadTypeStats.map((item) => (
                  <button
                    type="button"
                    key={`type-${item.label}`}
                    className={`pending-stat-card ${typeFilter === item.label ? 'is-active' : ''}`}
                    onClick={() => handleTypeFilterChange(item.label)}
                    aria-pressed={typeFilter === item.label}
                  >
                    <h3>{getRoadTypeLabel(locale, item.label)}</h3>
                    <strong>{formatNumber(locale, item.count)}</strong>
                  </button>
                ))}
              </div>
            </section>

            <section className="pending-stats-section pending-stats-section--periods">
              <h2 className="pending-stats-title">{t('periodStatsTitle')}</h2>
              <p className="pending-stats-hint">{t('periodStatsHint')}</p>
              <div className="pending-stats-grid">
                {periodStats.map((item) => (
                  <button
                    type="button"
                    key={`period-${item.id}`}
                    className={`pending-stat-card ${periodFilter === item.id ? 'is-active' : ''}`}
                    onClick={() => handlePeriodFilterChange(item.id)}
                    aria-pressed={periodFilter === item.id}
                  >
                    <h3>{item.label}</h3>
                    <strong>{formatNumber(locale, item.count)}</strong>
                  </button>
                ))}
              </div>
            </section>

            <div className="pending-filter-row">
              <div className="pending-filter-group pending-filter-group--list" role="group" aria-label={t('filterAll')}>
                {LIST_FILTERS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`pending-filter-btn ${listFilter === id ? 'is-active' : ''}`}
                    onClick={() => handleListFilterChange(id)}
                    aria-pressed={listFilter === id}
                  >
                    {t(FILTER_LABEL_KEYS[id])}
                  </button>
                ))}
              </div>
              {evidenceFilterOptions.length ? (
                <div
                  className="pending-filter-group pending-filter-group--evidence"
                  role="group"
                  aria-label={t('filterSourceTitle')}
                >
                  {evidenceFilterOptions.map((option) => {
                    const label = option.badge?.label
                    const hint = option.badge?.hint
                    const isActive = evidenceFilter === option.id
                    return (
                      <button
                        key={`evidence-${option.id}`}
                        type="button"
                        className={`pending-filter-btn pending-filter-btn--evidence pending-evidence-${option.id} ${isActive ? 'is-active' : ''}`}
                        onClick={() => handleEvidenceFilterChange(option.id)}
                        aria-pressed={isActive}
                        title={hint}
                      >
                        {label}
                        <span className="pending-filter-count">{formatNumber(locale, option.count)}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </aside>

          <div className="pending-dashboard-main">
            <div className="pending-table-controls">
              <input
                type="text"
                className="pending-search-input"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t('searchTable')}
              />
              <span>
                {t('showingStreets', {
                  shown: formatNumber(locale, filteredRows.length),
                  total: formatNumber(locale, rows.length),
                })}
              </span>
            </div>

            <section className="pending-coverage-section pending-table-stats">
              <div
                className="pending-coverage-bar"
                role="progressbar"
                aria-valuenow={coverage.named}
                aria-valuemin={0}
                aria-valuemax={coverage.total}
              >
                <div className="pending-coverage-fill" style={{ width: `${coverage.pct.toFixed(1)}%` }} />
              </div>
              <p className="pending-coverage-label">
                {t('contributeNamed')}: {formatNumber(locale, coverage.named)} /{' '}
                {formatNumber(locale, coverage.total)} ({coverage.pct.toFixed(1)}%)
              </p>
            </section>

            <div className="pending-table-wrap">
            <table className="pending-table">
              <colgroup>
                <col className="pending-col-street" />
                <col className="pending-col-type" />
                <col className="pending-col-date" />
                <col className="pending-col-evidence" />
                <col className="pending-col-action" />
              </colgroup>
              <thead>
                <tr>
                  <th className="pending-col-street-head">
                    <button type="button" className="pending-sort-header" onClick={() => toggleSort('street')}>
                      {t('colStreet')}
                      <span>{sortConfig.key === 'street' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  </th>
                  <th className="pending-col-type-head">
                    <button type="button" className="pending-sort-header" onClick={() => toggleSort('type')}>
                      {t('colType')}
                      <span>{sortConfig.key === 'type' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" className="pending-sort-header" onClick={() => toggleSort('year')}>
                      {t('colNaming')}
                      <span>{sortConfig.key === 'year' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  </th>
                  <th className="pending-col-evidence-head">
                    <button type="button" className="pending-sort-header" onClick={() => toggleSort('notice')}>
                      {t('colSource')}
                      <span>{sortConfig.key === 'notice' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  </th>
                  <th className="pending-col-action-head" title={t('contributeFillGap')}>
                    {t('colContribute')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.slice(0, 500).map((row) => {
                  const zhName = String(row.chinese_name ?? '').trim()
                  const enName = String(row.english_name ?? '').trim()
                  const canOpenOnMap = Boolean(onOpenRoadOnMap && enName && zhName)
                  const notice = getNoticeLink(row.naming_details, locale, {
                    noticeIndex: noticeStemIndex,
                    pdfLocales,
                  })
                  const formUrl = buildSingleStreetFormUrl({
                    streetCode: row.street_code,
                    englishName: row.english_name,
                    chineseName: row.chinese_name,
                  })
                  const evidenceKind = resolveDisplayEvidenceKind(row.naming_details)
                  const evidenceBadge = evidenceKind ? getEvidenceKindBadge(evidenceKind, t) : null

                  const streetCell = (
                    <div className="pending-street-cell">
                      {zhName ? <span className="pending-street-zh">{zhName}</span> : null}
                      {enName ? <span className="pending-street-en">{enName}</span> : null}
                      {!zhName && !enName ? '—' : null}
                    </div>
                  )

                  return (
                    <tr key={row.road_key}>
                      <td className="pending-col-street-cell">
                        <div className="pending-street-scroll">
                          {canOpenOnMap ? (
                            <button
                              type="button"
                              className="pending-street-link"
                              onClick={() =>
                                onOpenRoadOnMap({
                                  englishName: row.english_name,
                                  chineseName: row.chinese_name,
                                  namingYear: Number(row.naming_year),
                                })
                              }
                            >
                              {streetCell}
                            </button>
                          ) : (
                            streetCell
                          )}
                        </div>
                      </td>
                      <td className="pending-col-type-cell">
                        {getRoadTypeLabel(locale, row.street_type) || '—'}
                      </td>
                      <td className="pending-col-date-cell">{getNamingDisplayForRow(row)}</td>
                      <td className="pending-col-evidence-cell">
                        {evidenceBadge ? (
                          notice?.url ? (
                            <a
                              href={notice.url}
                              target="_blank"
                              rel="noreferrer"
                              className={`pending-evidence-badge pending-evidence-link pending-evidence-${evidenceBadge.kind}`}
                              title={
                                notice.label
                                  ? `${evidenceBadge.hint} — ${notice.label}`
                                  : evidenceBadge.hint
                              }
                              onClick={() => trackNoticeOpen('names_table')}
                            >
                              {evidenceBadge.label}
                            </a>
                          ) : (
                            <span
                              className={`pending-evidence-badge pending-evidence-${evidenceBadge.kind}`}
                              title={
                                notice?.label
                                  ? `${evidenceBadge.hint} — ${notice.label}`
                                  : evidenceBadge.hint
                              }
                            >
                              {evidenceBadge.label}
                            </span>
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="pending-col-action-cell">
                        {formUrl ? (
                          <a
                            href={formUrl}
                            className="pending-contribute-link"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t('contributeFillGap')}
                            title={t('contributeFillGap')}
                            onClick={() =>
                              trackContributeOpen(
                                'names_table',
                                hasRowNamingDate(row) ? 'edit' : 'add',
                              )
                            }
                          >
                            <ContributeActionIcon
                              size={16}
                              variant={hasRowNamingDate(row) ? 'edit' : 'add'}
                            />
                          </a>
                        ) : (
                          '—'
                        )}
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
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default PendingDashboard
