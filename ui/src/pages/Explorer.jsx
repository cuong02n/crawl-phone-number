import { useState, useEffect } from 'react'
import { Search, Download } from 'lucide-react'
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
]

export default function Explorer() {
  const [files, setFiles]       = useState([])
  const [selected, setSelected] = useState('')
  const [presets, setPresets]   = useState([])
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    api.listFiles().then(list => {
      setFiles(list)
      if (list.length > 0) setSelected(list[0].path)
    }).catch(() => {})
  }, [])

  const toggle = (name) =>
    setPresets(p => p.includes(name) ? p.filter(x => x !== name) : [...p, name])

  const preview = async () => {
    if (!selected) return
    setLoading(true)
    try {
      const r = await api.previewData({ file: selected, presets, limit: 200 })
      setResult(r)
    } catch (e) {
      alert('Lỗi: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const selectedFile = files.find(f => f.path === selected)

  return (
    <div>
      <h1 className="page-title">Data Explorer</h1>

      <div className="card">
        {/* File selector + actions */}
        <div className="explorer-row">
          <select
            className="form-select"
            style={{ flex: 1, maxWidth: 420 }}
            value={selected}
            onChange={e => { setSelected(e.target.value); setResult(null) }}
          >
            {files.length === 0 && <option>Chưa có file CSV...</option>}
            {files.map(f => (
              <option key={f.path} value={f.path}>
                {f.name}  ({(f.size / 1024).toFixed(1)} KB)
              </option>
            ))}
          </select>

          <button className="btn btn-primary" onClick={preview} disabled={loading || !selected}>
            <Search size={13} />
            {loading ? 'Đang lọc…' : 'Lọc & xem'}
          </button>

          {selected && (
            <a className="btn btn-ghost" href={api.downloadUrl(selected)} download>
              <Download size={13} /> Download
            </a>
          )}
        </div>

        {/* Filter presets */}
        <div className="card-title">🎯 Bộ lọc số đẹp — chọn một hoặc nhiều</div>
        <div className="preset-grid">
          {PRESETS.map(name => (
            <label
              key={name}
              className={`preset-chip${presets.includes(name) ? ' on' : ''}`}
              onClick={() => toggle(name)}
            >
              {name}
            </label>
          ))}
        </div>

        {/* Results */}
        {result && (
          <>
            <div className="result-bar">
              <strong>{result.filtered_count.toLocaleString()}</strong>
              <span className="muted">kết quả</span>
              <span className="muted">/</span>
              <span className="muted">{result.total_count.toLocaleString()} tổng</span>
              {presets.length > 0 && result.numbers.length < result.filtered_count && (
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
