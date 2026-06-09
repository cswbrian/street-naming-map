import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useLocale, useLocalePath } from '../i18n/LocaleContext'
import { useTheme } from '../theme/ThemeContext'
import { hasStreetName } from '../lib/roadKey'
import { hasNamingYear } from '../lib/submissionStatus.js'

import { loadPendingRoadsOnly } from '../lib/loadNamingRoads.js'

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function MenuIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  )
}

function ThemeToggleButton({ className = 'theme-toggle', showLabel = false, onActivate }) {
  const { theme, toggleTheme } = useTheme()
  const { t } = useLocale()
  const isLight = theme === 'light'

  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        event.stopPropagation()
        toggleTheme()
        onActivate?.()
      }}
      aria-label={isLight ? t('themeSwitchToDark') : t('themeSwitchToLight')}
    >
      {isLight ? <MoonIcon /> : <SunIcon />}
      {showLabel ? <span>{isLight ? t('themeDark') : t('themeLight')}</span> : null}
    </button>
  )
}

function LocaleToggleButton({ className = 'locale-toggle', showLabel = false, onActivate }) {
  const { locale, t, toggleLocale } = useLocale()

  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        event.stopPropagation()
        toggleLocale()
        onActivate?.()
      }}
      aria-label={t('langSwitchAria')}
    >
      {showLabel ? (
        <span>{locale === 'zh' ? t('langSwitchToEnLabel') : t('langSwitchToZh')}</span>
      ) : (
        (locale === 'zh' ? t('langSwitchToEn') : t('langSwitchToZh'))
      )}
    </button>
  )
}

function AppNav() {
  const { t } = useLocale()
  const mapPath = useLocalePath()
  const namesPath = useLocalePath('names')
  const aboutPath = useLocalePath('about')
  const timelinesPath = useLocalePath('timelines')
  const [pendingCount, setPendingCount] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    let mounted = true
    loadPendingRoadsOnly()
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

  useEffect(() => {
    if (!menuOpen) return undefined

    const closeMenu = (event) => {
      if (menuRef.current?.contains(event.target)) return
      setMenuOpen(false)
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('click', closeMenu)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', closeMenu)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

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
        <NavLink
          to={timelinesPath}
          className={({ isActive }) => `app-top-nav-link ${isActive ? 'is-active' : ''}`}
        >
          {t('navTimelines')}
        </NavLink>
        <NavLink
          to={aboutPath}
          className={({ isActive }) =>
            `app-top-nav-link app-top-nav-about ${isActive ? 'is-active' : ''}`
          }
        >
          {t('navAbout')}
        </NavLink>
      </nav>

      <div className="app-nav-desktop-controls">
        <ThemeToggleButton />
        <LocaleToggleButton />
      </div>

      <div className="app-nav-mobile-menu" ref={menuRef}>
        <button
          type="button"
          className="app-nav-menu-toggle"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={t('navMenuAria')}
          onClick={(event) => {
            event.stopPropagation()
            setMenuOpen((open) => !open)
          }}
        >
          <MenuIcon open={menuOpen} />
        </button>
        {menuOpen ? (
          <div className="app-nav-menu-panel" role="menu">
            <NavLink
              to={aboutPath}
              role="menuitem"
              className={({ isActive }) => `app-nav-menu-item app-nav-menu-link ${isActive ? 'is-active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              {t('navAbout')}
            </NavLink>
            <ThemeToggleButton
              className="app-nav-menu-item"
              showLabel
              onActivate={() => setMenuOpen(false)}
            />
            <LocaleToggleButton
              className="app-nav-menu-item"
              showLabel
              onActivate={() => setMenuOpen(false)}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default AppNav
