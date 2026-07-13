import { useLocale } from '../i18n/LocaleContext'
import { LAZY_BATCH_FORM_URL } from '../config/contribute.js'
import { trackContributeOpen } from '../lib/analytics.js'
import NotificationBar from './NotificationBar.jsx'

function NamesNotificationBar() {
  const { t } = useLocale()

  return (
    <NotificationBar
      rotate
      lines={[
        {
          key: 'batch',
          content: (
            <>
              <a
                href={LAZY_BATCH_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackContributeOpen('names_batch_bar', 'batch')}
              >
                {t('namesBatchBarLink')}
              </a>
              {t('namesBatchBarSuffix')}
            </>
          ),
        },
        {
          key: 'post2000',
          content: t('namesNoPost2000Intake'),
        },
      ]}
    />
  )
}

export default NamesNotificationBar
