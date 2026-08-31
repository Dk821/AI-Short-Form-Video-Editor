import { create } from 'zustand'
import { api } from '../services/api'
import { segmentTranscriptIntoScenes, splitCaptionAtWord, mergeCaptionItems } from '../utils/transcript'

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export const useEditorStore = create((set, get) => ({
  projectId: null,
  project: null,
  timeline: null,
  assets: [],
  selectedItemId: null,
  currentTime: 0,
  isPlaying: false,
  exportJob: null,
  exportPanelOpen: false,
  exportFormat: 'mp4', // 'mp4' | 'webm' | 'gif' — the export panel's 3 format options
  exportQuality: 'standard', // 'draft' | 'standard' | 'high'
  exportFrameRate: null, // null = match the project's own fps; otherwise 24 | 30 | 60
  exportEngine: 'ffmpeg', // 'ffmpeg' (local, all formats) | 'shotstack' (cloud, mp4)
  exportEngines: null,    // populated from /api/export/engines
  exportPreflight: null,  // { ok, errors, warnings } from the Shotstack dry-run
  isSavingProject: false, // Toolbar's explicit "Save" button — see saveProject()
  saveError: null,
  status: 'idle', // idle | loading | ready | error
  error: null,

  // Template System state
  templates: [],
  isApplyingTemplate: false,
  applyTemplateError: null,
  templateLibraryOpen: false,

  // B-roll Library state
  brollLibraryOpen: false,
  brollTargetRange: null, // { start, duration, label } — where an attached clip will land
  brollMedia: 'video', // 'video' | 'image' — which Pexels endpoint Image/Video Search hits
  brollResults: [],
  brollQuery: '',
  brollPage: 1,
  brollTotalPages: 1,
  isSearchingBroll: false,
  isAttachingBroll: false,
  isUploadingBrollLocal: false,
  brollError: null,

  // Cover Image picker state (VideoPreview.jsx "Cover Image" tab)
  isSavingCover: false,
  coverError: null,

  // CTA overlay picker state (Scenes.jsx "+" menu -> Widget -> CTA)
  ctaPickerOpen: false,
  ctaTargetRange: null, // { start, duration, label }

  // SFX Library state (Scenes.jsx "+" menu -> Effects -> Sound)
  sfxCatalog: [],
  isLoadingSfxCatalog: false,
  sfxPickerOpen: false,
  sfxTargetRange: null, // { start, label } — duration defaults server-side to the clip's own length
  isAttachingSfx: false,
  sfxError: null,

  // Milestone 2/3 state
  transcript: null,
  captionTemplates: [],
  isTranscribing: false,
  transcribeError: null,
  isGeneratingCaptions: false,
  isAutoEditing: false,
  autoEditResult: null,
  autoEditError: null,
  isSettingStressHighlight: false,
  stressHighlightError: null,

  async init(existingProjectId) {
    set({ status: 'loading' })
    try {
      const project = existingProjectId
        ? await api.getProject(existingProjectId)
        : await api.createProject({ name: 'Untitled project', width: 1080, height: 1920, fps: 30 })
      const captionTemplates = await api.getCaptionTemplates().catch(() => [])
      const templates = await api.listTemplates().catch(() => [])
      set({
        projectId: project.id,
        project,
        timeline: project.timeline,
        assets: project.assets,
        transcript: project.transcript || null,
        captionTemplates,
        templates,
        status: 'ready',
      })
    } catch (e) {
      set({ status: 'error', error: String(e) })
    }
  },

  async createFromTemplate(templateId, name) {
    set({ status: 'loading' })
    try {
      const project = await api.createProject({ name: name || 'Untitled project', templateId: templateId || undefined })
      const captionTemplates = await api.getCaptionTemplates().catch(() => [])
      const templates = await api.listTemplates().catch(() => [])
      set({
        projectId: project.id,
        project,
        timeline: project.timeline,
        assets: project.assets,
        captionTemplates,
        templates,
        status: 'ready',
      })
      return project
    } catch (e) {
      set({ status: 'error', error: String(e) })
      throw e
    }
  },

  mainAsset() {
    const s = get()
    const mainItem = s.trackByType('video')?.items[0]
    return mainItem ? s.assets.find((a) => a.id === mainItem.assetId) : null
  },

  currentTemplate() {
    const s = get()
    if (!s.project?.templateId || !s.templates?.length) return null
    return s.templates.find((t) => t.id === s.project.templateId) || null
  },

  // Milestone 2, step 1: word-level transcription via Groq-hosted Whisper
  async transcribeMain() {
    const asset = get().mainAsset()
    if (!asset) return
    set({ isTranscribing: true, transcribeError: null })
    try {
      const transcript = await api.transcribe(get().projectId, asset.id)
      set({ transcript, isTranscribing: false })
    } catch (e) {
      set({ isTranscribing: false, transcribeError: String(e) })
    }
  },

  // Milestone 2, step 2: transcript + template -> one caption item per word/phrase
  async generateCaptions(templateId, wordsPerCaption) {
    set({ isGeneratingCaptions: true })
    try {
      const timeline = await api.generateCaptions(get().projectId, templateId, wordsPerCaption, true)
      set({ timeline, isGeneratingCaptions: false })
    } catch (e) {
      set({ isGeneratingCaptions: false, transcribeError: String(e) })
    }
  },

  // "AI Stress Text Highlighter" boost toggle. `enabled: true` re-detects
  // stress words for every current caption line (backend:
  // stress_words.detect_stress_word_indices); `false` clears them without
  // touching the style fields, so turning it back on needs no
  // re-configuration — same "disable preserves data" shape as
  // setAllCaptionsHidden.
  async setStressHighlightEnabled(enabled) {
    set({ isSettingStressHighlight: true, stressHighlightError: null })
    try {
      const timeline = await api.setStressHighlight(get().projectId, enabled)
      set({ timeline, isSettingStressHighlight: false })
    } catch (e) {
      set({ isSettingStressHighlight: false, stressHighlightError: String(e) })
    }
  },

  // Milestone 3: Gemini structured edit decisions -> template engine -> timeline items.
  // `mode` ('zoom' | 'broll' | omitted) scopes which decision types the
  // backend actually applies — see api.runAutoEdit — so "Magic Zooms"
  // (Scenes.jsx) or the "AI Auto Zooms" boost toggle (Sidebar.jsx) never
  // also drops fresh b-roll on the timeline, and vice versa.
  async runAutoEdit(mode) {
    set({ isAutoEditing: true, autoEditError: null, autoEditResult: null })
    try {
      const result = await api.runAutoEdit(get().projectId, mode)
      // Magic B-roll downloads real Pexels footage server-side and the
      // broll TimelineItems it creates point at those new assetIds — merge
      // them into local state the same way attachBrollResult already does
      // for the manual "Attach B-roll" flow, or `assets.find(a => a.id
      // === item.assetId)` in VideoPreview.jsx comes back undefined and
      // the b-roll layer silently renders blank even though the timeline
      // item itself is perfectly valid.
      const newAssets = result.assets || []
      set((s) => ({
        timeline: result.timeline,
        assets: newAssets.length
          ? [...s.assets, ...newAssets.filter((a) => !s.assets.some((existing) => existing.id === a.id))]
          : s.assets,
        autoEditResult: result.decisions,
        isAutoEditing: false,
      }))
    } catch (e) {
      set({ isAutoEditing: false, autoEditError: String(e) })
    }
  },

  openTemplateLibrary() {
    set({ templateLibraryOpen: true })
  },
  closeTemplateLibrary() {
    set({ templateLibraryOpen: false })
  },

  // Template System: applies caption style + fonts + colors + animation +
  // positioning + aspect ratio in one call. Re-fetches the project so
  // width/height (aspect ratio) and templateId stay in sync everywhere.
  async applyTemplate(templateId) {
    const { projectId } = get()
    set({ isApplyingTemplate: true, applyTemplateError: null })
    try {
      const project = await api.applyTemplate(projectId, templateId, true)
      set({
        project,
        timeline: project.timeline,
        isApplyingTemplate: false,
        templateLibraryOpen: false,
      })
    } catch (e) {
      set({ isApplyingTemplate: false, applyTemplateError: String(e) })
    }
  },

  // Scenes: group the word-level transcript into sentence-ish chunks for
  // the Scenes panel. Derived strictly from canonical Whisper word timestamps.
  scenes() {
    const words = get().transcript?.words || []
    return segmentTranscriptIntoScenes(words)
  },

  splitCaptionItem(itemId, wordIndex) {
    const s = get()
    const track = s.trackByType('caption')
    if (!track) return
    const item = track.items.find((it) => it.id === itemId)
    if (!item) return
    const words = s.transcript?.words || []
    const splitResult = splitCaptionAtWord(item, wordIndex, words)
    if (!splitResult) return

    const [firstItem, secondItem] = splitResult
    const newItems = []
    for (const it of track.items) {
      if (it.id === itemId) {
        newItems.push(firstItem, secondItem)
      } else {
        newItems.push(it)
      }
    }

    set((state) => ({
      timeline: {
        ...state.timeline,
        tracks: state.timeline.tracks.map((t) =>
          t.type === 'caption' ? { ...t, items: newItems } : t
        ),
      },
    }))
    get().persist()
  },

  mergeCaptionPair(firstItemId, secondItemId) {
    const s = get()
    const track = s.trackByType('caption')
    if (!track) return
    const firstItem = track.items.find((it) => it.id === firstItemId)
    const secondItem = track.items.find((it) => it.id === secondItemId)
    if (!firstItem || !secondItem) return

    const merged = mergeCaptionItems(firstItem, secondItem)
    const newItems = []
    for (const it of track.items) {
      if (it.id === firstItemId) {
        newItems.push(merged)
      } else if (it.id === secondItemId) {
        // merged into firstItem, omit
      } else {
        newItems.push(it)
      }
    }

    set((state) => ({
      timeline: {
        ...state.timeline,
        tracks: state.timeline.tracks.map((t) =>
          t.type === 'caption' ? { ...t, items: newItems } : t
        ),
      },
    }))
    get().persist()
  },

  brollItemsInRange(start, end) {
    const items = get().trackByType('broll')?.items || []
    return items.filter((it) => it.start < end && it.start + it.duration > start)
  },

  zoomItemsInRange(start, end) {
    const items = get().trackByType('zoom')?.items || []
    return items.filter((it) => it.start < end && it.start + it.duration > start)
  },

  toggleZoomForScene(scene) {
    const existing = get().zoomItemsInRange(scene.start, scene.end)
    if (existing.length) {
      existing.forEach((it) => get().removeItem(it.id))
      return
    }
    const item = {
      id: uid('zoom'),
      type: 'zoom',
      start: scene.start,
      duration: Math.max(scene.end - scene.start, 0.3),
      sourceStart: 0,
      transform: { x: 0, y: 0, scale: 1.3, rotation: 0 },
      opacity: 1,
      zIndex: 50,
    }
    set((s) => ({
      timeline: {
        ...s.timeline,
        tracks: s.timeline.tracks.map((t) => (t.type === 'zoom' ? { ...t, items: [...t.items, item] } : t)),
      },
    }))
    get().persist()
  },

  // Speaker PiP widget: a small corner bubble mirroring the main video's
  // own footage at that same moment (see models.py — reuses assetId and
  // sourceStart so render.py's PiP shows the SAME frame the main clip is
  // playing, not a second independent playhead). Simple on/off toggle per
  // scene, like zoom — no picker needed since there's nothing to choose.
  speakerItemsInRange(start, end) {
    const items = get().trackByType('overlay')?.items || []
    return items.filter((it) => it.type === 'speaker' && it.start < end && it.start + it.duration > start)
  },
  toggleSpeakerForScene(scene) {
    const existing = get().speakerItemsInRange(scene.start, scene.end)
    if (existing.length) {
      existing.forEach((it) => get().removeItem(it.id))
      return
    }
    const asset = get().mainAsset()
    if (!asset) return
    const { width = 1080, height = 1920 } = get().timeline.project
    const size = Math.round(width * 0.34)
    get().findOrCreateTrack('overlay')
    const item = {
      id: uid('speaker'),
      type: 'speaker',
      assetId: asset.id,
      start: scene.start,
      duration: Math.max(scene.end - scene.start, 0.3),
      sourceStart: scene.start, // mirrors the main clip's own timeline position — see models.py
      transform: { x: width - size - 40, y: height - size - 40, scale: 1, rotation: 0 },
      opacity: 1,
      zIndex: 150,
      shape: 'circle',
    }
    set((s) => ({
      timeline: {
        ...s.timeline,
        tracks: s.timeline.tracks.map((t) => (t.type === 'overlay' ? { ...t, items: [...t.items, item] } : t)),
      },
    }))
    get().persist()
  },

  // CTA overlay: text + icon pill, placed via a picker (opts chosen by the
  // user) rather than a plain toggle — see animations/CtaPicker (Task #15).
  ctaItemsInRange(start, end) {
    const items = get().trackByType('cta')?.items || []
    return items.filter((it) => it.start < end && it.start + it.duration > start)
  },
  openCtaPickerForScene(scene) {
    set({
      ctaPickerOpen: true,
      ctaTargetRange: { start: scene.start, duration: Math.max(scene.end - scene.start, 1.5), label: scene.text.slice(0, 40) },
    })
  },
  closeCtaPicker() {
    set({ ctaPickerOpen: false, ctaTargetRange: null })
  },
  attachCta({ text, ctaIcon, position = 'top', color = '#FFFFFF', backgroundColor = '#7C3AED' } = {}) {
    const { ctaTargetRange } = get()
    if (!ctaTargetRange || !text?.trim()) return
    get().findOrCreateTrack('cta')
    const item = {
      id: uid('cta'),
      type: 'cta',
      start: ctaTargetRange.start,
      duration: ctaTargetRange.duration,
      sourceStart: 0,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      opacity: 1,
      zIndex: 300,
      text: text.trim(),
      ctaIcon: ctaIcon || null,
      position,
      color,
      backgroundColor,
      fontSize: 42,
    }
    set((s) => ({
      timeline: {
        ...s.timeline,
        tracks: s.timeline.tracks.map((t) => (t.type === 'cta' ? { ...t, items: [...t.items, item] } : t)),
      },
      ctaPickerOpen: false,
      ctaTargetRange: null,
    }))
    get().persist()
  },

  // SFX Library: bundled placeholder sounds (see backend/app/sfx/library/
  // README.txt) — catalog fetch + attach, same two-call shape as B-roll
  // minus the download round-trip (nothing to download, it's bundled).
  sfxItemsInRange(start, end) {
    const items = get().trackByType('sfx')?.items || []
    return items.filter((it) => it.start < end && it.start + it.duration > start)
  },
  async loadSfxCatalog() {
    if (get().sfxCatalog.length || get().isLoadingSfxCatalog) return
    set({ isLoadingSfxCatalog: true })
    try {
      const { results } = await api.getSfxCatalog()
      set({ sfxCatalog: results, isLoadingSfxCatalog: false })
    } catch (e) {
      set({ isLoadingSfxCatalog: false, sfxError: String(e) })
    }
  },
  openSfxPickerForScene(scene) {
    set({
      sfxPickerOpen: true,
      sfxTargetRange: { start: scene.start, label: scene.text.slice(0, 40) },
      sfxError: null,
    })
    get().loadSfxCatalog()
  },
  closeSfxPicker() {
    set({ sfxPickerOpen: false, sfxTargetRange: null })
  },
  async attachSfxResult(entry) {
    const { projectId, sfxTargetRange } = get()
    if (!sfxTargetRange) return
    set({ isAttachingSfx: true, sfxError: null })
    try {
      // duration omitted -> backend defaults to the clip's own natural
      // length (see routers/sfx.py's AttachSfxBody), same "don't make the
      // user guess a length" default as a b-roll clip's own footage.
      const res = await api.attachSfx(projectId, { sfxId: entry.id, start: sfxTargetRange.start, volume: 1.0 })
      set({ timeline: res.timeline, isAttachingSfx: false, sfxPickerOpen: false, sfxTargetRange: null })
    } catch (e) {
      set({ isAttachingSfx: false, sfxError: String(e) })
    }
  },

  openBrollLibraryForScene(scene) {
    set({
      brollLibraryOpen: true,
      brollTargetRange: { start: scene.start, duration: Math.max(scene.end - scene.start, 0.5), label: scene.text.slice(0, 40) },
      brollMedia: 'video',
      brollResults: [],
      brollQuery: '',
      brollPage: 1,
      brollTotalPages: 1,
      brollError: null,
    })
    get().searchBroll('', { media: 'video' })
  },
  closeBrollLibrary() {
    set({ brollLibraryOpen: false, brollTargetRange: null })
  },
  // `opts.media` switches Image Search <-> Video Search (defaults to the
  // last-used tab so a plain re-search, e.g. on debounce, doesn't silently
  // flip tabs); `opts.page` supports the picker's pager. Both are stored
  // so the picker's UI can reflect what actually came back.
  async searchBroll(query, opts = {}) {
    const media = opts.media || get().brollMedia
    const page = opts.page || 1
    set({ isSearchingBroll: true, brollQuery: query, brollMedia: media, brollPage: page, brollError: null })
    try {
      const { results, totalPages } = await api.searchBroll(query, { media, page })
      set({ brollResults: results, brollTotalPages: totalPages || 1, isSearchingBroll: false })
    } catch (e) {
      set({ isSearchingBroll: false, brollResults: [], brollError: String(e) })
    }
  },
  // Upload Local tab: uploads the file immediately (so the picker can show
  // it as a selectable card right away) via the same generic upload
  // endpoint the rest of the app uses, and merges it into `assets` so a
  // live preview thumbnail can resolve — same merge-on-arrival contract as
  // runAutoEdit's Magic B-roll fix and attachBrollResult below, so this
  // path can never produce the "asset the frontend never heard about"
  // blank-layer bug either. Returns the asset (or null on failure) so the
  // picker can mark it as the current selection.
  async uploadBrollLocalAsset(file) {
    const { projectId } = get()
    set({ isUploadingBrollLocal: true, brollError: null })
    try {
      const asset = await api.uploadAsset(projectId, file)
      set((s) => ({
        assets: s.assets.some((a) => a.id === asset.id) ? s.assets : [...s.assets, asset],
        isUploadingBrollLocal: false,
      }))
      return asset
    } catch (e) {
      set({ isUploadingBrollLocal: false, brollError: String(e) })
      return null
    }
  },
  // `result` is either a Pexels search card ({ downloadUrl, kind, ... })
  // or an already-uploaded local asset ({ assetId, kind, ... }, from
  // uploadBrollLocalAsset above) — attach_broll on the backend accepts
  // either shape in one call and always returns the fully-resolved
  // {asset, item, timeline} triple so the frontend never has to guess
  // whether it needs to sync a new asset in.
  async attachBrollResult(result, opts = {}) {
    const { projectId, brollTargetRange } = get()
    if (!brollTargetRange) return
    set({ isAttachingBroll: true, brollError: null })
    try {
      const duration = opts?.duration && opts.duration > 0 ? opts.duration : brollTargetRange.duration
      const res = await api.attachBroll(projectId, {
        downloadUrl: result.assetId ? undefined : result.downloadUrl,
        assetId: result.assetId || undefined,
        mediaType: result.kind || 'video',
        start: brollTargetRange.start,
        duration,
        label: brollTargetRange.label || 'broll',
        layout: opts?.layout || 'full',
        revealAnimation: opts?.revealAnimation || 'none',
        revealDuration: opts?.revealDuration !== undefined ? opts.revealDuration : 0.5,
      })
      set((s) => ({
        timeline: res.timeline,
        assets: res.isNewAsset && !s.assets.some((a) => a.id === res.asset.id)
          ? [...s.assets, res.asset]
          : s.assets,
        isAttachingBroll: false,
        brollLibraryOpen: false,
        brollTargetRange: null,
        brollResults: [],
      }))
    } catch (e) {
      set({ isAttachingBroll: false, brollError: String(e) })
    }
  },

  // Cover Image picker: captures whatever's on screen at `time` (main video,
  // or the active b-roll/split/overlay layer) via the backend's shared
  // render filter graph — see routers/projects.py set_cover — and sets it
  // as the project's dashboard thumbnail.
  async saveCover(time) {
    const { projectId } = get()
    if (!projectId) return
    set({ isSavingCover: true, coverError: null })
    try {
      const project = await api.setCover(projectId, time)
      set({ project, isSavingCover: false })
    } catch (e) {
      set({ isSavingCover: false, coverError: String(e) })
    }
  },

  trackByType(type) {
    return get().timeline.tracks.find((t) => t.type === type)
  },

  // Speaker/CTA both land on tracks that a project's initial scaffold
  // doesn't create up front (routers/projects.py only pre-creates video/
  // broll/caption/audio/sfx/zoom) — same "add it the first time it's
  // needed" pattern as the backend's own _find_or_create_track (see
  // routers/templates.py), so an existing project gains the track
  // instead of the item silently having nowhere to live.
  findOrCreateTrack(type) {
    const existing = get().trackByType(type)
    if (existing) return existing
    const track = { id: `track_${type}`, type, items: [] }
    set((s) => ({ timeline: { ...s.timeline, tracks: [...s.timeline.tracks, track] } }))
    return track
  },

  async persist() {
    const { projectId, timeline } = get()
    if (!projectId || !timeline) return
    await api.saveTimeline(projectId, timeline)
  },

  // Toolbar's explicit "Save" button — was previously wired to
  // setPlaying(!isPlaying) (a copy-paste leftover from a play/pause
  // control), so clicking "Save" silently toggled playback and never
  // persisted anything. This actually calls persist(), with a busy flag
  // so Toolbar.jsx can show a spinner and the button can't be double-fired
  // while a save is already in flight — same guard shape as isAutoEditing.
  async saveProject() {
    if (get().isSavingProject) return
    set({ isSavingProject: true, saveError: null })
    try {
      await get().persist()
    } catch (e) {
      set({ saveError: String(e) })
    } finally {
      set({ isSavingProject: false })
    }
  },

  async uploadFile(file, targetTrackType) {
    const { projectId } = get()
    const asset = await api.uploadAsset(projectId, file)
    set((s) => ({ assets: [...s.assets, asset] }))

    const duration = asset.duration && asset.duration > 0 ? Math.min(asset.duration, 30) : 3
    const item = {
      id: uid('item'),
      type: targetTrackType === 'video' ? 'video' : targetTrackType === 'broll' ? 'broll' : 'audio',
      assetId: asset.id,
      start: targetTrackType === 'video' ? 0 : get().currentTime,
      duration,
      sourceStart: 0,
      transform: { x: 40, y: 40, scale: 1, rotation: 0 },
      opacity: 1,
      zIndex: (get().timeline.tracks.find((t) => t.type === targetTrackType)?.items.length || 0) + 1,
    }

    set((s) => {
      const tracks = s.timeline.tracks.map((t) =>
        t.type === targetTrackType ? { ...t, items: [...t.items, item] } : t
      )
      const projectDuration =
        targetTrackType === 'video' ? item.duration : s.timeline.project.duration
      return {
        timeline: {
          ...s.timeline,
          project: { ...s.timeline.project, duration: Math.max(projectDuration, s.timeline.project.duration) },
          tracks,
        },
      }
    })
    await get().persist()
    return item
  },

  addCaption(text) {
    const item = {
      id: uid('cap'),
      type: 'caption',
      start: get().currentTime,
      duration: 2,
      sourceStart: 0,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      opacity: 1,
      zIndex: 100,
      text,
      fontSize: 64,
      color: '#FFFFFF',
      position: 'bottom',
    }
    set((s) => ({
      timeline: {
        ...s.timeline,
        tracks: s.timeline.tracks.map((t) =>
          t.type === 'caption' ? { ...t, items: [...t.items, item] } : t
        ),
      },
      selectedItemId: item.id,
    }))
    get().persist()
  },

  updateItem(itemId, patch) {
    set((s) => ({
      timeline: {
        ...s.timeline,
        tracks: s.timeline.tracks.map((t) => ({
          ...t,
          items: t.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
        })),
      },
    }))
    get().persist()
  },

  removeItem(itemId) {
    set((s) => ({
      timeline: {
        ...s.timeline,
        tracks: s.timeline.tracks.map((t) => ({
          ...t,
          items: t.items.filter((it) => it.id !== itemId),
        })),
      },
      selectedItemId: s.selectedItemId === itemId ? null : s.selectedItemId,
    }))
    get().persist()
  },

  // Turning "AI Auto Zooms"/"AI Auto B-rolls" back OFF (Sidebar.jsx) used
  // to just flip the boost card's own on/off flag and leave every item the
  // AI had added still sitting on the timeline — the toggle looked off but
  // nothing about the video actually changed. This removes only the items
  // that specific auto-edit pass added to `trackType` (marked
  // `source: "auto_edit"` by template_engine.py's apply_edit_decisions —
  // see models.py), leaving anything the user placed by hand (a scene's
  // Zoom toggle, a manually attached B-roll clip) untouched.
  // Async and awaited by every caller before it fires the next
  // runAutoEdit() — this used to fire-and-forget its persist() while the
  // caller immediately POSTed /auto-edit right after. The backend applies
  // new decisions on top of whatever timeline it last had *persisted*, not
  // anything the client sends — so if that save hadn't landed yet, the
  // still-there "removed" items were still on the server's copy and the
  // fresh apply just appended more on top of them (confirmed by direct
  // simulation: two applies with no completed removal in between left 3
  // items on a track that should have had 1). Awaiting this closes that
  // window for both the Scenes.jsx Magic buttons and the Sidebar boost
  // toggles, which both call this immediately before runAutoEdit().
  async removeAutoEditItems(trackType) {
    const track = get().trackByType(trackType)
    if (!track || !track.items.some((it) => it.source === 'auto_edit')) return
    set((s) => ({
      timeline: {
        ...s.timeline,
        tracks: s.timeline.tracks.map((t) => (t.type === trackType
          ? { ...t, items: t.items.filter((it) => it.source !== 'auto_edit') }
          : t)),
      },
    }))
    await get().persist()
  },

  // "AI Subtitles & Captions" boost toggle (Sidebar.jsx). Turning it off
  // hides every caption line from the live preview AND the export (see
  // `hidden` on TimelineItem / render.py's caption loop) WITHOUT deleting
  // them, so turning it back on instantly restores exactly what was there
  // — text, styling, timing — with no re-transcription/re-generation.
  setAllCaptionsHidden(hidden) {
    set((s) => ({
      timeline: {
        ...s.timeline,
        tracks: s.timeline.tracks.map((t) => (t.type === 'caption'
          ? { ...t, items: t.items.map((it) => ({ ...it, hidden })) }
          : t)),
      },
    }))
    get().persist()
  },

  // Turning "AI Subtitles & Captions" on for the first time (no caption
  // track items exist yet): transcribe the main video if that hasn't
  // happened yet, then generate styled captions from the transcript —
  // same pipeline the "Generate Captions" project-creation flow uses.
  // No-ops quietly if there's no main video, or if transcription fails
  // (transcribeError is already surfaced elsewhere in the Captions tab).
  async enableAiCaptions() {
    if (!get().mainAsset()) return
    if (!get().transcript?.words?.length) {
      await get().transcribeMain()
    }
    if (!get().transcript?.words?.length) return
    await get().generateCaptions('clean_bottom')
  },

  selectItem(itemId) {
    set({ selectedItemId: itemId })
  },

  setCurrentTime(t) {
    set({ currentTime: Math.max(0, t) })
  },

  setPlaying(p) {
    set({ isPlaying: p })
  },

  openExportPanel() {
    set({ exportPanelOpen: true })
  },
  closeExportPanel() {
    set({ exportPanelOpen: false })
  },
  setExportFormat(format) {
    set({ exportFormat: format })
  },
  setExportQuality(quality) {
    set({ exportQuality: quality })
  },
  setExportFrameRate(frameRate) {
    set({ exportFrameRate: frameRate })
  },
  async setExportEngine(engine) {
    set({ exportEngine: engine, exportPreflight: null })
    // Shotstack can't reproduce every construct the editor supports, so run
    // the backend's dry-run validation as soon as it's chosen and surface
    // the result before the user commits to a render.
    if (engine === 'shotstack') {
      try {
        set({ exportPreflight: await api.exportPreflight(get().projectId) })
      } catch (e) {
        set({ exportPreflight: { ok: false, errors: [String(e)], warnings: [] } })
      }
    }
  },
  async loadExportEngines() {
    try {
      set({ exportEngines: await api.listExportEngines() })
    } catch {
      // Non-fatal: the panel just shows FFmpeg only.
      set({ exportEngines: null })
    }
  },

  // Called by the export panel's "Save" button: persists the currently
  // selected format/quality/frame rate as the project's export settings,
  // saves the timeline (same as every other edit), and immediately starts
  // rendering with those settings.
  async startExport(opts = {}) {
    const { projectId, exportFormat, exportQuality, exportFrameRate, exportEngine } = get()
    const engine = opts.engine || exportEngine
    // Shotstack renders MP4 only; fall back rather than letting the request 400.
    const format = engine === 'shotstack' ? 'mp4' : (opts.format || exportFormat)
    const quality = opts.quality || exportQuality
    const frameRate = opts.frameRate !== undefined ? opts.frameRate : exportFrameRate
    set({ exportFormat: format, exportQuality: quality, exportFrameRate: frameRate, exportEngine: engine })
    await get().persist()
    try {
      const job = await api.startExport(projectId, { format, quality, frameRate: frameRate || undefined, engine })
      set({ exportJob: job })
      const poll = async () => {
        try {
          const status = await api.getExportStatus(job.id)
          set({ exportJob: status })
          if (status.status === 'queued' || status.status === 'processing') {
            setTimeout(poll, 1200)
          }
        } catch (e) {
          // Losing the poll must not strand the UI on "Rendering" forever.
          set({ exportJob: { ...get().exportJob, status: 'failed', error: String(e) } })
        }
      }
      poll()
    } catch (e) {
      // A rejected submit (bad engine, missing key, unsupported format) never
      // produces a job record, so synthesise one so the panel can show why.
      set({ exportJob: { status: 'failed', error: String(e), engine } })
    }
  },
}))
