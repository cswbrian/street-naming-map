import { Route, Routes, Outlet, useLocation } from 'react-router-dom'
import MapPage from './pages/MapPage'
import NamesPage from './pages/NamesPage'
import AboutPage from './pages/AboutPage'
import { LocaleProvider } from './i18n/LocaleContext'
import { ThemeProvider } from './theme/ThemeContext'
import LocaleRedirect from './routes/LocaleRedirect'
import LegacyLocaleRedirect from './routes/LegacyLocaleRedirect'
import AppFooter from './components/AppFooter'
import './styles/app.css'

function AppShell() {
  const location = useLocation()
  const isDashboardPage = /\/(names|about)\/?$/.test(location.pathname)

  return (
    <main className={`app-shell ${isDashboardPage ? 'is-dashboard' : ''}`}>
      {isDashboardPage ? (
        <>
          <div className="app-dashboard-body">
            <Outlet />
          </div>
          <AppFooter />
        </>
      ) : (
        <Outlet />
      )}
    </main>
  )
}

function LocaleLayout() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <Outlet />
      </LocaleProvider>
    </ThemeProvider>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LocaleRedirect />} />
      <Route path="/names" element={<LegacyLocaleRedirect segment="names" />} />
      <Route path="/about" element={<LegacyLocaleRedirect segment="about" />} />
      <Route path="/contribute" element={<LegacyLocaleRedirect segment="names" />} />
      <Route path="/:locale" element={<LocaleLayout />}>
        <Route element={<AppShell />}>
          <Route index element={<MapPage />} />
          <Route path="names" element={<NamesPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="contribute" element={<LegacyLocaleRedirect segment="names" />} />
        </Route>
      </Route>
      <Route path="*" element={<LegacyLocaleRedirect />} />
    </Routes>
  )
}

export default App
