import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'
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
  const [files, setFiles]       = useState([])
  const [selected, setSelected] = useState('')
  const [preset, setPreset]     = useState('')
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    api.listFiles().then(list => {
      setFiles(list)
      if (list.length > 0) setSelected(list[0].path)
    }).catch(() => {})
  }, [])

  const preview = async (file, activePreset) => {
    if (!file) return
    setLoading(true)
    try {
      const r = await api.previewData({
        file,
        presets: activePreset ? [activePreset] : [],
        limit: 200,
      })
      setResult(r)
    } catch (e) {
      alert('Lỗi: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (path) => {
    setSelected(path)
    setResult(null)
    preview(path, preset)
  }

  const handlePreset = (name) => {
    const next = preset === name ? '' : name
    setPreset(next)
    preview(selected, next)
  }

  return (
    <div>
      <h1 className="page-title">Data Explorer</h1>

      <div className="card">
        {/* File selector + download */}
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

          {selected && (
            <a className="btn btn-ghost" href={api.downloadUrl(selected)} download>
              <Download size={13} /> Download
            </a>
          )}
        </div>

        {/* Filter presets — single select, click to apply */}
        <div className="card-title">🎯 Bộ lọc số đẹp</div>
        <div className="preset-grid">
          {PRESETS.map(name => (
            <label
              key={name}
              className={`preset-chip${preset === name ? ' on' : ''}`}
              onClick={() => handlePreset(name)}
            >
              {name}
            </label>
          ))}
        </div>

        {/* Results */}
        {loading && <p className="muted" style={{ marginTop: 12 }}>Đang lọc…</p>}

        {!loading && result && (
          <>
            <div className="result-bar">
              <strong>{result.filtered_count.toLocaleString()}</strong>
              <span className="muted">kết quả</span>
              <span className="muted">/</span>
              <span className="muted">{result.total_count.toLocaleString()} tổng</span>
              {preset && result.numbers.length < result.filtered_count && (
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
