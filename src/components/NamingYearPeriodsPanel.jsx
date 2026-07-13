import { getPeriodLabel, PERIOD_GROUP_DEFS, getDecadeEraColors } from '../lib/periodGroups.js'
import { useTheme } from '../theme/ThemeContext'
import { useMobilePeriodCollapse } from '../hooks/useMobilePeriodCollapse.js'

const formatNumber = (locale, value) =>
  new Intl.NumberFormat(locale === 'zh' ? 'zh-HK' : 'en-US').format(Number(value) || 0)

export default function NamingYearPeriodsPanel({
  locale,
  t,
  periodStats,
  periodFilter,
  onPeriodFilterChange,
  subtitleKey = null,
  hintKey = 'periodStatsHint',
}) {
  const { theme } = useTheme()
  const eraColors = getDecadeEraColors(theme)
  const { isMobile, isOpen, toggle } = useMobilePeriodCollapse()

  const stats =
    periodStats ??
    PERIOD_GROUP_DEFS.map((group) => ({
      id: group.id,
      label: getPeriodLabel(group, locale),
      count: 0,
    }))

  const activeCount = periodFilter ? 1 : 0

  return (
    <section
      className={`pending-stats-section pending-stats-section--periods naming-year-periods-panel ${isOpen ? 'is-open' : 'is-collapsed'}`}
    >
      <div className="naming-year-periods-header">
        <div className="naming-year-periods-heading">
          <h2 className="pending-stats-title">{t('periodStatsTitle')}</h2>
          {subtitleKey ? <p className="naming-year-periods-subtitle">{t(subtitleKey)}</p> : null}
        </div>
        {isMobile ? (
          <button
            type="button"
            className="naming-year-periods-toggle"
            onClick={toggle}
            aria-expanded={isOpen}
            aria-controls="naming-year-periods-grid"
          >
            {isOpen ? t('periodFilterToggleCollapse') : t('periodFilterToggleExpand')}
            {activeCount && !isOpen ? (
              <span className="naming-year-periods-toggle-badge">{activeCount}</span>
            ) : null}
          </button>
        ) : null}
      </div>

      {hintKey && !isMobile ? <p className="pending-stats-hint">{t(hintKey)}</p> : null}

      <div id="naming-year-periods-grid" className="pending-stats-grid naming-year-periods-grid">
        {stats.map((item) => {
          const group = PERIOD_GROUP_DEFS.find((g) => g.id === item.id)
          const accentColor =
            group?.colorIndex != null && group.id !== 'unknown'
              ? eraColors[group.colorIndex]
              : null
          const isZero = Number(item.count) === 0
          return (
            <button
              type="button"
              key={`period-${item.id}`}
              className={`pending-stat-card naming-year-period-card ${periodFilter === item.id ? 'is-active' : ''} ${isZero ? 'is-zero' : ''}`}
              onClick={() => onPeriodFilterChange(item.id)}
              aria-pressed={periodFilter === item.id}
              style={accentColor ? { '--period-accent': accentColor } : undefined}
            >
              <h3>{item.label}</h3>
              <strong>{formatNumber(locale, item.count)}</strong>
            </button>
          )
        })}
      </div>
    </section>
  )
}
