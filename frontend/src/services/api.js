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
    // `new URLSearchParams({ templateId: undefined })` does NOT drop the
    // key — it stringifies the value, so an omitted templateId (the
    // "Generate Captions"/"Blank Project" flows, and createFromTemplate()
    // called with no id) becomes the literal query string
    // "templateId=undefined". The backend then looks that up as a real
    // template id, finds nothing, and 404s with "Unknown template
    // 'undefined'" — even though no template was ever meant to be sent.
    // Stripping undefined/null entries first is what actually omits the key.
    const cleaned = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    )
    const q = new URLSearchParams(cleaned).toString()
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
  getTemplateConfig: (projectId) => fetch(`${BASE}/projects/${projectId}/template-config`).then(j),
  // B-roll Library — search/browse (no download) + attach (downloads the
  // pick, or reuses an already-uploaded assetId — see routers/broll.py).
  // `media` picks which Pexels endpoint the Image Search / Video Search
  // tabs hit; Upload Local never calls this (it goes straight to
  // uploadAsset below, then attachBroll with an assetId).
  searchBroll: (query, { media = 'video', page = 1 } = {}) =>
    fetch(`${BASE}/broll/search?${new URLSearchParams({ query: query || '', media, page })}`).then(j),
  attachBroll: (projectId, body) =>
    fetch(`${BASE}/projects/${projectId}/broll/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),

  getProject: (id) => fetch(`${BASE}/projects/${id}`).then(j),
  setCover: (id, time) =>
    fetch(`${BASE}/projects/${id}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time }),
    }).then(j),
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
  // `engine` picks the renderer: 'ffmpeg' (default, local, every format)
  // or 'shotstack' (cloud, mp4 only). The Shotstack API key lives only in
  // backend/.env and is never sent to or read by the browser.
  startExport: (id, { format = 'mp4', quality = 'standard', frameRate, engine = 'ffmpeg' } = {}) => {
    const params = { format, quality, engine }
    if (frameRate) params.frameRate = frameRate
    return fetch(`${BASE}/projects/${id}/export?${new URLSearchParams(params)}`, { method: 'POST' }).then(j)
  },
  listExportEngines: () => fetch(`${BASE}/export/engines`).then(j),
  // Dry-run the Shotstack validation so the panel can warn about anything
  // that won't survive the conversion before a render is actually spent.
  exportPreflight: (id) =>
    fetch(`${BASE}/projects/${id}/export/preflight`, { method: 'POST' }).then(j),
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
  // "AI Stress Text Highlighter" — enabled: true runs detection over every
  // current caption line and returns the updated timeline; false clears it
  // (the style itself lives on the caption items directly and is saved
  // through the normal saveTimeline path, same as the base caption style).
  setStressHighlight: (projectId, enabled) =>
    fetch(`${BASE}/projects/${projectId}/captions/stress-highlight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).then(j),

  // Milestone 3 — Gemini auto-edit
  // mode omitted -> apply every AI decision (zoom + b-roll together, the
  // original behavior); mode 'zoom' or 'broll' -> the backend only applies
  // moments of that one type, so the other track is never touched (see
  // routers/auto_edit.py's _MODE_MOMENT_TYPE).
  runAutoEdit: (projectId, mode) => {
    const q = mode ? `?${new URLSearchParams({ mode })}` : ''
    return fetch(`${BASE}/projects/${projectId}/auto-edit${q}`, { method: 'POST' }).then(j)
  },

  // SFX Library — bundled placeholder sounds (see backend/app/sfx/library/
  // README.txt). No search step needed (the whole catalog is already
  // bundled), so this is catalog-fetch + attach, same two calls as B-roll
  // minus the download round-trip.
  getSfxCatalog: () => fetch(`${BASE}/sfx`).then(j),
  attachSfx: (projectId, body) =>
    fetch(`${BASE}/projects/${projectId}/sfx/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j),
}
