import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale } from '../i18n/LocaleContext'
import { loadGazetteNotices } from '../lib/loadGazetteNotices.js'
import { buildNoticeSearchHaystack } from '../lib/gazetteNoticeSearch.js'
import {
  getEventYearFromDate,
  getTimelinePeriodGroupIdForYear,
} from '../lib/timelinePeriodFilter.js'
import { getPeriodLabel, PERIOD_GROUP_DEFS } from '../i18n/translations.js'
import ActivePeriodFilterChip from './ActivePeriodFilterChip.jsx'
import NamingYearPeriodsPanel from './NamingYearPeriodsPanel.jsx'
import GazetteNoticeSheet from './GazetteNoticeSheet.jsx'
import { formatDisplayDate } from '../lib/namingDisplay.js'

const formatNumber = (locale, value) =>
  new Intl.NumberFormat(locale === 'zh' ? 'zh-HK' : 'en-US').format(Number(value) || 0)

function noticeMatchesPeriod(notice, periodId) {
  if (!periodId) return true
  const year = getEventYearFromDate(notice.publication_date)
  if (periodId === 'unknown') return !year
  return getTimelinePeriodGroupIdForYear(year) === periodId
}

function buildNoticePeriodCounts(notices) {
  const counts = new Map(PERIOD_GROUP_DEFS.map((group) => [group.id, 0]))
  for (const notice of notices) {
    const year = getEventYearFromDate(notice.publication_date)
    if (!year) {
      counts.set('unknown', (counts.get('unknown') ?? 0) + 1)
      continue
    }
    const periodId = getTimelinePeriodGroupIdForYear(year)
    counts.set(periodId, (counts.get(periodId) ?? 0) + 1)
  }
  return counts
}

function formatNoticeLabel(notice, locale) {
  const en = notice.gazette_notice_label_en
  const zh = notice.gazette_notice_label_zh
  if (locale === 'zh' && zh) return zh
  if (en) return en
  if (zh) return zh
  return notice.notice_stem
}

/** Display as "G.N 2370" instead of internal stem or "G.N.2370". */
function formatGnDisplayLabel(label) {
  const text = String(label ?? '').trim()
  if (!text) return '—'
  const match = text.match(/^G\.?\s*N\.?\s*(\d+(?:-\d+)?)/i)
  if (match) return `G.N ${match[1]}`
  return text
}

const STREET_NAME_PREVIEW_LIMIT = 4

function getNoticeStreetEntries(notice, locale) {
  const rows =
    (notice.streets_draft?.length ? notice.streets_draft : notice.linked_streets) ?? []
  return rows
    .map((row) => {
      const label =
        locale === 'zh' && row.street_name_zh
          ? row.street_name_zh
          : row.street_name_en || row.street_name_zh
      if (!label) return null
      return { label, key: `${row.row_index ?? label}-${label}` }
    })
    .filter(Boolean)
}

function resolvePdfUrl(path) {
  if (!path) return null
  if (path.startsWith('http')) return path
  return path.startsWith('/') ? path : `/${path}`
}

function stopRowClick(event) {
  event.stopPropagation()
}

function GazettesRecordsTab({ expandNoticeStem = null, onExpandNoticeChange }) {
  const { locale, t } = useLocale()
  const [report, setReport] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchText, setSearchText] = useState('')
  const [periodFilter, setPeriodFilter] = useState(null)
  const [sortDesc, setSortDesc] = useState(true)
  const searchInputRef = useRef(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        setError('')
        const data = await loadGazetteNotices()
        if (mounted) setReport(data)
      } catch {
        if (mounted) setError('recordsGazettesError')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const openNoticeStem = expandNoticeStem
  const rows = useMemo(() => report?.notices ?? [], [report])

  const selectedNotice = useMemo(
    () => rows.find((notice) => notice.notice_stem === openNoticeStem) ?? null,
    [rows, openNoticeStem],
  )

  const periodStats = useMemo(() => {
    const counts = buildNoticePeriodCounts(rows)
    return PERIOD_GROUP_DEFS.map((group) => ({
      id: group.id,
      label: getPeriodLabel(group, locale),
      count: counts.get(group.id) ?? 0,
    }))
  }, [locale, rows])

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return rows.filter((notice) => {
      if (!noticeMatchesPeriod(notice, periodFilter)) return false
      if (!query) return true
      return buildNoticeSearchHaystack(notice).includes(query)
    })
  }, [rows, searchText, periodFilter])

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows]
    copy.sort((a, b) => {
      const cmp = String(b.publication_date).localeCompare(String(a.publication_date))
      return sortDesc ? cmp : -cmp
    })
    return copy
  }, [filteredRows, sortDesc])

  const handlePeriodFilterChange = useCallback((periodId) => {
    setPeriodFilter((prev) => (prev === periodId ? null : periodId))
  }, [])

  const openNotice = useCallback(
    (stem) => {
      onExpandNoticeChange?.(stem)
    },
    [onExpandNoticeChange],
  )

  const closeNotice = useCallback(() => {
    onExpandNoticeChange?.(null)
  }, [onExpandNoticeChange])

  const handleStreetSearch = useCallback((event, label) => {
    event.stopPropagation()
    setSearchText(label)
    searchInputRef.current?.focus()
  }, [])

  const handleRowKeyDown = useCallback(
    (event, stem) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openNotice(stem)
      }
    },
    [openNotice],
  )

  return (
    <div className="pending-dashboard-main gazettes-records-tab">
      <div className="pending-dashboard-layout">
        <aside className="pending-dashboard-aside" aria-label={t('periodStatsTitle')}>
          <NamingYearPeriodsPanel
            locale={locale}
            t={t}
            periodStats={periodStats}
            periodFilter={periodFilter}
            onPeriodFilterChange={handlePeriodFilterChange}
            subtitleKey="recordsGazettesPeriodSubtitle"
            hintKey={null}
          />
        </aside>

        <div className="pending-dashboard-main">
          <ActivePeriodFilterChip periodId={periodFilter} onClear={() => setPeriodFilter(null)} />
          <div className="pending-table-controls">
            <input
              ref={searchInputRef}
              type="search"
              className="pending-search-input"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t('recordsGazettesSearch')}
            />
            <button
              type="button"
              className="pending-filter-btn"
              onClick={() => setSortDesc((v) => !v)}
            >
              {sortDesc ? t('recordsGazettesSortNewest') : t('recordsGazettesSortOldest')}
            </button>
            <span>
              {t('recordsGazettesShowing', {
                shown: formatNumber(locale, sortedRows.length),
                total: formatNumber(locale, rows.length),
              })}
            </span>
          </div>

          {isLoading ? <p className="pending-dashboard-note">{t('loadingReport')}</p> : null}
          {!isLoading && error ? (
            <p className="pending-dashboard-note">{t(error)}</p>
          ) : null}

          {!isLoading && !error ? (
            <div className="gazettes-table-wrap">
              <table className="gazettes-table">
                <thead>
                  <tr>
                    <th scope="col" className="gazettes-col-notice">{t('recordsGazetteColNotice')}</th>
                    <th scope="col" className="gazettes-col-date">{t('recordsGazetteColDate')}</th>
                    <th scope="col" className="gazettes-col-streets">{t('recordsGazetteColStreets')}</th>
                    <th scope="col" className="gazettes-col-pdf">{t('recordsGazetteColPdf')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((notice) => {
                    const isSelected = openNoticeStem === notice.notice_stem
                    const pdfEn = resolvePdfUrl(notice.pdf_en)
                    const pdfZh = resolvePdfUrl(notice.pdf_zh)
                    const streetEntries = getNoticeStreetEntries(notice, locale)
                    const previewStreets = streetEntries.slice(0, STREET_NAME_PREVIEW_LIMIT)
                    const hiddenStreetCount = streetEntries.length - previewStreets.length
                    return (
                      <tr
                        key={notice.notice_stem}
                        className={isSelected ? 'gazette-row is-selected' : 'gazette-row'}
                        onClick={() => openNotice(notice.notice_stem)}
                        onKeyDown={(event) => handleRowKeyDown(event, notice.notice_stem)}
                        tabIndex={0}
                        aria-selected={isSelected}
                      >
                        <td className="gazette-notice-label">
                          {formatGnDisplayLabel(formatNoticeLabel(notice, locale))}
                        </td>
                        <td className="gazette-notice-date">
                          <time dateTime={notice.publication_date ?? undefined}>
                            {formatDisplayDate(notice.publication_date, { fallback: '—' })}
                          </time>
                        </td>
                        <td className="gazette-notice-streets">
                          {previewStreets.length === 0 ? (
                            '—'
                          ) : (
                            <>
                              {previewStreets.map((entry, index) => (
                                <span key={entry.key} className="gazette-notice-street">
                                  {index > 0 ? (
                                    <span className="gazette-notice-street-sep">, </span>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="gazette-notice-street-link"
                                    onClick={(event) => handleStreetSearch(event, entry.label)}
                                  >
                                    {entry.label}
                                  </button>
                                </span>
                              ))}
                              {hiddenStreetCount > 0 ? (
                                <span className="gazette-notice-streets-more">
                                  {t('recordsGazetteStreetsMore', { count: hiddenStreetCount })}
                                </span>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className="gazette-notice-pdfs">
                          {pdfEn ? (
                            <a
                              href={pdfEn}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={stopRowClick}
                            >
                              {t('recordsGazettePdfEn')}
                            </a>
                          ) : null}
                          {pdfZh ? (
                            <a
                              href={pdfZh}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={stopRowClick}
                            >
                              {t('recordsGazettePdfZh')}
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      <GazetteNoticeSheet
        notice={selectedNotice}
        noticeTitle={
          selectedNotice
            ? formatGnDisplayLabel(formatNoticeLabel(selectedNotice, locale))
            : ''
        }
        locale={locale}
        t={t}
        onClose={closeNotice}
      />
    </div>
  )
}

export default GazettesRecordsTab
