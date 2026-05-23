import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, ChevronUp, Play, Pause, RotateCcw, Trash2, Database } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useWsData } from '../App'

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
  const navigate = useNavigate()
  const { has_proxy: hasProxy } = useWsData()

  const [open, setOpen]                   = useState(status === 'failed')
  const [failedPatterns, setFailedPats]   = useState([])
  const [busy, setBusy]                   = useState(false)
  const [resumeThreads, setResumeThreads] = useState(job.threads ?? 1)
  const [fullLog, setFullLog]             = useState(null)
  const [loadingLog, setLoadingLog]       = useState(false)

  // Session refresh state (used when resuming a failed Viettel job)
  const [resumeSession, setResumeSession]   = useState(null)
  const [sessionStatus, setSessionStatus]   = useState('')
  const [sessionError, setSessionError]     = useState('')

  const { id, network, pattern, status, total_saved, output_file = '', meta = '{}',
          progress, threads = 1, log = '', fail_reason = '' } = job
  const s = STATUS[status] ?? STATUS.pending

  const metaObj = (() => { try { return JSON.parse(meta) } catch { return {} } })()

  const logRef   = useRef(null)
  const prevStatusRef = useRef(status)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log, fullLog])

  // Auto-expand + load patterns when job transitions to failed
  useEffect(() => {
    if (prevStatusRef.current !== 'failed' && status === 'failed') {
      setOpen(true)
      loadFailedPatterns()
    }
    prevStatusRef.current = status
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load failed patterns on mount if already failed
  useEffect(() => {
    if (status === 'failed') loadFailedPatterns()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset session state when job transitions out of failed
  useEffect(() => {
    if (status !== 'failed') {
      setResumeSession(null)
      setSessionStatus('')
      setSessionError('')
      setFullLog(null)
    }
  }, [status])

  const loadFailedPatterns = useCallback(async () => {
    const res = await api.getFailedPatterns(id)
    setFailedPats(res.patterns)
  }, [id])

  const loadFullLog = async () => {
    setLoadingLog(true)
    try {
      const res = await api.getLog(id, 500)
      setFullLog(res.log)
    } catch {}
    setLoadingLog(false)
  }

  const toggle = () => {
    if (!open) loadFailedPatterns()
    setOpen(v => !v)
  }

  const act = async (fn) => {
    setBusy(true)
    try { await fn() } finally { await onRefresh(); setBusy(false) }
  }

  const fetchSessionForResume = async () => {
    setSessionStatus('loading')
    setSessionError('')
    try {
      const res = await api.viettelAutoSession()
      setResumeSession(res)
      setSessionStatus('ok')
    } catch (err) {
      setSessionError(err.message || 'Lỗi không xác định')
      setSessionStatus('error')
    }
  }

  const doResume = () => {
    const data = { threads: resumeThreads }
    if (network === 'viettel' && resumeSession) {
      data.x_csrf_token    = resumeSession.x_csrf_token
      data.cookie          = resumeSession.cookie
      data.proxy_session_id = resumeSession.proxy_session_id
    }
    return api.resumeJob(id, data)
  }

  const doDelete = () => {
    if (!window.confirm(`Xóa job ${id} (${network} ${pattern})? Hành động này không thể hoàn tác.`)) return
    return api.deleteJob(id)
  }

  const isViettelFailed = status === 'failed' && network === 'viettel'
  const outputName = output_file ? output_file.split(/[\\/]/).pop() : ''

  return (
    <div className={`card job-card${status === 'running' ? ' is-running' : ''}`}>
      {/* Header row */}
      <div className="job-header" onClick={toggle}>
        <div className="job-meta">
          <span className={`badge ${s.cls}`}>{s.label}</span>
          <code className="job-id">{id}</code>
          <strong style={{ fontSize: 12 }}>{network.toUpperCase()}</strong>
          <code className="job-pattern">{pattern}</code>
          {outputName && (
            <code className="job-id" style={{ color: 'var(--muted)' }}>{outputName}</code>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="saved-count">{total_saved.toLocaleString()} số</span>
          <button className="icon-btn" onClick={e => { e.stopPropagation(); toggle() }}>
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* Session expired warning */}
      {status === 'failed' && fail_reason && (
        <div className="alert alert-error" style={{ margin: '6px 0 0', fontSize: 12 }}>
          🔑 {fail_reason}
        </div>
      )}

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
          <>
            <button className="btn btn-warning" disabled={busy}
              onClick={() => act(() => api.pauseJob(id))}>
              <Pause size={13} /> Pause
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button className="btn btn-ghost" style={{ padding: '2px 8px' }} disabled={busy || threads <= 1}
                onClick={() => act(() => api.setJobThreads(id, threads - 1))}>−</button>
              <span style={{ fontSize: 12, minWidth: 40, textAlign: 'center' }}>{threads}T</span>
              <button className="btn btn-ghost" style={{ padding: '2px 8px' }} disabled={busy || threads >= 50}
                onClick={() => act(() => api.setJobThreads(id, threads + 1))}>+</button>
            </div>
          </>
        )}

        {['paused', 'pending', 'failed', 'completed'].includes(status) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* For failed Viettel jobs: session refresh before resume */}
            {isViettelFailed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost"
                  disabled={sessionStatus === 'loading' || !hasProxy}
                  onClick={fetchSessionForResume}>
                  {sessionStatus === 'loading' ? '⏳ Đang lấy session...' : '🤖 Lấy session mới'}
                </button>
                {sessionStatus === 'ok' && (
                  <span style={{ fontSize: 11, color: 'var(--green)' }}>
                    ✓ session: <code>{resumeSession.proxy_session_id}</code>
                  </span>
                )}
                {sessionStatus === 'error' && (
                  <span style={{ fontSize: 11, color: 'var(--red)' }}>✗ {sessionError}</span>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" min={1} max={50}
                className="form-input" value={resumeThreads}
                onChange={e => setResumeThreads(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: 52, padding: '3px 6px' }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>threads</span>
              <button className="btn btn-success" disabled={busy}
                onClick={() => act(doResume)}>
                <Play size={13} /> Resume
                {isViettelFailed && resumeSession && ' (session mới)'}
              </button>
            </div>
          </div>
        )}

        {progress.failed > 0 && (
          <button className="btn btn-ghost" disabled={busy}
            onClick={() => act(() => api.retryJob(id))}>
            <RotateCcw size={13} /> Retry failed ({progress.failed})
          </button>
        )}

        {output_file && (
          <button className="btn btn-ghost" style={{ fontSize: 12 }}
            onClick={() => navigate(`/explorer?file=${encodeURIComponent(output_file)}`)}>
            <Database size={13} /> Xem data
          </button>
        )}

        <button className="btn btn-danger" disabled={busy}
          onClick={() => act(doDelete)}>
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
          {/* Debug info for failed Viettel jobs */}
          {status === 'failed' && network === 'viettel' && (
            <div style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface-2)',
                          border: '1px solid var(--border)', borderRadius: 4, padding: '8px 10px' }}>
              <strong style={{ color: 'var(--text)' }}>🔍 Debug info</strong>
              <div style={{ marginTop: 4, fontFamily: 'var(--mono)', lineHeight: 1.8 }}>
                <div>proxy_session_id: <code>{metaObj.proxy_session_id || '—'}</code></div>
                <div>x_csrf_token: <code>{metaObj.x_csrf_token ? `${metaObj.x_csrf_token.slice(0, 16)}…` : '—'}</code></div>
                <div>cookie: <code>{metaObj.cookie ? `${metaObj.cookie.slice(0, 40)}…` : '—'}</code></div>
              </div>
            </div>
          )}

          <div className="log-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <h4 style={{ margin: 0 }}>📜 Log</h4>
              {!fullLog && (
                <button className="btn btn-ghost" style={{ padding: '1px 7px', fontSize: 11 }}
                  disabled={loadingLog} onClick={loadFullLog}>
                  {loadingLog ? 'Loading…' : 'Load full log (500 dòng)'}
                </button>
              )}
              {fullLog && (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {fullLog.split('\n').length} dòng
                  <button className="btn btn-ghost" style={{ padding: '1px 6px', fontSize: 10, marginLeft: 6 }}
                    onClick={() => setFullLog(null)}>
                    Thu lại
                  </button>
                </span>
              )}
            </div>
            <pre className="log-pre" ref={logRef}
              style={status === 'failed' ? { maxHeight: 400, borderColor: 'rgba(248,81,73,0.3)' } : undefined}>
              {fullLog || log || 'Chưa có log...'}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Jobs() {
  const [network, setNetwork]   = useState('viettel')
  const [pattern, setPattern]   = useState('09????????')
  const [csrfToken, setCsrf]    = useState('')
  const [d1n, setD1n]           = useState('')
  const [laravelSession, setLaravel] = useState('')
  const [proxySessionId, setProxySessionId] = useState('')
  const [inputMode, setInputMode] = useState('auto') // 'auto' | 'fields' | 'cookie' | 'curl'
  const [autoStatus, setAutoStatus] = useState('') // 'loading' | 'ok' | 'error'
  const [autoError, setAutoError]   = useState('')
  const [threads, setThreads]   = useState(1)
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
    const s = raw.replace(/\^"/g, '"').replace(/\^/g, '').replace(/%3D/g, '=')
    const csrfMatch = s.match(/-H\s+"x-csrf-token:\s*([^"]+)"/i)
    if (csrfMatch) setCsrf(csrfMatch[1].trim())
    const cookieMatch = s.match(/-b\s+"([^"]+)"/) || s.match(/-H\s+"cookie:\s*([^"]+)"/i)
    if (cookieMatch) extractCookieFields(cookieMatch[1])
  }

  const [error, setError] = useState('')
  const [jobs, setJobs] = useState([])

  const { jobs: wsJobs, has_proxy: hasProxy } = useWsData()

  useEffect(() => { setJobs(wsJobs) }, [wsJobs])

  const refresh = useCallback(async () => {
    try {
      const fresh = await api.listJobs()
      setJobs(prev => {
        const logMap = Object.fromEntries((prev || []).map(j => [j.id, j.log ?? '']))
        return fresh.map(j => ({ ...j, log: logMap[j.id] ?? '' }))
      })
    } catch {}
  }, [])

  const fetchAutoSession = async () => {
    setAutoStatus('loading')
    setAutoError('')
    try {
      const res = await api.viettelAutoSession()
      const get = (key) => {
        const m = res.cookie.match(new RegExp(`${key}=([^;]+)`))
        return m ? m[1].trim() : ''
      }
      setCsrf(res.x_csrf_token)
      setD1n(get('D1N'))
      setLaravel(get('laravel_session'))
      setProxySessionId(res.proxy_session_id)
      setAutoStatus('ok')
    } catch (err) {
      setAutoError(err.message || 'Lỗi không xác định')
      setAutoStatus('error')
    }
  }

  const create = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const cookie = `D1N=${d1n}; laravel_session=${laravelSession}`
      const payload = { network, pattern, x_csrf_token: csrfToken, cookie, proxy_session_id: proxySessionId, threads }
      console.group('[CREATE JOB]')
      console.debug('network:', network, '| pattern:', pattern, '| threads:', threads)
      console.debug('proxy_session_id:', proxySessionId)
      console.debug('csrf:', csrfToken.slice(0, 16) + '…')
      console.debug('cookie:', cookie.slice(0, 60) + '…')
      console.groupEnd()
      await api.createJob(payload)
      await refresh()
    } catch (err) {
      console.error('[CREATE JOB failed]', err)
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
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 10 }}>
            <strong>Lỗi:</strong> {error}
          </div>
        )}
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
                {[['auto', '🤖 Tự động'], ['fields', 'Từng field'], ['cookie', 'Paste Cookie'], ['curl', 'Paste cURL']].map(([m, label]) => (
                  <button key={m} type="button"
                    className={`mode-tab${inputMode === m ? ' active' : ''}`}
                    onClick={() => setInputMode(m)}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Auto mode */}
              {inputMode === 'auto' && (
                <div style={{ padding: '10px 0' }}>
                  <p className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
                    Tự động mở browser headless qua proxy, lấy session Viettel mà không cần copy từ DevTools.
                  </p>
                  <button type="button" className="btn btn-primary"
                    disabled={autoStatus === 'loading' || !hasProxy}
                    onClick={fetchAutoSession}
                    style={{ marginBottom: 8 }}>
                    {autoStatus === 'loading' ? '⏳ Đang lấy session (~10s)…' : '🤖 Lấy session tự động'}
                  </button>
                  {autoStatus === 'ok' && (
                    <div style={{ fontSize: 12, color: 'var(--green)' }}>
                      ✓ Session sẵn sàng — proxy_session: <code>{proxySessionId}</code>
                      <br />✓ csrf: <code>{csrfToken.slice(0, 12)}…</code>
                      &nbsp;✓ D1N: <code>{d1n.slice(0, 12)}…</code>
                      &nbsp;✓ laravel_session: <code>{laravelSession.slice(0, 12)}…</code>
                    </div>
                  )}
                  {autoStatus === 'error' && (
                    <div style={{ fontSize: 12, color: 'var(--red)' }}>✗ {autoError}</div>
                  )}
                </div>
              )}

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

          <div className="form-row" style={{ marginBottom: 10, alignItems: 'center', gap: 8 }}>
            <label className="field-label" style={{ margin: 0 }}>Threads:</label>
            <input
              type="number" min={1} max={50}
              className="form-input"
              value={threads}
              onChange={e => setThreads(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: 70 }}
            />
          </div>

          <button type="submit" className="btn btn-primary"
            disabled={busy || !hasProxy || (network === 'viettel' && (!csrfToken.trim() || !d1n.trim() || !laravelSession.trim()))}>
            {busy ? 'Đang tạo…' : '🚀 Start Job'}
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
