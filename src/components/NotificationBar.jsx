import { useEffect, useState } from 'react'

const DEFAULT_ROTATION_MS = 3000

function NotificationBar({ lines, rotate = false, rotationMs = DEFAULT_ROTATION_MS }) {
  const messageLines = lines ?? []
  const [index, setIndex] = useState(0)
  const shouldRotate = rotate && messageLines.length > 1

  useEffect(() => {
    if (!shouldRotate) return undefined
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % messageLines.length)
    }, rotationMs)
    return () => window.clearInterval(id)
  }, [messageLines.length, rotationMs, shouldRotate])

  if (!messageLines.length) return null

  return (
    <div className="names-notification-bar" role="status" aria-live="polite">
      <div className="names-notification-bar-inner">
        {messageLines.map((line, lineIndex) => (
          <p
            key={line.key ?? lineIndex}
            className={`names-notification-bar-line${!shouldRotate || lineIndex === index ? ' is-active' : ''}`}
            aria-hidden={shouldRotate ? lineIndex !== index : false}
          >
            {line.content}
          </p>
        ))}
      </div>
    </div>
  )
}

export default NotificationBar
