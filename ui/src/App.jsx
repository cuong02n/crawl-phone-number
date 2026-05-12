import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, Briefcase, Database, Settings } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Jobs from './pages/Jobs'
import Explorer from './pages/Explorer'
import SettingsPage from './pages/Settings'
import './index.css'

const NAV = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jobs',     icon: Briefcase,       label: 'Jobs'      },
  { to: '/explorer', icon: Database,        label: 'Explorer'  },
  { to: '/settings', icon: Settings,        label: 'Settings'  },
]

export default function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <aside className="sidebar">
          <div className="logo">📱 <span>Sim</span>Crawler</div>
          <nav>
            {NAV.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="content">
          <Routes>
            <Route path="/"         element={<Dashboard />}    />
            <Route path="/jobs"     element={<Jobs />}         />
            <Route path="/explorer" element={<Explorer />}     />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
