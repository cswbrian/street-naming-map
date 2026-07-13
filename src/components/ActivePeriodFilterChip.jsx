import { useLocale } from '../i18n/LocaleContext'
import { getPeriodLabelForId } from '../lib/periodFilterUi.js'

export default function ActivePeriodFilterChip({ periodId, onClear }) {
  const { locale, t } = useLocale()
  if (!periodId) return null

  const label = getPeriodLabelForId(periodId, locale)

  return (
    <div className="period-filter-active-row">
      <span className="period-filter-chip">
        <span className="period-filter-chip-label">{t('periodFilterActive', { period: label })}</span>
        <button
          type="button"
          className="period-filter-chip-clear"
          onClick={onClear}
          aria-label={t('periodFilterClear')}
        >
          ×
        </button>
      </span>
    </div>
  )
}
