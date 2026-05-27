import { Route, Routes, Outlet, useLocation } from 'react-router-dom'
import MapPage from './pages/MapPage'
import NamesPage from './pages/NamesPage'
import { LocaleProvider } from './i18n/LocaleContext'
import LocaleRedirect from './routes/LocaleRedirect'
import LegacyLocaleRedirect from './routes/LegacyLocaleRedirect'
import './styles/app.css'

function AppShell() {
  const location = useLocation()
  const isDashboardPage = /\/names\/?$/.test(location.pathname)

  return (
    <main className={`app-shell ${isDashboardPage ? 'is-dashboard' : ''}`}>
      <Outlet />
    </main>
  )
}

function LocaleLayout() {
  return (
    <LocaleProvider>
      <Outlet />
    </LocaleProvider>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LocaleRedirect />} />
      <Route path="/names" element={<LegacyLocaleRedirect segment="names" />} />
      <Route path="/contribute" element={<LegacyLocaleRedirect segment="names" />} />
      <Route path="/:locale" element={<LocaleLayout />}>
        <Route element={<AppShell />}>
          <Route index element={<MapPage />} />
          <Route path="names" element={<NamesPage />} />
          <Route path="contribute" element={<LegacyLocaleRedirect segment="names" />} />
        </Route>
      </Route>
      <Route path="*" element={<LegacyLocaleRedirect />} />
    </Routes>
  )
}

export default App
