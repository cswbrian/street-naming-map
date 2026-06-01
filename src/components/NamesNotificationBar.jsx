import { useLocale } from '../i18n/LocaleContext'
import { LAZY_BATCH_FORM_URL } from '../config/contribute.js'
import { trackContributeOpen } from '../lib/analytics.js'

function NamesNotificationBar() {
  const { t } = useLocale()

  return (
    <div className="names-notification-bar" role="status">
      <p className="names-notification-bar-line">
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
    </div>
  )
}

export default NamesNotificationBar
