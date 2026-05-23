const B = '/api'

// Read response body for error detail before throwing
const json = async (res) => {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body.detail) detail = `${res.status}: ${body.detail}`
    } catch {}
    console.error('[API error]', res.url, detail)
    throw new Error(detail)
  }
  return res.json()
}

const post = (url, body) => {
  console.debug('[API POST]', url, body !== undefined ? body : '(no body)')
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json)
}

const del = (url) =>
  fetch(url, { method: 'DELETE' }).then(json)

const get = (url) => {
  console.debug('[API GET]', url)
  return fetch(url).then(json)
}

export const api = {
  // Config
  getConfig:  ()     => get(`${B}/config`),
  saveConfig: (data) => post(`${B}/config`, data),

  // Viettel auto-session
  viettelAutoSession: () => post(`${B}/viettel/auto-session`, {}),

  // Stats
  getStats: () => get(`${B}/stats`),

  // Jobs
  listJobs:          ()              => get(`${B}/jobs`),
  createJob:         (data)          => post(`${B}/jobs`, data),
  pauseJob:          (id)            => post(`${B}/jobs/${id}/pause`),
  resumeJob:         (id, data)      => post(`${B}/jobs/${id}/resume`, data ?? {}),
  setJobThreads:     (id, threads)   => post(`${B}/jobs/${id}/threads`, { threads }),
  retryJob:          (id)            => post(`${B}/jobs/${id}/retry`),
  deleteJob:         (id)            => del(`${B}/jobs/${id}`),
  getLog:            (id, lines = 80) => get(`${B}/jobs/${id}/log?lines=${lines}`),
  getFailedPatterns: (id)            => get(`${B}/jobs/${id}/failed-patterns`),

  // Feed
  getRecentNumbers: (limit = 60) => get(`${B}/feed/recent?limit=${limit}`),

  // Data / Explorer
  listFiles:   ()     => get(`${B}/data/files`),
  previewData: (data) => post(`${B}/data/preview`, data),
  downloadUrl: (path) => `${B}/data/download?path=${encodeURIComponent(path)}`,
}
