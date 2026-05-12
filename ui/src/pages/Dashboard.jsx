import { useState, useEffect } from 'react'
import { api } from '../api'

function StatCard({ label, value }) {
  return (
    <div className="card stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats]     = useState({ total_jobs: 0, running_jobs: 0, total_saved: 0, avg_progress: 0 })
  const [numbers, setNumbers] = useState([])

  const refresh = async () => {
    try {
      const [s, f] = await Promise.all([api.getStats(), api.getRecentNumbers(60)])
      setStats(s)
      setNumbers(prev => {
        const next = [...f.numbers].reverse()
        // Highlight new ones by comparing with previous
        return next
      })
    } catch { /* backend not ready yet */ }
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [])

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      <div className="stats-grid">
        <StatCard label="Đang chạy"      value={stats.running_jobs} />
        <StatCard label="Tổng số đã thu" value={stats.total_saved.toLocaleString()} />
        <StatCard label="Tổng jobs"      value={stats.total_jobs} />
        <StatCard label="Tiến độ TB"     value={`${stats.avg_progress}%`} />
      </div>

      <div className="card">
        <div className="card-title">🔢 Live Number Feed — cập nhật mỗi 2 giây</div>
        {numbers.length === 0 ? (
          <p className="muted" style={{ padding: '12px 0' }}>
            Chờ crawler tìm được số... Hãy tạo job ở trang Jobs.
          </p>
        ) : (
          <div className="feed-grid">
            {numbers.map((n, i) => (
              <div key={`${n}-${i}`} className="feed-number">{n}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
