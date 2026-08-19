const BASE = '/api'

async function j(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    let message = text
    try {
      message = JSON.parse(text).detail || text
    } catch {
      // not JSON — use raw text
    }
    throw new Error(message)
  }
  return res.json()
}

export const api = {
  createProject: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return fetch(`${BASE}/projects?${q}`, { method: 'POST' }).then(j)
  },
  listProjects: () => fetch(`${BASE}/projects`).then(j),
  renameProject: (id, name) =>
    fetch(`${BASE}/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(j),
  deleteProject: (id) => fetch(`${BASE}/projects/${id}`, { method: 'DELETE' }).then(j),
  // Template System
  listTemplates: (category) => {
    const q = category ? `?category=${encodeURIComponent(category)}` : ''
    return fetch(`${BASE}/templates${q}`).then(j)
  },
  getTemplate: (templateId) => fetch(`${BASE}/templates/${templateId}`).then(j),
  applyTemplate: (projectId, templateId, regenerateCaptions = true) =>
    fetch(`${BASE}/projects/${projectId}/apply-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId, regenerateCaptions }),
    }).then(j),
  // B-roll Library — search/browse (no download) + attach (downloads the pick)
  searchBroll: (query, page = 1) =>
    fetch(`${BASE}/broll/search?${new URLSearchParams({ query: query || '', page })}`).then(j),
  attachBroll: (projectId, body) =>
    fetch(`${BASE}/projects/${projectId}/broll/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),

  getProject: (id) => fetch(`${BASE}/projects/${id}`).then(j),
  saveTimeline: (id, timeline) =>
    fetch(`${BASE}/projects/${id}/timeline`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(timeline),
    }).then(j),
  uploadAsset: (id, file) => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`${BASE}/projects/${id}/upload`, { method: 'POST', body: form }).then(j)
  },
  startExport: (id) => fetch(`${BASE}/projects/${id}/export`, { method: 'POST' }).then(j),
  getExportStatus: (jobId) => fetch(`${BASE}/renders/${jobId}`).then(j),
  downloadUrl: (path) => path,
  assetUrl: (asset) => asset?.servedPath || '',

  // Milestone 2 — transcription + caption templates
  transcribe: (projectId, assetId, language) => {
    const q = new URLSearchParams({ assetId, ...(language ? { language } : {}) }).toString()
    return fetch(`${BASE}/projects/${projectId}/transcribe?${q}`, { method: 'POST' }).then(j)
  },
  getCaptionTemplates: () => fetch(`${BASE}/caption-templates`).then(j),
  generateCaptions: (projectId, templateId, wordsPerCaption, replaceExisting = true) =>
    fetch(`${BASE}/projects/${projectId}/captions/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId, wordsPerCaption, replaceExisting }),
    }).then(j),

  // Milestone 3 — Gemini auto-edit
  runAutoEdit: (projectId) => fetch(`${BASE}/projects/${projectId}/auto-edit`, { method: 'POST' }).then(j),
}
