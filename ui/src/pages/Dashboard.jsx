import { useWsData } from '../App'

function StatCard({ label, value }) {
  return (
    <div className="card stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export default function Dashboard() {
  const { stats, feed } = useWsData()
  const numbers = [...feed].reverse()

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
        <div className="card-title">🔢 Live Number Feed</div>
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
