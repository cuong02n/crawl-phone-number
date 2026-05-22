const B = '/api'

const json = (res) => {
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json)

export const api = {
  // Config
  getConfig:  ()     => fetch(`${B}/config`).then(json),
  saveConfig: (data) => post(`${B}/config`, data),

  // Viettel auto-session
  viettelAutoSession: () => post(`${B}/viettel/auto-session`, {}),

  // Stats
  getStats: () => fetch(`${B}/stats`).then(json),

  // Jobs
  listJobs:          ()     => fetch(`${B}/jobs`).then(json),
  createJob:         (data) => post(`${B}/jobs`, data),
  pauseJob:          (id)         => post(`${B}/jobs/${id}/pause`),
  resumeJob:         (id, data)   => post(`${B}/jobs/${id}/resume`, data ?? {}),
  setJobThreads:     (id, threads) => post(`${B}/jobs/${id}/threads`, { threads }),
  retryJob:          (id)         => post(`${B}/jobs/${id}/retry`),
  deleteJob:         (id)   => fetch(`${B}/jobs/${id}`, { method: 'DELETE' }).then(json),
  getLog:            (id, lines = 80) => fetch(`${B}/jobs/${id}/log?lines=${lines}`).then(json),
  getFailedPatterns: (id)   => fetch(`${B}/jobs/${id}/failed-patterns`).then(json),

  // Feed
  getRecentNumbers: (limit = 60) => fetch(`${B}/feed/recent?limit=${limit}`).then(json),

  // Data / Explorer
  listFiles:   ()     => fetch(`${B}/data/files`).then(json),
  previewData: (data) => post(`${B}/data/preview`, data),
  downloadUrl: (path) => `${B}/data/download?path=${encodeURIComponent(path)}`,
}
