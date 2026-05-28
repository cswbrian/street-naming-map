import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  applyDocumentTheme,
  getPreferredTheme,
  getSystemTheme,
  hasStoredThemePreference,
  persistThemePreference,
} from './theme.js'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const initial = getPreferredTheme()
    applyDocumentTheme(initial)
    return initial
  })

  useEffect(() => {
    applyDocumentTheme(theme)
  }, [theme])

  useEffect(() => {
    if (hasStoredThemePreference()) return undefined

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (hasStoredThemePreference()) return
      setThemeState(getSystemTheme())
    }

    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const setTheme = (nextTheme) => {
    if (nextTheme !== 'light' && nextTheme !== 'dark') return
    persistThemePreference(nextTheme)
    setThemeState(nextTheme)
  }

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      isLight: theme === 'light',
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
