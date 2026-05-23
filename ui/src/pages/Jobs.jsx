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
  { label: 'Toàn bộ Viettel (03/08/09)', value: '0?????????' },
  { label: 'Toàn bộ 09x',                value: '09????????' },
  { label: 'Toàn bộ 08x',                value: '08????????' },
  { label: 'Toàn bộ 03x',                value: '03????????' },
  { label: '0901 xxxxxx',                value: '0901??????' },
  { label: '0909 xxxxxx',                value: '0909??????' },
  { label: '0888 xxxxxx',                value: '0888??????' },
  { label: '0333 xxxxxx',                value: '0333??????' },
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

// ── Shared log-line color helper ───────────────────────────────────────────────

function logColor(l) {
  if (l.level === 'ERROR' || l.level === 'CRITICAL') return 'var(--red)'
  if (l.level === 'WARNING') return '#e3a008'
  if (/saved|refresh|laravel/i.test(l.msg)) return 'var(--green)'
  if (/rotat|D1N|ec=1/i.test(l.msg)) return '#e3a008'
  return 'var(--text)'
}

// Extract latest Viettel session state from a thread's log lines.
// Returns { proxySid, d1n, lastRotateAt, rotateCount }.
function extractViettelSession(lines) {
  let proxySid = null
  let d1n = null
  let lastRotateAt = null
  let rotateCount = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    const { msg = '', time } = lines[i]
    if (!proxySid) {
      const rot = msg.match(/rotate IP \w+ → (\w+)/)
      if (rot) {
        proxySid = rot[1]
        lastRotateAt = time
      } else {
        const init = msg.match(/proxy_sid=(\w+)/)
        if (init) proxySid = init[1]
      }
    }
    if (!d1n) {
      const m = msg.match(/D1N refreshed ([a-f0-9]+)/)
      if (m) d1n = m[1]
    }
  }
  // Count rotates in this window
  for (const l of lines) {
    if (/rotate IP/.test(l.msg || '')) rotateCount++
  }
  return { proxySid, d1n, lastRotateAt, rotateCount }
}

// ── Thread sub-panels (reused in both ThreadLogs and LiveLogMonitor) ───────────

function ThreadPanels({ threadData, panelRefs, wrap = true, defaultW = 280, defaultH = 200, network = '' }) {
  const threadNums = Object.keys(threadData).map(Number).sort((a, b) => a - b)
  if (threadNums.length === 0) return null

  const lineStyle = wrap
    ? { whiteSpace: 'pre-wrap', wordBreak: 'break-all' }
    : { whiteSpace: 'nowrap' }

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      alignItems: 'flex-start',
    }}>
      {threadNums.map(n => {
        const lines = threadData[n] || []
        const sess = network === 'viettel' ? extractViettelSession(lines) : null
        return (
          <div
            key={n}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              padding: '5px 7px',
              // ─── per-panel resize (both axes) ───
              resize: 'both',
              overflow: 'hidden',
              width: defaultW,
              height: defaultH,
              minWidth: 180,
              minHeight: 100,
              maxWidth: '95vw',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{
              flexShrink: 0,
              marginBottom: 3,
              borderBottom: '1px solid var(--border)',
              paddingBottom: 3,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>T{n} <span style={{ fontWeight: 400 }}>({lines.length})</span></span>
                <span style={{ fontWeight: 400, opacity: 0.5, fontSize: 9 }}>⤡</span>
              </div>
              {sess && (sess.proxySid || sess.d1n) && (
                <div style={{
                  fontSize: 9, fontFamily: 'var(--mono)', lineHeight: 1.4,
                  marginTop: 2, color: 'var(--muted)',
                  display: 'flex', flexWrap: 'wrap', gap: 6,
                }}>
                  {sess.proxySid && (
                    <span title={`Proxy session: ${sess.proxySid}${sess.rotateCount > 0 ? ` (rotated ${sess.rotateCount}×)` : ''}`}>
                      🌐 <code style={{ color: 'var(--text)' }}>{sess.proxySid}</code>
                      {sess.rotateCount > 0 && (
                        <span style={{ color: '#e3a008' }}> ·{sess.rotateCount}↻</span>
                      )}
                    </span>
                  )}
                  {sess.d1n && (
                    <span title={`D1N: ${sess.d1n}`}>
                      🔑 <code style={{ color: 'var(--text)' }}>{sess.d1n.slice(0, 10)}…</code>
                    </span>
                  )}
                </div>
              )}
            </div>
            <div
              ref={el => { if (panelRefs) panelRefs.current[n] = el }}
              style={{
                fontFamily: 'var(--mono)', fontSize: 10, lineHeight: 1.55,
                flex: 1, minHeight: 0,
                overflowY: 'auto',
                overflowX: wrap ? 'hidden' : 'auto',
              }}
            >
              {lines.length === 0
                ? <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>đang chờ…</div>
                : lines.map((l, i) => (
                    <div key={i} style={{ color: logColor(l), ...lineStyle }}>
                      {l.time && <span style={{ color: 'var(--muted)', marginRight: 5 }}>{l.time}</span>}
                      {l.msg}
                    </div>
                  ))
              }
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Per-thread log panels (inside expanded job card) ──────────────────────────

function ThreadLogs({ jobId, status, open, log, network = '' }) {
  const [threadData, setThreadData] = useState({})
  const panelRefs   = useRef({})
  const intervalRef = useRef(null)

  const fetchLogs = useCallback(async () => {
    try {
      const res = await api.getThreadLogs(jobId)
      setThreadData(res.threads || {})
    } catch {}
  }, [jobId])

  useEffect(() => {
    if (!open) return
    fetchLogs()
    if (status === 'running') {
      intervalRef.current = setInterval(fetchLogs, 1500)
    }
    return () => clearInterval(intervalRef.current)
  }, [open, status, fetchLogs])

  useEffect(() => {
    for (const el of Object.values(panelRefs.current)) {
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [threadData])

  const threadNums = Object.keys(threadData).map(Number)

  return (
    <div className="log-section">
      <h4 style={{ margin: '0 0 8px' }}>
        📜 Log{threadNums.length > 0 ? ` — ${threadNums.length} luồng` : ''}
      </h4>
      {threadNums.length === 0
        ? <pre className="log-pre">{log || 'Chưa có log...'}</pre>
        : <ThreadPanels threadData={threadData} panelRefs={panelRefs} defaultW={260} defaultH={180} network={network} />
      }
    </div>
  )
}

// ── Live multi-job log monitor ─────────────────────────────────────────────────

function JobLogPanel({ job }) {
  const [threadData, setThreadData] = useState({})
  const [rawLog, setRawLog]         = useState('')
  const [merged, setMerged]         = useState(false)
  const [wrap, setWrap]             = useState(true)
  const panelRefs   = useRef({})
  const mergedRef   = useRef(null)
  const intervalRef = useRef(null)
  const s = STATUS[job.status] ?? STATUS.pending

  const fetchLogs = useCallback(async () => {
    try {
      if (merged) {
        const res = await api.getLog(job.id, 500)
        setRawLog(res.log || '')
      } else {
        const res = await api.getThreadLogs(job.id)
        setThreadData(res.threads || {})
      }
    } catch {}
  }, [job.id, merged])

  useEffect(() => {
    fetchLogs()
    if (job.status === 'running') {
      intervalRef.current = setInterval(fetchLogs, 1500)
    }
    return () => clearInterval(intervalRef.current)
  }, [job.status, fetchLogs])

  // Auto-scroll to bottom on new data
  useEffect(() => {
    if (merged) {
      if (mergedRef.current) mergedRef.current.scrollTop = mergedRef.current.scrollHeight
    } else {
      for (const el of Object.values(panelRefs.current)) {
        if (el) el.scrollTop = el.scrollHeight
      }
    }
  }, [threadData, rawLog, merged])

  const threadNums = Object.keys(threadData).map(Number)
  const lineCount  = merged
    ? (rawLog ? rawLog.split('\n').length : 0)
    : Object.values(threadData).reduce((a, l) => a + l.length, 0)

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '10px 12px',
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Panel header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span className={`badge ${s.cls}`}>{s.label}</span>
        <code style={{ fontSize: 11 }}>{job.network.toUpperCase()}</code>
        <code style={{ fontSize: 11, color: 'var(--muted)' }}>{job.pattern}</code>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
          {!merged && threadNums.length > 0 ? `${threadNums.length}T · ` : ''}
          {lineCount} dòng · {job.total_saved.toLocaleString()} số
        </span>
      </div>

      {/* Live stats row — only for crawlers that expose them (Viettel/VNM) */}
      {job.live_stats && Object.keys(job.live_stats).length > 0 && (
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap',
          fontSize: 11, color: 'var(--muted)',
          padding: '4px 8px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 5,
        }}>
          <span title="Số request đã gửi đến API">
            📨 <strong style={{ color: 'var(--text)' }}>{(job.live_stats.requests ?? 0).toLocaleString()}</strong> req
          </span>
          {job.live_stats.session_refreshes !== undefined && (
            <span title="Số lần lấy lại laravel_session bằng Playwright">
              🔑 <strong style={{ color: 'var(--text)' }}>{job.live_stats.session_refreshes}</strong> session
            </span>
          )}
          {job.live_stats.d1n_refreshes !== undefined && (
            <span title="Số lần giải D1N challenge">
              🛡 <strong style={{ color: 'var(--text)' }}>{job.live_stats.d1n_refreshes}</strong> D1N
            </span>
          )}
          {job.live_stats.ip_rotates !== undefined && (
            <span title="Số lần rotate IP proxy">
              🌐 <strong style={{ color: 'var(--text)' }}>{job.live_stats.ip_rotates}</strong> rotate
            </span>
          )}
          {job.live_stats.ec1 !== undefined && (
            <span title="Số lần Viettel trả ec=1 (rate limit). Tỷ lệ ec1/req nên < 3%."
                  style={{ color: job.live_stats.ec1 > 0 ? '#e3a008' : undefined }}>
              ⛔ <strong style={{ color: job.live_stats.ec1 > 0 ? '#e3a008' : 'var(--text)' }}>
                {job.live_stats.ec1}
              </strong> ec=1
              {job.live_stats.requests > 0 && (
                <span style={{ opacity: 0.6 }}>
                  {' '}({((job.live_stats.ec1 / job.live_stats.requests) * 100).toFixed(1)}%)
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Progress mini-bar */}
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
        <div style={{
          height: '100%', borderRadius: 2, background: 'var(--green)',
          width: `${job.progress?.percent ?? 0}%`, transition: 'width 0.5s',
        }} />
      </div>

      {/* Toolbar: merge toggle + wrap toggle */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>
        <button
          type="button"
          className={`btn ${merged ? 'btn-primary' : 'btn-ghost'}`}
          style={{ padding: '2px 8px', fontSize: 11 }}
          onClick={() => setMerged(m => !m)}
          title={merged ? 'Tách thành các thread riêng' : 'Gộp tất cả thread vào 1 panel'}
        >
          {merged ? '⊟ Đang gộp' : '⊞ Gộp'}
        </button>
        <button
          type="button"
          className={`btn ${wrap ? 'btn-primary' : 'btn-ghost'}`}
          style={{ padding: '2px 8px', fontSize: 11 }}
          onClick={() => setWrap(w => !w)}
          title="Bật/tắt xuống dòng cho log dài"
        >
          ↵ Wrap
        </button>
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontStyle: 'italic' }}>
          {merged ? '⇕ kéo cạnh dưới để resize' : '⤡ kéo góc mỗi panel để resize'}
        </span>
      </div>

      {/* Log content area */}
      {merged ? (
        <div
          ref={mergedRef}
          style={{
            // merged view = 1 panel → tự resize cả 2 chiều
            resize: 'both',
            overflow: 'auto',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            padding: '6px 8px',
            fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.55,
            whiteSpace: wrap ? 'pre-wrap' : 'pre',
            wordBreak: wrap ? 'break-all' : 'normal',
            color: 'var(--text)',
            height: 320,
            minHeight: 160, maxHeight: '85vh',
            minWidth: 240,
          }}
        >
          {rawLog || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>đang chờ log…</span>}
        </div>
      ) : threadNums.length === 0 ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
          đang khởi động…
        </div>
      ) : (
        <ThreadPanels threadData={threadData} panelRefs={panelRefs} wrap={wrap} network={job.network} />
      )}
    </div>
  )
}

function LiveLogMonitor({ jobs }) {
  const active = jobs.filter(j => j.status === 'running' || j.status === 'paused')
  if (active.length === 0) return null

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ marginBottom: 10 }}>
        📺 Live Log — {active.length} job
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(active.length, 3)}, 1fr)`,
        gap: 10,
      }}>
        {active.map(job => <JobLogPanel key={job.id} job={job} />)}
      </div>
    </div>
  )
}

// ── Job card ───────────────────────────────────────────────────────────────────

function JobCard({ job, onRefresh }) {
  const navigate = useNavigate()
  const { has_proxy: hasProxy } = useWsData()

  const { id, network, pattern, status, total_saved, output_file = '', meta = '{}',
          progress, threads = 1, log = '', fail_reason = '', live_stats = {} } = job

  const [open, setOpen]                   = useState(status === 'failed')
  const [failedPatterns, setFailedPats]   = useState([])
  const [busy, setBusy]                   = useState(false)
  const [resumeThreads, setResumeThreads] = useState(threads)

  // Session refresh state (used when resuming a failed Viettel job)
  const [resumeSession, setResumeSession]   = useState(null)
  const [sessionStatus, setSessionStatus]   = useState('')
  const [sessionError, setSessionError]     = useState('')
  const s = STATUS[status] ?? STATUS.pending

  const metaObj = (() => { try { return JSON.parse(meta) } catch { return {} } })()

  const prevStatusRef = useRef(status)

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
    }
  }, [status])

  const loadFailedPatterns = useCallback(async () => {
    const res = await api.getFailedPatterns(id)
    setFailedPats(res.patterns)
  }, [id])

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
          {network === 'viettel' && metaObj.isdn_type === 22 && (
            <span className="badge" style={{ background: '#7c3aed', color: 'white' }}>💼 trả sau</span>
          )}
          {network === 'viettel' && (metaObj.isdn_type === 2 || metaObj.isdn_type === undefined) && (
            <span className="badge" style={{ background: '#0891b2', color: 'white' }}>📱 trả trước</span>
          )}
          {(network === 'viettel' || network === 'vietnamobile') && metaObj.no_proxy && (
            <span className="badge" style={{ background: '#e3a008', color: 'white' }}>🏠 no proxy</span>
          )}
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
          {(live_stats.requests ?? 0) > 0 && (
            <span className="realtime-counts" style={{ marginLeft: 12 }}>
              📨 {live_stats.requests.toLocaleString()} req
              {live_stats.session_refreshes > 0 && ` · 🔑 ${live_stats.session_refreshes} session`}
              {live_stats.d1n_refreshes > 0    && ` · 🛡 ${live_stats.d1n_refreshes} D1N`}
              {live_stats.ip_rotates > 0       && ` · 🌐 ${live_stats.ip_rotates} rotate`}
              {live_stats.ec1 > 0              && ` · ⛔ ${live_stats.ec1} ec=1`}
            </span>
          )}
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

          <ThreadLogs jobId={id} status={status} open={open} log={log} network={network} />
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Jobs() {
  const [network, setNetwork]   = useState('viettel')
  const [pattern, setPattern]   = useState('0?????????')
  const [csrfToken, setCsrf]    = useState('')
  const [d1n, setD1n]           = useState('')
  const [laravelSession, setLaravel] = useState('')
  const [proxySessionId, setProxySessionId] = useState('')
  const [inputMode, setInputMode] = useState('auto') // 'auto' | 'fields' | 'cookie' | 'curl'
  const [autoStatus, setAutoStatus]   = useState('') // 'loading' | 'ok' | 'error'
  const [autoSteps, setAutoSteps]     = useState([])
  const [cacheRemaining, setCacheRemaining] = useState(0) // seconds
  const autoStepsRef  = useRef(null)
  const autoSourceRef = useRef(null)
  const [threads, setThreads]   = useState(1)
  const [noProxy, setNoProxy]   = useState(false)
  const [isdnType, setIsdnType] = useState(2)   // 2 = trả trước, 22 = trả sau
  const [vnmToken, setVnmToken] = useState('') // Vietnamobile URL token
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

  // Auto-scroll the step log whenever new steps arrive
  useEffect(() => {
    if (autoStepsRef.current)
      autoStepsRef.current.scrollTop = autoStepsRef.current.scrollHeight
  }, [autoSteps])

  // When switching to auto mode, silently check if a cached session exists
  useEffect(() => {
    if (inputMode !== 'auto') return
    api.getViettelSession().then(data => {
      if (!data.cached) return
      const res = data.session
      const pick = (key) => (res.cookie || '').match(new RegExp(`${key}=([^;]+)`))?.[1]?.trim() || ''
      setCsrf(res.x_csrf_token)
      setD1n(pick('D1N'))
      setLaravel(pick('laravel_session'))
      setProxySessionId(res.proxy_session_id || '')
      setCacheRemaining(data.remaining_seconds)
      setAutoStatus('ok')
    }).catch(() => {})
  }, [inputMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const applySessionResult = (res) => {
    const pick = (key) => (res.cookie || '').match(new RegExp(`${key}=([^;]+)`))?.[1]?.trim() || ''
    setCsrf(res.x_csrf_token)
    setD1n(pick('D1N'))
    setLaravel(pick('laravel_session'))
    setProxySessionId(res.proxy_session_id || '')
  }

  const fetchAutoSession = (force = false) => {
    if (autoSourceRef.current) autoSourceRef.current.close()
    setAutoSteps([])
    setAutoStatus('loading')
    setCacheRemaining(0)

    const params = new URLSearchParams()
    if (force)   params.set('force', 'true')
    if (noProxy) params.set('no_proxy', 'true')
    const qs = params.toString()
    const url = `/api/viettel/auto-session/stream${qs ? '?' + qs : ''}`
    const source = new EventSource(url)
    autoSourceRef.current = source

    source.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === 'step') {
        setAutoSteps(prev => [...prev, { kind: 'step', msg: data.msg }])
      } else if (data.type === 'done') {
        applySessionResult(data.result)
        setCacheRemaining(data.result.fetched_at ? 3600 : 0)
        setAutoSteps(prev => [...prev, { kind: 'done', msg: '✅ Session sẵn sàng!' }])
        setAutoStatus('ok')
        source.close()
        // refresh remaining from server
        api.getViettelSession().then(d => setCacheRemaining(d.remaining_seconds || 0)).catch(() => {})
      } else if (data.type === 'error') {
        setAutoSteps(prev => [...prev, { kind: 'error', msg: `❌ ${data.msg}` }])
        setAutoStatus('error')
        source.close()
      }
    }

    source.onerror = () => {
      setAutoSteps(prev => [...prev, { kind: 'error', msg: '❌ Mất kết nối với server' }])
      setAutoStatus('error')
      source.close()
    }
  }

  const create = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const cookie = `D1N=${d1n}; laravel_session=${laravelSession}`
      const payload = {
        network, pattern, x_csrf_token: csrfToken, cookie,
        proxy_session_id: proxySessionId, threads,
        no_proxy: (network === 'viettel' || network === 'vietnamobile') ? noProxy : false,
        isdn_type: network === 'viettel' ? isdnType : 2,
        token: network === 'vietnamobile' ? vnmToken.trim() : '',
      }
      console.group('[CREATE JOB]')
      console.debug('network:', network, '| pattern:', pattern, '| threads:', threads,
                    '| no_proxy:', payload.no_proxy, '| isdn_type:', payload.isdn_type,
                    '| token:', payload.token ? payload.token.slice(0, 8) + '…' : '(none)')
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

      {/* Proxy warning — hidden when user explicitly opted into no-proxy mode */}
      {!hasProxy && !((network === 'viettel' || network === 'vietnamobile') && noProxy) && (
        <div className="alert alert-warning">
          ⚠ Chưa cấu hình proxy — crawler sẽ không chạy được.{' '}
          <a href="/settings" style={{ color: 'inherit', fontWeight: 600 }}>Vào Settings để cấu hình.</a>{' '}
          Hoặc tick <strong>"Không dùng proxy"</strong> trong form Viettel / Vietnamobile bên dưới.
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
              <option value="vietnamobile">Vietnamobile</option>
            </select>

            {network === 'viettel' && (
              <>
                <input
                  className="form-input"
                  value={pattern}
                  onChange={e => setPattern(e.target.value)}
                  placeholder="0?????????"
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
                <select
                  className="form-select"
                  value={isdnType}
                  onChange={e => setIsdnType(Number(e.target.value))}
                  title="Loại SIM Viettel"
                >
                  <option value={2}>📱 Trả trước</option>
                  <option value={22}>💼 Trả sau</option>
                </select>
              </>
            )}
          </div>

          {network === 'viettel' && (
            <div style={{ marginBottom: 10 }}>
              {/* No-proxy toggle */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12, marginBottom: 10, cursor: 'pointer',
                background: noProxy ? 'rgba(227,160,8,0.08)' : 'transparent',
                border: `1px solid ${noProxy ? '#e3a008' : 'var(--border)'}`,
                borderRadius: 6, padding: '6px 10px',
              }}>
                <input type="checkbox" checked={noProxy}
                  onChange={e => setNoProxy(e.target.checked)} />
                <span style={{ fontWeight: 600 }}>🏠 Không dùng proxy</span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                  — gọi trực tiếp từ IP máy. {noProxy && 'Cảnh báo: dễ bị rate limit / chặn IP.'}
                </span>
              </label>

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
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    {/* Left: button + result summary */}
                    <div style={{ flexShrink: 0, minWidth: 220 }}>
                      <p className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
                        {noProxy
                          ? 'Tự động mở browser headless trực tiếp từ IP máy (không proxy). Session được cache 1 giờ.'
                          : 'Tự động mở browser headless qua proxy. Session được cache 1 giờ — không cần lấy lại mỗi lần.'}
                      </p>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-primary"
                          disabled={autoStatus === 'loading' || (!hasProxy && !noProxy)}
                          onClick={() => fetchAutoSession(false)}>
                          {autoStatus === 'loading' ? '⏳ Đang lấy…'
                            : autoStatus === 'ok'    ? '📦 Dùng lại session'
                            :                         '🤖 Lấy session tự động'}
                        </button>

                        {autoStatus === 'ok' && (
                          <button type="button" className="btn btn-ghost"
                            style={{ fontSize: 11, padding: '3px 8px' }}
                            disabled={autoStatus === 'loading' || (!hasProxy && !noProxy)}
                            onClick={() => fetchAutoSession(true)}>
                            🔄 Làm mới
                          </button>
                        )}
                      </div>

                      {autoStatus === 'ok' && (
                        <div style={{ fontSize: 11, color: 'var(--green)', lineHeight: 1.8 }}>
                          {cacheRemaining > 0 && (
                            <div style={{ color: 'var(--muted)', marginBottom: 3 }}>
                              ⏱ Còn hạn: <strong>{Math.floor(cacheRemaining / 60)}m {cacheRemaining % 60}s</strong>
                            </div>
                          )}
                          ✓ csrf: <code>{csrfToken.slice(0, 12)}…</code><br />
                          ✓ D1N: <code>{d1n.slice(0, 12)}…</code><br />
                          ✓ laravel: <code>{laravelSession.slice(0, 12)}…</code>
                        </div>
                      )}
                    </div>

                    {/* Right: live step log panel */}
                    {autoSteps.length > 0 && (
                      <div style={{
                        flex: 1, minWidth: 0,
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '8px 10px',
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 5 }}>
                          📡 Tiến trình backend
                        </div>
                        <div
                          ref={autoStepsRef}
                          style={{
                            fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.75,
                            maxHeight: 200, overflowY: 'auto',
                          }}
                        >
                          {autoSteps.map((s, i) => (
                            <div key={i} style={{
                              color: s.kind === 'error' ? 'var(--red)'
                                   : s.kind === 'done'  ? 'var(--green)'
                                   : s.msg.startsWith('✓') ? 'var(--green)'
                                   : s.msg.startsWith('⚠') ? 'var(--yellow, #e3a008)'
                                   : 'var(--text)',
                            }}>
                              {s.msg}
                            </div>
                          ))}
                          {autoStatus === 'loading' && (
                            <div style={{ color: 'var(--muted)' }}>▌</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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

          {network === 'vietnamobile' && (
            <div style={{ marginBottom: 10 }}>
              {/* No-proxy toggle */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12, marginBottom: 10, cursor: 'pointer',
                background: noProxy ? 'rgba(227,160,8,0.08)' : 'transparent',
                border: `1px solid ${noProxy ? '#e3a008' : 'var(--border)'}`,
                borderRadius: 6, padding: '6px 10px',
              }}>
                <input type="checkbox" checked={noProxy}
                  onChange={e => setNoProxy(e.target.checked)} />
                <span style={{ fontWeight: 600 }}>🏠 Không dùng proxy</span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                  — gọi trực tiếp từ IP máy. {noProxy && 'Cảnh báo: dễ bị rate limit / chặn IP.'}
                </span>
              </label>

              {/* Token input */}
              <div className="cookie-box">
                <div className="cookie-box-label">Vietnamobile token (URL ?token=...)</div>
                <input
                  className="form-input"
                  value={vnmToken}
                  onChange={e => setVnmToken(e.target.value)}
                  placeholder="9bfa6b5f7531591e598e76ecc15c0344"
                  style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 11 }}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Mở <code>shop.vietnamobile.com.vn</code> → DevTools → Network → tìm request{' '}
                  <code>index.php?controller=contact&token=...</code> → copy giá trị token.
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                Crawler tự seed 10 prefix (0-9). Threshold = 10 — pattern nào trả ≥10 số sẽ tự chia nhỏ tiếp.
              </div>
            </div>
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
            disabled={
              busy
              || (!hasProxy && !((network === 'viettel' || network === 'vietnamobile') && noProxy))
              || (network === 'viettel' && (!csrfToken.trim() || !d1n.trim() || !laravelSession.trim()))
              || (network === 'vietnamobile' && !vnmToken.trim())
            }>
            {busy ? 'Đang tạo…' : '🚀 Start Job'}
          </button>
        </form>
      </div>

      {/* Live log monitor — one panel per running/paused job */}
      <LiveLogMonitor jobs={jobs} />

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
