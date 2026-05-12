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
  const [jobs, setJobs]       = useState([])
  const [network, setNetwork] = useState('viettel')
  const [pattern, setPattern] = useState('09????????')
  const [busy, setBusy]       = useState(false)

  const refresh = useCallback(async () => {
    try { setJobs(await api.listJobs()) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [refresh])

  const create = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.createJob({ network, pattern })
      await refresh()
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

      {/* Create form */}
      <div className="card create-card">
        <div className="card-title">➕ Tạo Job mới</div>
        <form className="form-row" onSubmit={create}>
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

          {network === 'vnpt' && (
            <span className="muted" style={{ fontSize: 12 }}>
              VNPT tự crawl toàn bộ prefix 082, 085, 088, 091, 094
            </span>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy}>
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
