import { useState, useCallback } from 'react'
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import Home from './pages/Home'
import History from './pages/History'

function Nav() {
  const base = 'px-4 py-2 rounded-full text-sm font-medium transition-colors'
  return (
    <nav className="flex gap-2 mb-6">
      <NavLink to="/" end className={({ isActive }) =>
        `${base} ${isActive ? 'bg-brand text-white' : 'bg-white dark:bg-surface-card-dark text-ink-secondary border border-gray-200 dark:border-gray-700'}`
      }>
        导入分析
      </NavLink>
      <NavLink to="/history" className={({ isActive }) =>
        `${base} ${isActive ? 'bg-brand text-white' : 'bg-white dark:bg-surface-card-dark text-ink-secondary border border-gray-200 dark:border-gray-700'}`
      }>
        历史记录
      </NavLink>
    </nav>
  )
}

export default function App() {
  // Shared state: when new data is imported on Home, History can pick it up
  const [refreshKey, setRefreshKey] = useState(0)
  const onDataSaved = useCallback(() => setRefreshKey(k => k + 1), [])

  return (
    <HashRouter>
      <div className="max-w-lg mx-auto px-4 pt-6 pb-16">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-ink dark:text-white">
            月度账单分析
          </h1>
          <p className="text-sm text-ink-secondary mt-1">
            导入微信 + 支付宝账单，自动生成消费报告
          </p>
        </header>
        <Nav />
        <Routes>
          <Route path="/" element={<Home onDataSaved={onDataSaved} />} />
          <Route path="/history" element={<History refreshKey={refreshKey} />} />
        </Routes>
      </div>
    </HashRouter>
  )
}
