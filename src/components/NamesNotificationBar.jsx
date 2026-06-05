import { useEffect, useState } from 'react'
import { useLocale } from '../i18n/LocaleContext'
import { LAZY_BATCH_FORM_URL } from '../config/contribute.js'
import { trackContributeOpen } from '../lib/analytics.js'

const ROTATION_MS = 3000
const MESSAGE_COUNT = 2

function NamesNotificationBar() {
  const { t } = useLocale()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % MESSAGE_COUNT)
    }, ROTATION_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="names-notification-bar" role="status" aria-live="polite">
      <div className="names-notification-bar-inner">
        <p
          className={`names-notification-bar-line${index === 0 ? ' is-active' : ''}`}
          aria-hidden={index !== 0}
        >
          <a
            href={LAZY_BATCH_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackContributeOpen('names_batch_bar', 'batch')}
          >
            {t('namesBatchBarLink')}
          </a>
          {t('namesBatchBarSuffix')}
        </p>
        <p
          className={`names-notification-bar-line${index === 1 ? ' is-active' : ''}`}
          aria-hidden={index !== 1}
        >
          {t('namesNoPost2000Intake')}
        </p>
      </div>
    </div>
  )
}

export default NamesNotificationBar
