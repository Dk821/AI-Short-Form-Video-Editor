// Where the API lives.
//
// Default '/api' (a same-origin relative path) is correct in BOTH modes and
// is why nothing else in the frontend needed touching:
//   * dev      — vite.config.js proxies /api to http://localhost:8000
//   * desktop  — the FastAPI process serves this built app itself, so the
//                page origin IS the backend, on whatever port Electron
//                picked for it that launch.
// VITE_API_URL overrides it at build time for the cases that need an
// absolute URL (pointing a dev UI at a backend on another host, or serving
// the frontend from something other than the backend).
const BASE = import.meta.env.VITE_API_URL || '/api'

// Server-relative paths the API hands back (asset.servedPath, a job's
// outputUrl) are already correct against a same-origin BASE. When BASE is
// absolute they have to be re-anchored to that server instead of to
// whatever host is showing the page.
const API_ORIGIN = /^https?:\/\//i.test(BASE) ? new URL(BASE).origin : ''

function absolute(path) {
  if (!path) return ''
  if (/^(https?:|blob:|data:)/i.test(path)) return path
  if (!API_ORIGIN) return path
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`
}

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
  startExport: (id, { format = 'mp4', quality = 'standard', frameRate } = {}) => {
    const params = { format, quality }
    if (frameRate) params.frameRate = frameRate
    return fetch(`${BASE}/projects/${id}/export?${new URLSearchParams(params)}`, { method: 'POST' }).then(j)
  },
  getExportStatus: (jobId) => fetch(`${BASE}/renders/${jobId}`).then(j),
  downloadUrl: (path) => absolute(path),
  assetUrl: (asset) => absolute(asset?.servedPath || ''),

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

  // Desktop build — per-user API keys, stored by the backend in the user's
  // own data directory. Secrets are write-only: getSettings reports whether
  // each key is set and its last four characters, never the key itself, so
  // nothing sensitive is ever handed to the renderer process.
  getSettings: () => fetch(`${BASE}/settings`).then(j),
  updateSettings: (values) =>
    fetch(`${BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    }).then(j),

  // Font manifest — read-only mirror of registry.json, used only by
  // preloadCoreFonts() (src/lib/captionLayout.js) to eagerly load the
  // app's general UI typefaces (Inter/Space Grotesk, via Tailwind's
  // font classes) at startup. NOT used for caption layout any more —
  // see getCaptionLayout below.
  getFontManifest: () => fetch(`${BASE}/font-manifest`).then(j),
  // relPath is a manifest entry's value, e.g. "Montserrat/Montserrat-700.ttf" —
  // relative to the /api/fonts static mount (see backend/app/main.py).
  fontFileUrl: (relPath) => absolute(`/api/fonts/${relPath}`),

  // Canonical caption layout — THE single source of truth for caption
  // line breaks, word positions and typography (see
  // backend/app/caption_layout.py's module docstring). Posts the exact
  // TimelineItem + canvas size render.py's FFmpeg export already lays
  // out from, and gets back the identical computed geometry: no Canvas
  // measureText(), no word-wrap logic, and no font-fallback ladder of
  // any kind runs in the browser any more — src/lib/captionLayout.js's
  // fetchCaptionLayout() renders this response verbatim.
  getCaptionLayout: (item, width, height) =>
    fetch(`${BASE}/captions/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item, width, height }),
    }).then(j),
}
