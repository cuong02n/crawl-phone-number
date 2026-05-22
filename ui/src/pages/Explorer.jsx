import { useState, useEffect, useCallback } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'

const PRESETS = [
  'Tứ quý (xxxx)',
  'Ngũ quý (xxxxx)',
  'Taxi (abcabc)',
  'Lặp đôi (aabbcc)',
  'Sảnh xyzxyz',
  'Sảnh xyztxyzt',
  'Tiến đều (4 số cuối)',
  'Sảnh tiến (>=4 số)',
  'Toàn số chẵn',
  '0abxabyabz',
  '0abxab(x+1)ab(x+2)',
  '0abxab(x-1)ab(x-2)',
]

export default function Explorer() {
  const [searchParams]          = useSearchParams()
  const [files, setFiles]       = useState([])
  const [selected, setSelected] = useState('')
  const [activePresets, setActivePresets] = useState([])
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const preview = useCallback(async (file, presets) => {
    if (!file) return
    setLoading(true)
    try {
      const r = await api.previewData({ file, presets, limit: 200 })
      setResult(r)
    } catch (e) {
      alert('Lỗi: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadFiles = useCallback(async (keepSelected) => {
    const list = await api.listFiles().catch(() => [])
    setFiles(list)
    return list
  }, [])

  // Initial load: honour ?file= param or default to first file
  useEffect(() => {
    const fileParam = searchParams.get('file')
    loadFiles().then(list => {
      if (list.length === 0) return
      const paths = list.map(f => f.path)
      const toSelect = fileParam && paths.includes(fileParam)
        ? fileParam
        : list[0].path
      setSelected(toSelect)
      preview(toSelect, [])
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = (path) => {
    setSelected(path)
    setResult(null)
    preview(path, activePresets)
  }

  const handlePreset = (name) => {
    const next = activePresets.includes(name)
      ? activePresets.filter(p => p !== name)
      : [...activePresets, name]
    setActivePresets(next)
    preview(selected, next)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    const list = await loadFiles()
    setRefreshing(false)
    // Re-run preview if selected file still exists
    if (selected && list.some(f => f.path === selected)) {
      preview(selected, activePresets)
    } else if (list.length > 0) {
      setSelected(list[0].path)
      preview(list[0].path, activePresets)
    }
  }

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

        {/* Filter presets — multi-select, click to toggle */}
        <div className="card-title" style={{ marginBottom: 8 }}>
          🎯 Bộ lọc số đẹp
          {activePresets.length > 0 && (
            <button className="btn btn-ghost" style={{ marginLeft: 10, padding: '1px 8px', fontSize: 11 }}
              onClick={() => { setActivePresets([]); preview(selected, []) }}>
              Xóa bộ lọc ({activePresets.length})
            </button>
          )}
        </div>
        <div className="preset-grid">
          {PRESETS.map(name => (
            <label
              key={name}
              className={`preset-chip${activePresets.includes(name) ? ' on' : ''}`}
              onClick={() => handlePreset(name)}
            >
              {name}
            </label>
          ))}
        </div>
        {activePresets.length > 1 && (
          <p className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
            Đang lọc AND: số phải khớp tất cả {activePresets.length} điều kiện.
          </p>
        )}

        {/* Results */}
        {loading && <p className="muted" style={{ marginTop: 12 }}>Đang lọc…</p>}

        {!loading && result && (
          <>
            <div className="result-bar">
              <strong>{result.filtered_count.toLocaleString()}</strong>
              <span className="muted">kết quả</span>
              <span className="muted">/</span>
              <span className="muted">{result.total_count.toLocaleString()} tổng</span>
              {activePresets.length > 0 && result.numbers.length < result.filtered_count && (
                <span className="muted" style={{ fontSize: 12 }}>
                  (hiển thị 200 đầu)
                </span>
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
