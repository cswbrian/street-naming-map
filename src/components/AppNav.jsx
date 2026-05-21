import { NavLink } from 'react-router-dom'
import { useLocale, useLocalePath } from '../i18n/LocaleContext'

function AppNav() {
  const { locale, t, toggleLocale } = useLocale()
  const mapPath = useLocalePath()
  const namesPath = useLocalePath('names')

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
