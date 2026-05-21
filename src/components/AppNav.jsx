import { NavLink } from 'react-router-dom'

function AppNav() {
  return (
    <nav className="app-top-nav" aria-label="Main">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `app-top-nav-link ${isActive ? 'is-active' : ''}`}
      >
        Map
      </NavLink>
      <NavLink
        to="/names"
        className={({ isActive }) => `app-top-nav-link ${isActive ? 'is-active' : ''}`}
      >
        Names
      </NavLink>
    </nav>
  )
}

export default AppNav
