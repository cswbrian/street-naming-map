import { useState, useCallback } from 'react'
import StreetEventTimeline from './StreetEventTimeline.jsx'
import { trackContributeOpen, trackNoticeOpen, trackShareRoad } from '../lib/analytics.js'

const isSafeUrl = (url) => typeof url === 'string' && /^https?:\/\//i.test(url)

const EditIcon = () => (
  <svg className="selected-road-chip-contribute-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

const AddIcon = () => (
  <svg className="selected-road-chip-contribute-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M12 18v-6M9 15h6" />
  </svg>
)

const CloseIcon = () => (
  <svg className="selected-road-chip-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

const ShareIcon = () => (
  <svg className="selected-road-chip-share-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
  </svg>
)

function SelectedRoadChip({ selectedRoadInfo, labels, locale, t, onClose }) {
  const [shareCopied, setShareCopied] = useState(false)

  const safeContributeUrl = isSafeUrl(selectedRoadInfo.contributeUrl) ? selectedRoadInfo.contributeUrl : null
  const showTimeline =
    (selectedRoadInfo.nameHistory?.length ?? 0) > 0 || selectedRoadInfo.isNamingPending

  const handleContributeClick = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!safeContributeUrl) return
      trackContributeOpen('map', selectedRoadInfo.contributeVariant ?? 'add')
      window.open(safeContributeUrl, '_blank', 'noopener,noreferrer')
    },
    [safeContributeUrl, selectedRoadInfo.contributeVariant],
  )

  const handleNoticeClick = useCallback(() => {
    trackNoticeOpen('map')
  }, [])

  const handleShareClick = useCallback(
    async (e) => {
      e.preventDefault()
      e.stopPropagation()
      const url = selectedRoadInfo.shareUrl
      if (!url) return
      try {
        if (navigator.share) {
          await navigator.share({ url, title: selectedRoadInfo.enName || selectedRoadInfo.zhName || '' })
          trackShareRoad('native')
          return
        }
      } catch (error) {
        if (error?.name === 'AbortError') return
      }
      try {
        await navigator.clipboard.writeText(url)
        trackShareRoad('clipboard')
        setShareCopied(true)
        window.setTimeout(() => setShareCopied(false), 2000)
      } catch {
        // Clipboard unavailable — URL is still synced in the address bar.
      }
    },
    [selectedRoadInfo.shareUrl, selectedRoadInfo.enName, selectedRoadInfo.zhName],
  )

  const handleClose = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      onClose?.()
    },
    [onClose],
  )

  return (
    <>
      <div className="selected-road-chip-content">
        <header className="selected-road-chip-head">
          <div className="selected-road-chip-titles">
            {selectedRoadInfo.zhName && (
              <p className="selected-road-chip-zh">{selectedRoadInfo.zhName}</p>
            )}
            {selectedRoadInfo.enName && (
              <p className="selected-road-chip-en">{selectedRoadInfo.enName}</p>
            )}
            {selectedRoadInfo.streetType ? (
              <span className="selected-road-chip-type-chip">{selectedRoadInfo.streetType}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="selected-road-chip-close"
            aria-label={labels.mapRoadCardClose}
            onClick={handleClose}
          >
            <CloseIcon />
          </button>
        </header>

        {showTimeline && (
          <section className="selected-road-chip-timeline" aria-label={labels.colNameHistory}>
            <StreetEventTimeline
              items={selectedRoadInfo.nameHistory}
              variant="chip"
              locale={locale}
              t={t}
              onNoticeClick={handleNoticeClick}
            />
          </section>
        )}

        {selectedRoadInfo.namingRemarks?.length > 0 && (
          <section className="selected-road-chip-remarks-block" aria-labelledby="selected-road-chip-remarks-label">
            <h3 id="selected-road-chip-remarks-label" className="selected-road-chip-section-title">
              {labels.colRemarks}
            </h3>
            <ul className="selected-road-chip-remarks">
              {selectedRoadInfo.namingRemarks.map((remark, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={i}>{remark}</li>
              ))}
            </ul>
          </section>
        )}
        {(safeContributeUrl || selectedRoadInfo.shareUrl) && (
          <footer className="selected-road-chip-foot">
            <div className="selected-road-chip-actions">
              {safeContributeUrl && (
                <a
                  className="selected-road-chip-contribute"
                  href={safeContributeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleContributeClick}
                >
                  {selectedRoadInfo.contributeVariant === 'edit' ? <EditIcon /> : <AddIcon />}
                  <span>{selectedRoadInfo.contributeLabel}</span>
                </a>
              )}
              {selectedRoadInfo.shareUrl && (
                <button
                  type="button"
                  className={`selected-road-chip-share${shareCopied ? ' is-copied' : ''}`}
                  aria-label={shareCopied ? selectedRoadInfo.shareCopiedLabel : selectedRoadInfo.shareAriaLabel}
                  onClick={handleShareClick}
                >
                  <ShareIcon />
                  <span>{shareCopied ? selectedRoadInfo.shareCopiedLabel : selectedRoadInfo.shareLabel}</span>
                </button>
              )}
            </div>
          </footer>
        )}
      </div>
      <span className="selected-road-chip-pointer" aria-hidden="true" />
    </>
  )
}

export default SelectedRoadChip
