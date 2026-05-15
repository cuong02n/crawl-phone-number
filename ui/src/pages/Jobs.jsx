import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp, Play, Pause, RotateCcw, Trash2 } from 'lucide-react'
import { api } from '../api'

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS = {
  running:   { label: 'Running',   cls: 'badge-green'  },
  paused:    { label: 'Paused',    cls: 'badge-yellow' },
  completed: { label: 'Completed', cls: 'badge-blue'   },
  failed:    { label: 'Failed',    cls: 'badge-red'    },
  pending:   { label: 'Pending',   cls: 'badge-gray'   },
}

const PATTERN_PRESETS = [
  { label: 'Toàn bộ 09x',   value: '09????????' },
  { label: 'Toàn bộ 08x',   value: '08????????' },
  { label: 'Toàn bộ 07x',   value: '07????????' },
  { label: '0901 xxxxxx',   value: '0901??????' },
  { label: '0909 xxxxxx',   value: '0909??????' },
  { label: '0888 xxxxxx',   value: '0888??????' },
  { label: '0333 xxxxxx',   value: '0333??????' },
]

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ done, pending, failed, percent }) {
  return (
    <div className="progress-wrap">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="progress-labels">
        <span className="c-green">{done.toLocaleString()} done</span>
        <span>{pending.toLocaleString()} pending</span>
        {failed > 0 && <span className="c-red">{failed.toLocaleString()} failed</span>}
        <span style={{ marginLeft: 'auto' }}>{percent}%</span>
      </div>
    </div>
  )
}

// ── Job card ───────────────────────────────────────────────────────────────────

function JobCard({ job, onRefresh }) {
  const [open, setOpen]                   = useState(false)
  const [log, setLog]                     = useState('')
  const [failedPatterns, setFailedPats]   = useState([])
  const [busy, setBusy]                   = useState(false)

  const { id, network, pattern, status, total_saved, progress } = job
  const s = STATUS[status] ?? STATUS.pending

  const loadDetails = useCallback(async () => {
    const [logRes, fpRes] = await Promise.all([api.getLog(id), api.getFailedPatterns(id)])
    setLog(logRes.log)
    setFailedPats(fpRes.patterns)
  }, [id])

  const toggle = () => {
    if (!open) loadDetails()
    setOpen(v => !v)
  }

  // Re-fetch log while expanded
  useEffect(() => {
    if (!open) return
    const t = setInterval(loadDetails, 3000)
    return () => clearInterval(t)
  }, [open, loadDetails])

  const act = async (fn) => {
    setBusy(true)
    try { await fn() } finally { await onRefresh(); setBusy(false) }
  }

  return (
    <div className={`card job-card${status === 'running' ? ' is-running' : ''}`}>
      {/* Header row */}
      <div className="job-header" onClick={toggle}>
        <div className="job-meta">
          <span className={`badge ${s.cls}`}>{s.label}</span>
          <code className="job-id">{id}</code>
          <strong style={{ fontSize: 12 }}>{network.toUpperCase()}</strong>
          <code className="job-pattern">{pattern}</code>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="saved-count">{total_saved.toLocaleString()} số</span>
          <button className="icon-btn" onClick={e => { e.stopPropagation(); toggle() }}>
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* Progress */}
      <ProgressBar {...progress} />

      {/* Realtime stats */}
      {status === 'running' && (
        <div className="job-realtime">
          <span className="realtime-pattern">
            ⚙ {progress.current_pattern ?? '…'}
          </span>
          <span className="realtime-counts">
            {progress.done.toLocaleString()} / {progress.total.toLocaleString()} patterns
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="job-actions">
        {status === 'running' && (
          <button className="btn btn-warning" disabled={busy}
            onClick={() => act(() => api.pauseJob(id))}>
            <Pause size={13} /> Pause
          </button>
        )}
        {['paused', 'pending', 'failed', 'completed'].includes(status) && (
          <button className="btn btn-success" disabled={busy}
            onClick={() => act(() => api.resumeJob(id))}>
            <Play size={13} /> Resume
          </button>
        )}
        {progress.failed > 0 && (
          <button className="btn btn-ghost" disabled={busy}
            onClick={() => act(() => api.retryJob(id))}>
            <RotateCcw size={13} /> Retry failed ({progress.failed})
          </button>
        )}
        <button className="btn btn-danger" disabled={busy}
          onClick={() => act(() => api.deleteJob(id))}>
          <Trash2 size={13} /> Xóa
        </button>
      </div>

      {/* Expanded details */}
      {open && (
        <div className="job-details">
          {failedPatterns.length > 0 && (
            <div className="failed-section">
              <h4>❌ Failed Patterns ({failedPatterns.length})</h4>
              <div className="pattern-chips">
                {failedPatterns.map((p, i) => (
                  <code key={i} className="pattern-chip">{p}</code>
                ))}
              </div>
            </div>
          )}
          <div className="log-section">
            <h4>📜 Log (live)</h4>
            <pre className="log-pre">{log || 'Chưa có log...'}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Jobs() {
  const [jobs, setJobs]         = useState([])
  const [network, setNetwork]   = useState('viettel')
  const [pattern, setPattern]   = useState('09????????')
  const [csrfToken, setCsrf]    = useState('')
  const [d1n, setD1n]           = useState('')
  const [laravelSession, setLaravel] = useState('')
  const [inputMode, setInputMode] = useState('fields') // 'fields' | 'cookie' | 'curl'
  const [busy, setBusy]         = useState(false)

  const extractCookieFields = (cookieStr) => {
    const get = (key) => {
      const m = cookieStr.match(new RegExp(`${key}=([^;]+)`))
      return m ? m[1].trim() : ''
    }
    const d = get('D1N')
    const l = get('laravel_session')
    if (d) setD1n(d)
    if (l) setLaravel(l)
  }

  const parseCurl = (raw) => {
    // normalize Windows CMD escaping (^ before quotes, %3D, etc.)
    const s = raw.replace(/\^"/g, '"').replace(/\^/g, '').replace(/%3D/g, '=')

    const csrfMatch = s.match(/-H\s+"x-csrf-token:\s*([^"]+)"/i)
    if (csrfMatch) setCsrf(csrfMatch[1].trim())

    const cookieMatch = s.match(/-b\s+"([^"]+)"/) || s.match(/-H\s+"cookie:\s*([^"]+)"/i)
    if (cookieMatch) extractCookieFields(cookieMatch[1])
  }
  const [hasProxy, setHasProxy] = useState(true)
  const [error, setError]       = useState('')

  const refresh = useCallback(async () => {
    try { setJobs(await api.listJobs()) } catch { /* ignore */ }
  }, [])

  const checkProxy = useCallback(async () => {
    try {
      const cfg = await api.getConfig()
      setHasProxy(!!cfg.proxy_dns?.trim())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    checkProxy()
    refresh()
    const t = setInterval(() => { refresh(); checkProxy() }, 2000)
    return () => clearInterval(t)
  }, [refresh, checkProxy])

  const create = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const cookie = `D1N=${d1n}; laravel_session=${laravelSession}`
      await api.createJob({ network, pattern, x_csrf_token: csrfToken, cookie })
      await refresh()
    } catch (err) {
      setError(err.message || 'Lỗi không xác định')
    } finally { setBusy(false) }
  }

  const running  = jobs.filter(j => j.status === 'running').length
  const paused   = jobs.filter(j => j.status === 'paused').length
  const complete = jobs.filter(j => j.status === 'completed').length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Jobs</h1>
        <span className="badge badge-green">{running} running</span>
        <span className="badge badge-yellow">{paused} paused</span>
        <span className="badge badge-blue">{complete} done</span>
      </div>

      {/* Proxy warning */}
      {!hasProxy && (
        <div className="alert alert-warning">
          ⚠ Chưa cấu hình proxy — crawler sẽ không chạy được.{' '}
          <a href="/settings" style={{ color: 'inherit', fontWeight: 600 }}>Vào Settings để cấu hình.</a>
        </div>
      )}

      {/* Create form */}
      <div className="card create-card">
        <div className="card-title">➕ Tạo Job mới</div>
        {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
        <form onSubmit={create}>
          <div className="form-row" style={{ marginBottom: 10 }}>
            <select className="form-select" value={network}
              onChange={e => setNetwork(e.target.value)}>
              <option value="viettel">Viettel</option>
              <option value="vnpt">VNPT</option>
            </select>

            {network === 'viettel' && (
              <>
                <input
                  className="form-input"
                  value={pattern}
                  onChange={e => setPattern(e.target.value)}
                  placeholder="09????????"
                  style={{ fontFamily: 'var(--mono)', width: 180 }}
                />
                <select
                  className="form-select"
                  defaultValue=""
                  onChange={e => e.target.value && setPattern(e.target.value)}
                >
                  <option value="">Gợi ý…</option>
                  {PATTERN_PRESETS.map(p => (
                    <option key={p.value} value={p.value}>{p.label} — {p.value}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          {network === 'viettel' && (
            <div style={{ marginBottom: 10 }}>

              {/* Mode tabs */}
              <div className="input-mode-tabs">
                {[['fields', 'Từng field'], ['cookie', 'Paste Cookie'], ['curl', 'Paste cURL']].map(([m, label]) => (
                  <button key={m} type="button"
                    className={`mode-tab${inputMode === m ? ' active' : ''}`}
                    onClick={() => setInputMode(m)}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Fields mode */}
              {inputMode === 'fields' && (
                <div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="field-label">x-csrf-token</label>
                    <input className="form-input" value={csrfToken}
                      onChange={e => setCsrf(e.target.value)}
                      placeholder="HL2g2Ck0lbHkLFZWzuyhzA2x..."
                      style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 11 }} />
                  </div>
                  <div className="cookie-box">
                    <div className="cookie-box-label">Cookie</div>
                    <div className="form-row">
                      <div style={{ flex: 1 }}>
                        <label className="field-label">D1N</label>
                        <input className="form-input" value={d1n}
                          onChange={e => setD1n(e.target.value)}
                          placeholder="de0bcefe22038b32..."
                          style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 11 }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="field-label">laravel_session</label>
                        <input className="form-input" value={laravelSession}
                          onChange={e => setLaravel(e.target.value)}
                          placeholder="vre9ZH5KJk5mIAcb..."
                          style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 11 }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Paste Cookie mode */}
              {inputMode === 'cookie' && (
                <div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="field-label">x-csrf-token</label>
                    <input className="form-input" value={csrfToken}
                      onChange={e => setCsrf(e.target.value)}
                      placeholder="HL2g2Ck0lbHkLFZWzuyhzA2x..."
                      style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 11 }} />
                  </div>
                  <div className="cookie-box">
                    <div className="cookie-box-label">Cookie</div>
                    <textarea className="form-input"
                      placeholder="D1N=...; laravel_session=...; ..."
                      onChange={e => {
                        e.target.style.height = 'auto'
                        e.target.style.height = e.target.scrollHeight + 'px'
                        extractCookieFields(e.target.value)
                      }}
                      style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 11, resize: 'none', overflow: 'hidden', minHeight: 60 }} />
                    {(d1n || laravelSession) && (
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--green)' }}>
                        {d1n && <span>✓ D1N&nbsp;&nbsp;</span>}
                        {laravelSession && <span>✓ laravel_session</span>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Paste cURL mode */}
              {inputMode === 'curl' && (
                <div>
                  <label className="field-label">Paste lệnh cURL (copy từ DevTools → Network → Copy as cURL)</label>
                  <textarea className="form-input"
                    placeholder={'curl "https://vietteltelecom.vn/api/get/sim" \\\n  -H "x-csrf-token: ..." \\\n  -b "D1N=...; laravel_session=..."'}
                    onChange={e => {
                      e.target.style.height = 'auto'
                      e.target.style.height = e.target.scrollHeight + 'px'
                      parseCurl(e.target.value)
                    }}
                    style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 11, resize: 'none', overflow: 'hidden', minHeight: 80 }} />
                  {(csrfToken || d1n || laravelSession) && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--green)' }}>
                      {csrfToken && <span>✓ x-csrf-token&nbsp;&nbsp;</span>}
                      {d1n && <span>✓ D1N&nbsp;&nbsp;</span>}
                      {laravelSession && <span>✓ laravel_session</span>}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {network === 'vnpt' && (
            <span className="muted" style={{ fontSize: 12 }}>
              VNPT tự crawl toàn bộ prefix 082, 085, 088, 091, 094
            </span>
          )}

          <button type="submit" className="btn btn-primary"
            disabled={busy || !hasProxy || (network === 'viettel' && (!csrfToken.trim() || !d1n.trim() || !laravelSession.trim()))}>

            {busy ? 'Đang tạo…' : '🚀 Start'}
          </button>
        </form>
      </div>

      {/* Job list */}
      <div className="job-list">
        {jobs.length === 0 ? (
          <p className="muted">Chưa có job nào. Tạo job mới ở trên.</p>
        ) : (
          jobs.map(job => <JobCard key={job.id} job={job} onRefresh={refresh} />)
        )}
      </div>
    </div>
  )
}
