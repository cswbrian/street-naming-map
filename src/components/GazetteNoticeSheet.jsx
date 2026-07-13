import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { loadCorpusMarkdown } from '../lib/loadGazetteNotices.js'
import { CorpusMarkdownBody } from '../lib/corpusMarkdown.jsx'
import { buildStreetPagePath } from '../lib/streetPageUrl.js'
import { formatDisplayDate } from '../lib/namingDisplay.js'

function resolvePdfUrl(path) {
  if (!path) return null
  if (path.startsWith('http')) return path
  return path.startsWith('/') ? path : `/${path}`
}

function GazetteSheetPdfLinks({ pdfEn, pdfZh, t, className = '' }) {
  if (!pdfEn && !pdfZh) return null
  return (
    <div className={`gazette-sheet-pdf-bar ${className}`.trim()}>
      {pdfEn ? (
        <a
          href={pdfEn}
          target="_blank"
          rel="noopener noreferrer"
          className="gazette-sheet-pdf-btn"
        >
          {t('recordsGazettePdfEn')}
        </a>
      ) : null}
      {pdfZh ? (
        <a
          href={pdfZh}
          target="_blank"
          rel="noopener noreferrer"
          className="gazette-sheet-pdf-btn"
        >
          {t('recordsGazettePdfZh')}
        </a>
      ) : null}
    </div>
  )
}

function GazetteNoticeDetail({ notice, locale, t }) {
  const [markdown, setMarkdown] = useState('')
  const [loadState, setLoadState] = useState('loading')

  useEffect(() => {
    let mounted = true
    loadCorpusMarkdown(notice.notice_stem)
      .then((text) => {
        if (!mounted) return
        setMarkdown(text)
        setLoadState('ready')
      })
      .catch(() => {
        if (!mounted) return
        setLoadState('missing')
      })
    return () => {
      mounted = false
    }
  }, [notice.notice_stem])

  const draftRows = notice.streets_draft ?? []
  const linkedCount = notice.linked_street_count ?? 0

  return (
    <div className="gazette-notice-detail">
      <p className="gazette-ocr-disclaimer" role="note">
        {t('recordsOcrDisclaimer')}
      </p>

      {draftRows.length > 0 ? (
        <div className="gazette-expand-streets">
          <h3 className="gazette-expand-streets-title">{t('recordsGazetteStreetsTitle')}</h3>
          <ul className="gazette-expand-streets-list">
            {draftRows.map((row) => {
              const label =
                locale === 'zh' && row.street_name_zh
                  ? row.street_name_zh
                  : row.street_name_en || row.street_name_zh || '—'
              const sub = locale === 'zh' ? row.street_name_en : row.street_name_zh
              return (
                <li key={`${row.row_index}-${label}`}>
                  {row.page_id ? (
                    <Link to={buildStreetPagePath(locale, row.page_id)} className="gazette-street-link">
                      {label}
                    </Link>
                  ) : (
                    <span>{label}</span>
                  )}
                  {sub ? <span className="gazette-street-sub">{sub}</span> : null}
                </li>
              )
            })}
          </ul>
          <p className="gazette-expand-streets-meta">
            {t('recordsGazetteStreetCounts', {
              draft: draftRows.length,
              linked: linkedCount,
            })}
          </p>
        </div>
      ) : null}

      {loadState === 'loading' ? (
        <p className="pending-dashboard-note">{t('recordsCorpusLoading')}</p>
      ) : null}
      {loadState === 'missing' ? (
        <p className="pending-dashboard-note">{t('recordsCorpusMissing')}</p>
      ) : null}
      {loadState === 'ready' && markdown ? <CorpusMarkdownBody markdown={markdown} /> : null}
    </div>
  )
}

function GazetteNoticeSheet({ notice, noticeTitle, locale, t, onClose }) {
  const titleId = useId()
  const sheetRef = useRef(null)
  const pdfEn = resolvePdfUrl(notice?.pdf_en)
  const pdfZh = resolvePdfUrl(notice?.pdf_zh)

  useEffect(() => {
    if (!notice) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', handleKeyDown)
    sheetRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [notice, onClose])

  if (!notice) return null

  const sheet = (
    <div className="gazette-sheet-root" role="presentation">
      <button
        type="button"
        className="gazette-sheet-backdrop"
        aria-label={t('recordsGazetteClose')}
        onClick={onClose}
      />
      <section
        ref={sheetRef}
        className="gazette-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="gazette-sheet-header">
          <div className="gazette-sheet-header-top">
            <div className="gazette-sheet-heading">
              <h2 id={titleId} className="gazette-sheet-title">
                {noticeTitle}
              </h2>
              {notice.publication_date ? (
                <time className="gazette-sheet-date" dateTime={notice.publication_date}>
                  {formatDisplayDate(notice.publication_date)}
                </time>
              ) : null}
            </div>
            <button
              type="button"
              className="gazette-sheet-close"
              onClick={onClose}
              aria-label={t('recordsGazetteClose')}
            >
              ×
            </button>
          </div>
          <GazetteSheetPdfLinks pdfEn={pdfEn} pdfZh={pdfZh} t={t} />
        </header>
        <div className="gazette-sheet-body">
          <GazetteNoticeDetail key={notice.notice_stem} notice={notice} locale={locale} t={t} />
        </div>
      </section>
    </div>
  )

  return createPortal(sheet, document.body)
}

export default GazetteNoticeSheet
