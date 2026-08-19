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
  brollResults: [],
  brollQuery: '',
  isSearchingBroll: false,
  isAttachingBroll: false,
  brollError: null,

  // Milestone 2/3 state
  transcript: null,
  captionTemplates: [],
  isTranscribing: false,
  transcribeError: null,
  isGeneratingCaptions: false,
  isAutoEditing: false,
  autoEditResult: null,
  autoEditError: null,

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

  // Milestone 3: Gemini structured edit decisions -> template engine -> timeline items
  async runAutoEdit() {
    set({ isAutoEditing: true, autoEditError: null, autoEditResult: null })
    try {
      const result = await api.runAutoEdit(get().projectId)
      set({ timeline: result.timeline, autoEditResult: result.decisions, isAutoEditing: false })
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

  openBrollLibraryForScene(scene) {
    set({
      brollLibraryOpen: true,
      brollTargetRange: { start: scene.start, duration: Math.max(scene.end - scene.start, 0.5), label: scene.text.slice(0, 40) },
      brollResults: [],
      brollQuery: '',
      brollError: null,
    })
    get().searchBroll('')
  },
  closeBrollLibrary() {
    set({ brollLibraryOpen: false, brollTargetRange: null })
  },
  async searchBroll(query) {
    set({ isSearchingBroll: true, brollQuery: query, brollError: null })
    try {
      const { results } = await api.searchBroll(query)
      set({ brollResults: results, isSearchingBroll: false })
    } catch (e) {
      set({ isSearchingBroll: false, brollError: String(e) })
    }
  },
  async attachBrollResult(result, opts = {}) {
    const { projectId, brollTargetRange } = get()
    if (!brollTargetRange) return
    set({ isAttachingBroll: true, brollError: null })
    try {
      const duration = opts?.duration && opts.duration > 0 ? opts.duration : brollTargetRange.duration
      const res = await api.attachBroll(projectId, {
        downloadUrl: result.downloadUrl,
        start: brollTargetRange.start,
        duration,
        label: brollTargetRange.label || 'broll',
        layout: opts?.layout || 'full',
        revealAnimation: opts?.revealAnimation || 'none',
        revealDuration: opts?.revealDuration !== undefined ? opts.revealDuration : 0.5,
      })
      set((s) => ({
        timeline: res.timeline,
        assets: [...s.assets, res.asset],
        isAttachingBroll: false,
        brollLibraryOpen: false,
        brollTargetRange: null,
      }))
    } catch (e) {
      set({ isAttachingBroll: false, brollError: String(e) })
    }
  },

  trackByType(type) {
    return get().timeline.tracks.find((t) => t.type === type)
  },

  async persist() {
    const { projectId, timeline } = get()
    if (!projectId || !timeline) return
    await api.saveTimeline(projectId, timeline)
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

  selectItem(itemId) {
    set({ selectedItemId: itemId })
  },

  setCurrentTime(t) {
    set({ currentTime: Math.max(0, t) })
  },

  setPlaying(p) {
    set({ isPlaying: p })
  },

  async startExport() {
    const { projectId } = get()
    await get().persist()
    const job = await api.startExport(projectId)
    set({ exportJob: job })
    const poll = async () => {
      const status = await api.getExportStatus(job.id)
      set({ exportJob: status })
      if (status.status === 'queued' || status.status === 'processing') {
        setTimeout(poll, 1200)
      }
    }
    poll()
  },
}))
