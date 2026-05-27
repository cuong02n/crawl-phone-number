import { useState, useEffect, useCallback, useRef } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'

// ── Preset definitions ─────────────────────────────────────────────────────────

// Static presets: name must match backend PRESETS dict keys exactly
const STATIC_PRESETS = [
  { group: 'Tứ quý / Ngũ quý', items: [
    'Tứ quý (xxxx)',
    'Tứ quý ở cuối',
    'Ngũ quý (xxxxx)',
  ]},
  { group: 'Lặp / Taxi', items: [
    'Taxi (abcabc)',
    'Lặp đôi (aabbcc)',
  ]},
  { group: 'Sảnh lặp', items: [
    'Sảnh xyzxyz',
    'Sảnh xyzxyz ở cuối',
    'Sảnh xyztxyzt',
    'Sảnh xyztxyzt ở cuối',
  ]},
  { group: 'Sảnh tiến', items: [
    'Tiến đều (4 số cuối)',
    'Tiến đều bước 2 (5 số cuối)',
    'Sảnh tiến (>=4 số)',
    'Sảnh tiến ở cuối',
  ]},
  { group: 'Đặc biệt', items: [
    'Toàn số chẵn',
    '0abxabyabz',
    '0abxab(x+1)ab(x+2)',
    '0abxab(x-1)ab(x-2)',
    '0abcabcabc',
    '0axaayaaza',
    '0xaxbxcxdx',
  ]},
  { group: 'Số ít chữ số (ngoài 0)', items: [
    'Chỉ 2 số (ngoài 0)',
    'Chỉ 3 số (ngoài 0)',
  ]},
]

// Parametric presets: user supplies a value; backend key = "key:value"
const PARAM_PRESETS = [
  {
    key:         'Tứ quý cuối',
    label:       'Tứ quý X ở cuối',
    description: 'Số kết thúc bằng XXXX (ví dụ: 8888)',
    placeholder: '0–9',
    maxLength:   1,
    isValid:     (v) => /^\d$/.test(v),
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

const isParamKey = (name) => PARAM_PRESETS.some(p => name.startsWith(`${p.key}:`))

function resolvePresets(active, paramInputs) {
  return active.filter(name => {
    if (!isParamKey(name)) return true
    const key = name.slice(0, name.indexOf(':'))
    const val = name.slice(key.length + 1)
    const def = PARAM_PRESETS.find(p => p.key === key)
    return def ? def.isValid(val) : false
  })
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Explorer() {
  const [searchParams]            = useSearchParams()
  const [files, setFiles]         = useState([])
  const [selected, setSelected]   = useState('')
  const [activePresets, setActivePresets] = useState([])  // both static names and "key:val" for param
  const [paramInputs, setParamInputs]     = useState({})  // { key: value } — independent of active
  const [result, setResult]       = useState(null)
  const [loading, setLoading]     = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]         = useState('')
  const [fetchAll, setFetchAll]   = useState(false)

  // Cancel in-flight request when a new one starts; ignore stale responses.
  const abortRef  = useRef(null)
  const reqIdRef  = useRef(0)

  // preview takes already-resolved presets (filtered for validity)
  const preview = useCallback(async (file, resolved) => {
    if (!file) return

    // Cancel any previous request so the latest click wins
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const reqId = ++reqIdRef.current

    setLoading(true)
    setError('')
    try {
      const r = await api.previewData(
        { file, presets: resolved, limit: fetchAll ? 0 : 200 },
        { signal: controller.signal },
      )
      if (reqId === reqIdRef.current) setResult(r)
    } catch (e) {
      if (e.name === 'AbortError') return  // superseded by newer request — silent
      if (reqId === reqIdRef.current) {
        console.error('[preview failed]', e)
        setError(e.message || 'Lỗi không xác định')
      }
    } finally {
      if (reqId === reqIdRef.current) setLoading(false)
    }
  }, [fetchAll])

  const loadFiles = useCallback(() => api.listFiles().catch(() => []), [])

  // Initial load: honour ?file= param or default to first file
  useEffect(() => {
    const fileParam = searchParams.get('file')
    loadFiles().then(list => {
      setFiles(list)
      if (list.length === 0) return
      const paths = list.map(f => f.path)
      const toSelect = fileParam && paths.includes(fileParam) ? fileParam : list[0].path
      setSelected(toSelect)
      preview(toSelect, [])
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Preset toggle helpers ────────────────────────────────────────────────────

  const isStaticActive = (name) => activePresets.includes(name)
  const isParamActive  = (key)  => activePresets.some(p => p.startsWith(`${key}:`))

  const toggleStatic = (name) => {
    const next = isStaticActive(name)
      ? activePresets.filter(p => p !== name)
      : [...activePresets, name]
    setActivePresets(next)
    preview(selected, resolvePresets(next, paramInputs))
  }

  const toggleParam = (key) => {
    if (isParamActive(key)) {
      const next = activePresets.filter(p => !p.startsWith(`${key}:`))
      setActivePresets(next)
      preview(selected, resolvePresets(next, paramInputs))
    } else {
      const val = paramInputs[key] || ''
      const next = [...activePresets, `${key}:${val}`]
      setActivePresets(next)
      preview(selected, resolvePresets(next, paramInputs))
    }
  }

  const updateParamInput = (key, val) => {
    const newInputs = { ...paramInputs, [key]: val }
    setParamInputs(newInputs)
    if (isParamActive(key)) {
      const next = activePresets.map(p => p.startsWith(`${key}:`) ? `${key}:${val}` : p)
      setActivePresets(next)
      preview(selected, resolvePresets(next, newInputs))
    }
  }

  const clearAll = () => {
    setActivePresets([])
    preview(selected, [])
  }

  // ── File handlers ────────────────────────────────────────────────────────────

  const handleFileChange = (path) => {
    setSelected(path)
    setResult(null)
    preview(path, resolvePresets(activePresets, paramInputs))
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    const list = await loadFiles()
    setFiles(list)
    setRefreshing(false)
    const stillExists = list.some(f => f.path === selected)
    const nextFile = stillExists ? selected : (list.length > 0 ? list[0].path : '')
    if (!stillExists && nextFile) setSelected(nextFile)
    if (nextFile) preview(nextFile, resolvePresets(activePresets, paramInputs))
  }

  const totalActive = activePresets.length

  return (
    <div>
      <h1 className="page-title">Data Explorer</h1>

      <div className="card">
        {/* File selector + download + refresh */}
        <div className="explorer-row">
          <select
            className="form-select"
            style={{ flex: 1, maxWidth: 420 }}
            value={selected}
            onChange={e => handleFileChange(e.target.value)}
          >
            {files.length === 0 && <option>Chưa có file CSV...</option>}
            {files.map(f => (
              <option key={f.path} value={f.path}>
                {f.name}  ({(f.size / 1024).toFixed(1)} KB)
              </option>
            ))}
          </select>

          <button className="btn btn-ghost" onClick={handleRefresh} disabled={refreshing}
            title="Tải lại danh sách file">
            <RefreshCw size={13} style={refreshing ? { animation: 'spin 0.8s linear infinite' } : undefined} />
            {refreshing ? 'Đang tải...' : 'Refresh'}
          </button>

          {selected && (
            <a className="btn btn-ghost" href={api.downloadUrl(selected)} download>
              <Download size={13} /> Download
            </a>
          )}
        </div>

        {/* Filter presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>🎯 Bộ lọc số đẹp</div>
          {totalActive > 0 && (
            <>
              <span className="muted" style={{ fontSize: 11 }}>
                {totalActive} đang bật {totalActive > 1 ? '(AND)' : ''}
              </span>
              <button className="btn btn-ghost" style={{ padding: '1px 8px', fontSize: 11 }}
                onClick={clearAll}>
                Xóa tất cả
              </button>
            </>
          )}
        </div>

        {STATIC_PRESETS.map(({ group, items }) => (
          <div key={group} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em',
                          textTransform: 'uppercase', marginBottom: 5 }}>
              {group}
            </div>
            <div className="preset-grid" style={{ marginBottom: 0 }}>
              {items.map(name => (
                <label key={name}
                  className={`preset-chip${isStaticActive(name) ? ' on' : ''}`}
                  onClick={() => toggleStatic(name)}>
                  {name}
                </label>
              ))}
            </div>
          </div>
        ))}

        {/* Parametric presets */}
        {PARAM_PRESETS.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em',
                          textTransform: 'uppercase', marginBottom: 5 }}>
              Tùy chỉnh
            </div>
            <div className="preset-grid" style={{ marginBottom: 0 }}>
              {PARAM_PRESETS.map(({ key, label, placeholder, maxLength, isValid }) => {
                const active = isParamActive(key)
                const val    = paramInputs[key] || ''
                const valid  = !active || isValid(val)
                return (
                  <label key={key}
                    className={`preset-chip param-chip${active ? ' on' : ''}${active && !valid ? ' invalid' : ''}`}
                    onClick={() => toggleParam(key)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {label}
                    {active && (
                      <>
                        {' = '}
                        <input
                          type="text"
                          value={val}
                          maxLength={maxLength}
                          placeholder={placeholder}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateParamInput(key, e.target.value)}
                          style={{
                            width: 28, padding: '0 3px', textAlign: 'center',
                            background: 'transparent',
                            border: `1px solid ${valid ? 'currentColor' : 'var(--red)'}`,
                            borderRadius: 3, color: valid ? 'inherit' : 'var(--red)',
                            fontSize: 11, fontFamily: 'var(--mono)',
                            outline: 'none',
                          }}
                        />
                      </>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* Fetch all toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
            <input type="checkbox" checked={fetchAll} onChange={e => setFetchAll(e.target.checked)} />
            Lấy hết (không giới hạn 200)
          </label>
        </div>

        {/* Results */}
        {loading && <p className="muted" style={{ marginTop: 12 }}>Đang lọc…</p>}

        {error && !loading && (
          <div className="alert alert-error" style={{ marginTop: 12, fontSize: 12 }}>
            ❌ Lỗi: {error}
            <button className="btn btn-ghost" style={{ marginLeft: 10, padding: '2px 8px', fontSize: 11 }}
              onClick={() => preview(selected, resolvePresets(activePresets, paramInputs))}>
              Thử lại
            </button>
          </div>
        )}

        {!loading && !error && result && (
          <>
            <div className="result-bar">
              <strong>{result.filtered_count.toLocaleString()}</strong>
              <span className="muted">kết quả</span>
              <span className="muted">/</span>
              <span className="muted">{result.total_count.toLocaleString()} tổng</span>
              {!fetchAll && totalActive > 0 && result.numbers.length < result.filtered_count && (
                <span className="muted" style={{ fontSize: 12 }}>(hiển thị 200 đầu)</span>
              )}
            </div>

            {result.numbers.length === 0 ? (
              <p className="muted">Không tìm thấy số nào khớp bộ lọc.</p>
            ) : (
              <div className="number-grid">
                {result.numbers.map((n, i) => (
                  <code key={i} className="number-chip">{n}</code>
                ))}
              </div>
            )}
          </>
        )}

        {files.length === 0 && (
          <p className="muted" style={{ marginTop: 8 }}>
            Chưa có file dữ liệu. Hãy chạy crawler để thu thập số.
          </p>
        )}
      </div>
    </div>
  )
}
