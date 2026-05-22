import { useEffect, useMemo, useState } from 'react'
import { useLocale } from '../i18n/LocaleContext'
import { getRoadTypeLabel, PERIOD_GROUP_DEFS } from '../i18n/translations'
import { hasStreetName } from '../lib/roadKey'

const DATA_URL = `${import.meta.env.BASE_URL}data/master/pending-naming-years.json`
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

const formatNamingDate = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return null
  const match = text.match(/^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})$/)
  if (!match) return null
  const [, yyyy, mm, dd] = match
  return `${yyyy}.${String(mm).padStart(2, '0')}.${String(dd).padStart(2, '0')}`
}

const getNoticeLink = (row, locale) => {
  const zhUrl = row.naming_details?.government_notice_url_zh
  const enUrl = row.naming_details?.government_notice_url_en
  const zhLabel = row.naming_details?.government_notice_label_zh || '第?號'
  const enLabel = row.naming_details?.government_notice_label_en || 'G.N.?'
  if (locale === 'zh') {
    if (zhUrl) return { url: zhUrl, label: zhLabel }
    if (enUrl) return { url: enUrl, label: enLabel }
  } else {
    if (enUrl) return { url: enUrl, label: enLabel }
    if (zhUrl) return { url: zhUrl, label: zhLabel }
  }
  return null
}

function PendingDashboard({ onOpenRoadOnMap }) {
  const { locale, t, formatStreetName } = useLocale()
  const [report, setReport] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [error, setError] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: 'year', direction: 'desc' })

  useEffect(() => {
    let mounted = true

    const loadReport = async () => {
      try {
        setError('')
        const response = await fetch(DATA_URL)
        if (!response.ok) throw new Error('Unable to load street directory report')
        const data = await response.json()
        if (mounted) setReport(data)
      } catch {
        if (mounted) setError('reportError')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    loadReport()
    return () => {
      mounted = false
    }
  }, [])

  const rows = useMemo(() => {
    const allRows = Array.isArray(report?.roads) ? report.roads : []
    return allRows.filter((row) => hasStreetName(row.english_name, row.chinese_name))
  }, [report?.roads])
  const loweredQuery = searchText.trim().toLowerCase()

  const getNamingDisplay = (row) => {
    const date = formatNamingDate(row.naming_date)
    if (date) return date
    if (row.naming_year !== null && row.naming_year !== undefined && row.naming_year !== '') {
      return String(row.naming_year)
    }
    return t('pending')
  }

  const filteredRows = useMemo(() => {
    if (!loweredQuery) return rows
    return rows.filter((row) => {
      const haystack =
        `${row.street_code ?? ''} ${row.english_name ?? ''} ${row.chinese_name ?? ''} ${row.street_type ?? ''} ${row.naming_year ?? ''} ${row.naming_date ?? ''}`.toLowerCase()
      return haystack.includes(loweredQuery)
    })
  }, [rows, loweredQuery])

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
      const link = getNoticeLink(row, locale)
      return (link?.label ?? '').toLowerCase()
    }

    const getComparableValue = (row, key) => {
      if (key === 'street') return getStreetName(row)
      if (key === 'type') return getType(row)
      if (key === 'year') return getYear(row)
      return getNotice(row)
    }

    const sign = sortConfig.direction === 'asc' ? 1 : -1
    return [...filteredRows].sort((a, b) => {
      const aValue = getComparableValue(a, sortConfig.key)
      const bValue = getComparableValue(b, sortConfig.key)
      if (aValue < bValue) return -1 * sign
      if (aValue > bValue) return 1 * sign
      return getStreetName(a).localeCompare(getStreetName(b))
    })
  }, [filteredRows, sortConfig, locale])

  const toggleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        }
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

  const periodStats = useMemo(() => {
    const counts = new Map(PERIOD_GROUP_DEFS.map((group) => [group.id, 0]))
    rows.forEach((row) => {
      const year = Number(row.naming_year)
      if (!Number.isFinite(year)) {
        counts.set('unknown', (counts.get('unknown') ?? 0) + 1)
        return
      }
      const matched =
        PERIOD_GROUP_DEFS.find(
          (group) =>
            group.id !== 'unknown' &&
            year >= Number(group.start) &&
            year <= Number(group.end),
        )?.id ?? 'unknown'
      counts.set(matched, (counts.get(matched) ?? 0) + 1)
    })
    return PERIOD_GROUP_DEFS.map((group) => ({
      label: t(group.rangeKey),
      count: counts.get(group.id) ?? 0,
    }))
  }, [rows, t])

  return (
    <section className="pending-dashboard">
      <header className="pending-dashboard-header">
        <h1>{t('namesTitle')}</h1>
        <p>{t('namesDescription')}</p>
      </header>

      {isLoading ? <p className="pending-dashboard-note">{t('loadingReport')}</p> : null}
      {!isLoading && error ? (
        <p className="pending-dashboard-note">{error === 'reportError' ? t('reportError') : error}</p>
      ) : null}

      {!isLoading && !error && report ? (
        <>
          <section className="pending-stats-section">
            <h2 className="pending-stats-title">{t('roadTypesTitle')}</h2>
            <div className="pending-stats-grid">
              {roadTypeStats.map((item) => (
                <article className="pending-stat-card" key={`type-${item.label}`}>
                  <h3>{getRoadTypeLabel(locale, item.label)}</h3>
                  <strong>{formatNumber(locale, item.count)}</strong>
                </article>
              ))}
            </div>
          </section>

          <section className="pending-stats-section">
            <h2 className="pending-stats-title">{t('periodStatsTitle')}</h2>
            <div className="pending-stats-grid">
              {periodStats.map((item) => (
                <article className="pending-stat-card" key={`period-${item.label}`}>
                  <h3>{item.label}</h3>
                  <strong>{formatNumber(locale, item.count)}</strong>
                </article>
              ))}
            </div>
          </section>

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

          <div className="pending-table-wrap">
            <table className="pending-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="pending-sort-header" onClick={() => toggleSort('street')}>
                      {t('colStreet')}
                      <span>{sortConfig.key === 'street' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  </th>
                  <th>
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
                  <th>
                    <button type="button" className="pending-sort-header" onClick={() => toggleSort('notice')}>
                      {t('colNotice')}
                      <span>{sortConfig.key === 'notice' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.slice(0, 500).map((row) => {
                  const streetLabel = formatStreetName(row.chinese_name, row.english_name)
                  const canOpenOnMap = Boolean(onOpenRoadOnMap && row.english_name && row.chinese_name)
                  const notice = getNoticeLink(row, locale)

                  return (
                    <tr key={row.road_key}>
                      <td>
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
                            {streetLabel}
                          </button>
                        ) : (
                          streetLabel
                        )}
                      </td>
                      <td>{getRoadTypeLabel(locale, row.street_type) || '-'}</td>
                      <td>{getNamingDisplay(row)}</td>
                      <td>
                        {notice ? (
                          <a href={notice.url} target="_blank" rel="noreferrer">
                            {notice.label}
                          </a>
                        ) : (
                          '-'
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
        </>
      ) : null}
    </section>
  )
}

export default PendingDashboard
