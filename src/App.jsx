import { Route, Routes, useLocation } from 'react-router-dom'
import MapPage from './pages/MapPage'
import NamesPage from './pages/NamesPage'
import './styles/app.css'

function App() {
  const location = useLocation()
  const isNamesPage = location.pathname.endsWith('/names')

  return (
    <main className={`app-shell ${isNamesPage ? 'is-dashboard' : ''}`}>
      <Routes>
        <Route path="/" element={<MapPage />} />
        <Route path="/names" element={<NamesPage />} />
      </Routes>
    </main>
  )
}

export default App
