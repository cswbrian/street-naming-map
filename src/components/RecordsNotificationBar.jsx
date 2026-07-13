import { useLocale } from '../i18n/LocaleContext'
import NotificationBar from './NotificationBar.jsx'

function RecordsNotificationBar() {
  const { t } = useLocale()

  return (
    <NotificationBar
      lines={[
        {
          key: 'wip',
          content: t('recordsWipNotice'),
        },
      ]}
    />
  )
}

export default RecordsNotificationBar
