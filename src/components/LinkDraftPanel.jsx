import { useMemo, useState } from 'react'
import { useLocale } from '../i18n/LocaleContext'
import { loadNamingRoads } from '../lib/loadNamingRoads.js'
import { buildLinkDraftPayload, downloadLinkDraftJson } from '../lib/linkQueueDraft.js'

function normalizeHaystack(road) {
  return [
    road.street_code,
    road.english_name,
    road.chinese_name,
    road.road_key,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function LinkDraftPanel({ selectedRows, onClearSelection }) {
  const { t } = useLocale()
  const [streetCode, setStreetCode] = useState('')
  const [centrelineQuery, setCentrelineQuery] = useState('')
  const [centrelineRoads, setCentrelineRoads] = useState(null)
  const [centrelineError, setCentrelineError] = useState(false)

  const loweredCentrelineQuery = centrelineQuery.trim().toLowerCase()

  const centrelineMatches = useMemo(() => {
    if (!centrelineRoads || !loweredCentrelineQuery) return []
    return centrelineRoads
      .filter((road) => normalizeHaystack(road).includes(loweredCentrelineQuery))
      .slice(0, 8)
  }, [centrelineRoads, loweredCentrelineQuery])

  const ensureCentrelineRoads = async () => {
    if (centrelineRoads) return
    try {
      const data = await loadNamingRoads()
      const roads = [...(data.verifiedRoads ?? []), ...(data.pendingRoads ?? [])]
      const byCode = new Map()
      for (const road of roads) {
        const code = String(road.street_code ?? '').trim()
        if (!code || byCode.has(code)) continue
        byCode.set(code, road)
      }
      setCentrelineRoads([...byCode.values()])
      setCentrelineError(false)
    } catch {
      setCentrelineError(true)
    }
  }

  const handleDownload = () => {
    const payload = buildLinkDraftPayload({ streetCode, eventRows: selectedRows })
    if (!payload) return
    downloadLinkDraftJson(payload)
  }

  if (!selectedRows.length) return null

  return (
    <aside className="link-draft-panel" aria-label={t('linkQueueDraftTitle')}>
      <h2 className="link-draft-title">{t('linkQueueDraftTitle')}</h2>
      <p className="link-draft-count">
        {t('linkQueueDraftSelected', { count: selectedRows.length })}
      </p>

      <label className="link-draft-field">
        <span>{t('linkQueueDraftStreetCode')}</span>
        <input
          type="text"
          inputMode="numeric"
          className="pending-search-input"
          value={streetCode}
          onChange={(event) => setStreetCode(event.target.value.replace(/\D/g, ''))}
          placeholder={t('linkQueueDraftStreetCodePlaceholder')}
        />
      </label>

      <label className="link-draft-field">
        <span>{t('linkQueueDraftCentrelineSearch')}</span>
        <input
          type="text"
          className="pending-search-input"
          value={centrelineQuery}
          onFocus={() => {
            ensureCentrelineRoads()
          }}
          onChange={(event) => {
            setCentrelineQuery(event.target.value)
            ensureCentrelineRoads()
          }}
          placeholder={t('linkQueueDraftCentrelinePlaceholder')}
        />
      </label>

      {centrelineError ? (
        <p className="pending-dashboard-note">{t('linkQueueDraftCentrelineError')}</p>
      ) : null}

      {centrelineMatches.length ? (
        <ul className="link-draft-centreline-list">
          {centrelineMatches.map((road) => (
            <li key={road.street_code}>
              <button
                type="button"
                className="link-draft-centreline-btn"
                onClick={() => {
                  setStreetCode(String(road.street_code))
                  setCentrelineQuery('')
                }}
              >
                <strong>{road.chinese_name || road.english_name}</strong>
                <span>
                  {road.english_name}
                  {road.street_code ? ` · ${road.street_code}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="link-draft-actions">
        <button
          type="button"
          className="link-draft-download-btn"
          disabled={!String(streetCode).trim()}
          onClick={handleDownload}
        >
          {t('linkQueueDraftDownload')}
        </button>
        <button type="button" className="link-queue-copy-btn" onClick={onClearSelection}>
          {t('linkQueueDraftClear')}
        </button>
      </div>
      <p className="link-draft-hint">{t('linkQueueDraftHint')}</p>
    </aside>
  )
}

export default LinkDraftPanel
