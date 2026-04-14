import { useState, useEffect } from 'react'

function App() {
  const [proxyConfig, setProxyConfig] = useState({ proxy_dns: '', username: '', password: '' })
  const [status, setStatus] = useState('Idle')

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setProxyConfig(data))
      .catch(err => console.error(err))
  }, [])

  const handleConfigChange = (e) => {
    setProxyConfig({ ...proxyConfig, [e.target.name]: e.target.value })
  }

  const saveConfig = () => {
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyConfig)
    }).then(() => alert('Config saved!'))
  }

  const startCrawler = (network) => {
    fetch(`/api/crawl/start/${network}`, { method: 'POST' })
      .then(res => res.json())
      .then(data => setStatus(`Crawling ${network} in background...`))
  }

  return (
    <div className="dashboard">
      <div className="header">
        <h1>Sim Crawler Dashboard</h1>
        <p style={{ color: 'var(--text-muted)' }}>Network Status: <span style={{color: status === 'Idle' ? '#94a3b8' : '#34d399', fontWeight: 600}}>{status}</span></p>
      </div>

      <div className="grid">
        <div className="glass-panel">
          <h3>Proxy Configuration</h3>
          <div className="form-group">
            <label>DNS Proxy address mapping</label>
            <input name="proxy_dns" value={proxyConfig.proxy_dns} onChange={handleConfigChange} placeholder="ip:port" />
          </div>
          <div className="form-group">
            <label>Username</label>
            <input name="username" value={proxyConfig.username} onChange={handleConfigChange} />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input name="password" type="password" value={proxyConfig.password} onChange={handleConfigChange} />
          </div>
          <button className="btn" onClick={saveConfig} style={{width: '100%', marginTop: '0.5rem'}}>Save Configuration</button>
        </div>

        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3>Crawler Controls</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: '1.5' }}>
            Control the background scraping process. Ensure your proxy is saved and working before starting multiple threads.
          </p>
          <button className="btn btn-success" onClick={() => startCrawler('viettel')}>Start Viettel Crawler</button>
          <button className="btn btn-success" onClick={() => startCrawler('vnpt')}>Start VNPT Crawler</button>
          <button className="btn" style={{ background: '#ef4444' }} onClick={() => setStatus('Idle')}>Stop Running Tasks</button>
        </div>
      </div>
    </div>
  )
}

export default App
