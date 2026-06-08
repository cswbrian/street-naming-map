import { useEffect, useId, useRef } from 'react'

function MapBottomSheet({ isOpen, title, closeLabel, onClose, children }) {
  const titleId = useId()
  const sheetRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined

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
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="map-bottom-sheet-root" role="presentation">
      <button
        type="button"
        className="map-bottom-sheet-backdrop"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <section
        ref={sheetRef}
        className="map-bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="map-bottom-sheet-header">
          <h2 id={titleId} className="map-bottom-sheet-title">
            {title}
          </h2>
          <button type="button" className="map-bottom-sheet-close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="map-bottom-sheet-body">{children}</div>
      </section>
    </div>
  )
}

export default MapBottomSheet
