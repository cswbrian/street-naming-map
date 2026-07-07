import { getPeriodLabel, PERIOD_GROUP_DEFS } from '../i18n/translations'

const formatNumber = (locale, value) =>
  new Intl.NumberFormat(locale === 'zh' ? 'zh-HK' : 'en-US').format(Number(value) || 0)

export default function NamingYearPeriodsPanel({
  locale,
  t,
  periodStats,
  periodFilter,
  onPeriodFilterChange,
  hintKey = 'periodStatsHint',
}) {
  const stats =
    periodStats ??
    PERIOD_GROUP_DEFS.map((group) => ({
      id: group.id,
      label: getPeriodLabel(group, locale),
      count: 0,
    }))

  return (
    <section className="pending-stats-section pending-stats-section--periods">
      <h2 className="pending-stats-title">{t('periodStatsTitle')}</h2>
      {hintKey ? <p className="pending-stats-hint">{t(hintKey)}</p> : null}
      <div className="pending-stats-grid">
        {stats.map((item) => (
          <button
            type="button"
            key={`period-${item.id}`}
            className={`pending-stat-card ${periodFilter === item.id ? 'is-active' : ''}`}
            onClick={() => onPeriodFilterChange(item.id)}
            aria-pressed={periodFilter === item.id}
          >
            <h3>{item.label}</h3>
            <strong>{formatNumber(locale, item.count)}</strong>
          </button>
        ))}
      </div>
    </section>
  )
}
