import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useLocale, useLocalePath } from '../i18n/LocaleContext'
import { hasStreetName } from '../lib/roadKey'
import { hasNamingYear } from '../lib/submissionStatus.js'

const PENDING_URL = `${import.meta.env.BASE_URL}data/master/pending-naming-years.json`

function AppNav() {
  const { locale, t, toggleLocale } = useLocale()
  const mapPath = useLocalePath()
  const namesPath = useLocalePath('names')
  const [pendingCount, setPendingCount] = useState(null)

  useEffect(() => {
    let mounted = true
    fetch(PENDING_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted || !Array.isArray(data?.roads)) return
        const pending = data.roads.filter(
          (row) => hasStreetName(row.english_name, row.chinese_name) && !hasNamingYear(row),
        ).length
        setPendingCount(pending)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="app-top-nav-row">
      <nav className="app-top-nav" aria-label="Main">
        <NavLink
          to={mapPath}
          end
          className={({ isActive }) => `app-top-nav-link ${isActive ? 'is-active' : ''}`}
        >
          {t('navMap')}
        </NavLink>
        <NavLink
          to={namesPath}
          className={({ isActive }) => `app-top-nav-link ${isActive ? 'is-active' : ''}`}
        >
          {t('navNames')}
          {pendingCount != null ? (
            <span className="app-nav-pending-pill">{pendingCount > 9999 ? '9k+' : pendingCount}</span>
          ) : null}
        </NavLink>
      </nav>
      <button
        type="button"
        className="locale-toggle"
        onClick={(event) => {
          event.stopPropagation()
          toggleLocale()
        }}
        aria-label={t('langSwitchAria')}
      >
        {locale === 'zh' ? t('langSwitchToEn') : t('langSwitchToZh')}
      </button>
    </div>
  )
}

export default AppNav
