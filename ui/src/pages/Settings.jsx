import { useState, useEffect } from 'react'
import { CheckCircle } from 'lucide-react'
import { api } from '../api'

export default function Settings() {
  const [cfg, setCfg]     = useState({ proxy_dns: '', username: '', password: '' })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getConfig().then(setCfg).catch(() => {})
  }, [])

  const set = (k) => (e) => setCfg(c => ({ ...c, [k]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    await api.saveConfig(cfg)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      <div className="card settings-card">
        <div className="card-title">⚙️ Proxy Configuration</div>
        <form className="form-stack" onSubmit={save}>
          <div className="form-group">
            <label>Proxy DNS (ip:port)</label>
            <input
              className="form-input"
              value={cfg.proxy_dns}
              onChange={set('proxy_dns')}
              placeholder="43.153.x.x:2334"
            />
          </div>
          <div className="form-group">
            <label>Username</label>
            <input
              className="form-input"
              value={cfg.username}
              onChange={set('username')}
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              className="form-input"
              type="password"
              value={cfg.password}
              onChange={set('password')}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button type="submit" className="btn btn-primary">💾 Lưu cấu hình</button>
            {saved && (
              <span className="saved-notice">
                <CheckCircle size={14} /> Đã lưu!
              </span>
            )}
          </div>
        </form>

        <p className="muted" style={{ marginTop: 16, fontSize: 12, lineHeight: 1.6 }}>
          Bỏ trống <strong>Proxy DNS</strong> nếu không dùng proxy.<br />
          Cấu hình được đọc mỗi lần gửi request — không cần restart crawler.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 460 }}>
        <div className="card-title">ℹ️ Thông tin hệ thống</div>
        <table style={{ fontSize: 12, lineHeight: 2, width: '100%' }}>
          <tbody>
            <tr><td className="muted">Backend API</td><td><code className="mono">http://localhost:8000</code></td></tr>
            <tr><td className="muted">DB</td><td><code className="mono">jobs.db</code> (project root)</td></tr>
            <tr><td className="muted">Dữ liệu crawl</td><td><code className="mono">data/{'{'}network{'}'}_{'{'}{'{'}job_id{'}'}{'}'}.csv</code></td></tr>
            <tr><td className="muted">Logs</td><td><code className="mono">logs/{'{'}job_id{'}'}.log</code></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
