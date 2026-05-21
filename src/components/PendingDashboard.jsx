import { useEffect, useMemo, useState } from 'react'

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
const ROAD_TYPE_BILINGUAL = {
  Highway: '公路 Highway',
  'Main Road': '主要道路 Main Road',
  'Secondary Road': '次要道路 Secondary Road',
  'Restricted Road': '限制道路 Restricted Road',
  Tunnel: '隧道 Tunnel',
  Track: '小徑 Track',
  'Unknown Type': '未知類型 Unknown Type',
}

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Number(value) || 0)
const formatNamingDate = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return null
  const match = text.match(/^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})$/)
  if (!match) return null
  const [, yyyy, mm, dd] = match
  return `${yyyy}.${String(mm).padStart(2, '0')}.${String(dd).padStart(2, '0')}`
}

const getNamingDisplay = (row) => {
  const date = formatNamingDate(row.naming_date)
  if (date) return date
  if (row.naming_year !== null && row.naming_year !== undefined && row.naming_year !== '') {
    return String(row.naming_year)
  }
  return 'Pending'
}

const getNamingSortValue = (row) => {
  const date = formatNamingDate(row.naming_date)
  if (date) return Number(date.replaceAll('.', ''))
  const year = Number(row.naming_year)
  if (Number.isFinite(year)) return year * 10000 + 101
  return -1
}

const PERIOD_GROUPS = [
  { id: 'g1', label: '1842-1898', start: 1842, end: 1898 },
  { id: 'g2', label: '1899-1945', start: 1899, end: 1945 },
  { id: 'g3', label: '1946-1969', start: 1946, end: 1969 },
  { id: 'g4', label: '1970-1989', start: 1970, end: 1989 },
  { id: 'g5', label: '1990-2009', start: 1990, end: 2009 },
  { id: 'g6', label: '2010-Now', start: 2010, end: Number.POSITIVE_INFINITY },
  { id: 'unknown', label: '未知 Unknown', start: null, end: null },
]

function PendingDashboard({ onOpenMobileMenu }) {
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
        if (mounted) setError('Street directory report not found. Run npm run report:pending-years first.')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    loadReport()
    return () => {
      mounted = false
    }
  }, [])

  const rows = Array.isArray(report?.roads) ? report.roads : []
  const loweredQuery = searchText.trim().toLowerCase()

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
    const getYear = (row) => getNamingSortValue(row)
    const getNotice = (row) => {
      const zh = String(row.naming_details?.government_notice_label_zh || '')
      const en = String(row.naming_details?.government_notice_label_en || '')
      return `${zh} ${en}`.trim().toLowerCase()
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
  }, [filteredRows, sortConfig])

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
    const counts = new Map(PERIOD_GROUPS.map((group) => [group.id, 0]))
    rows.forEach((row) => {
      const year = Number(row.naming_year)
      if (!Number.isFinite(year)) {
        counts.set('unknown', (counts.get('unknown') ?? 0) + 1)
        return
      }
      const matched =
        PERIOD_GROUPS.find(
          (group) =>
            group.id !== 'unknown' &&
            year >= Number(group.start) &&
            year <= Number(group.end),
        )?.id ?? 'unknown'
      counts.set(matched, (counts.get(matched) ?? 0) + 1)
    })
    return PERIOD_GROUPS.map((group) => ({
      label: group.label,
      count: counts.get(group.id) ?? 0,
    }))
  }, [rows])

  return (
    <section className="pending-dashboard">
      <header className="pending-dashboard-header">
        <button
          type="button"
          className="mobile-nav-trigger mobile-nav-trigger-dashboard"
          aria-label="Open navigation menu"
          onClick={() => onOpenMobileMenu?.()}
        >
          ☰
        </button>
        <h1>Street Naming Directory</h1>
        <p>Full street list with naming date and gazette notice links (self-hosted PDFs for eGazette-mapped streets).</p>
      </header>

      {isLoading ? <p className="pending-dashboard-note">Loading report...</p> : null}
      {!isLoading && error ? <p className="pending-dashboard-note">{error}</p> : null}

      {!isLoading && !error && report ? (
        <>
          <section className="pending-stats-section">
            <h2 className="pending-stats-title">道路類型 Road Types</h2>
            <div className="pending-stats-grid">
              {roadTypeStats.map((item) => (
                <article className="pending-stat-card" key={`type-${item.label}`}>
                  <h3>{ROAD_TYPE_BILINGUAL[item.label] ?? item.label}</h3>
                  <strong>{formatNumber(item.count)}</strong>
                </article>
              ))}
            </div>
          </section>

          <section className="pending-stats-section">
            <h2 className="pending-stats-title">Naming Year Periods (Legend Grouping)</h2>
            <div className="pending-stats-grid">
              {periodStats.map((item) => (
                <article className="pending-stat-card" key={`period-${item.label}`}>
                  <h3>{item.label}</h3>
                  <strong>{formatNumber(item.count)}</strong>
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
              placeholder="Search by street code/name/type/year/date"
            />
            <span>
              Showing {formatNumber(filteredRows.length)} / {formatNumber(rows.length)} streets
            </span>
          </div>

          <div className="pending-table-wrap">
            <table className="pending-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="pending-sort-header" onClick={() => toggleSort('street')}>
                      Street name
                      <span>{sortConfig.key === 'street' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" className="pending-sort-header" onClick={() => toggleSort('type')}>
                      Type
                      <span>{sortConfig.key === 'type' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" className="pending-sort-header" onClick={() => toggleSort('year')}>
                      Naming Date
                      <span>{sortConfig.key === 'year' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" className="pending-sort-header" onClick={() => toggleSort('notice')}>
                      Gazette notice
                      <span>{sortConfig.key === 'notice' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.slice(0, 500).map((row) => (
                  <tr key={row.road_key}>
                    <td>{`${row.chinese_name || ''} ${row.english_name || ''}`.trim() || '-'}</td>
                    <td>{row.street_type || '-'}</td>
                    <td>{getNamingDisplay(row)}</td>
                    <td>
                      {row.naming_details?.government_notice_url_en ||
                      row.naming_details?.government_notice_url_zh ? (
                        <span className="pending-notice-links">
                          {row.naming_details?.government_notice_url_zh ? (
                            <a
                              href={row.naming_details.government_notice_url_zh}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {row.naming_details?.notice_source === 'egazette_pdf'
                                ? '中文 PDF'
                                : row.naming_details.government_notice_label_zh || '第?號'}
                            </a>
                          ) : null}
                          {row.naming_details?.government_notice_url_zh &&
                          row.naming_details?.government_notice_url_en ? (
                            <span className="pending-notice-sep"> · </span>
                          ) : null}
                          {row.naming_details?.government_notice_url_en ? (
                            <a
                              href={row.naming_details.government_notice_url_en}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {row.naming_details?.notice_source === 'egazette_pdf'
                                ? 'EN PDF'
                                : row.naming_details.government_notice_label_en || 'G.N.?'}
                            </a>
                          ) : null}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sortedRows.length > 500 ? (
            <p className="pending-dashboard-note">
              Showing first 500 rows. Narrow search to inspect specific roads.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

export default PendingDashboard
