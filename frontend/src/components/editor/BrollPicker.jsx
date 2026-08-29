import { useEffect, useRef, useState } from 'react'
import {
  Search,
  X,
  ArrowLeft,
  Video,
  Image as ImageIcon,
  Upload,
  Loader2,
  Clock,
  Plus,
  Minus,
  RotateCcw,
  Check,
  PlusCircle,
  Play,
  ChevronLeft,
  ChevronRight,
  FileVideo,
} from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { api } from '../../services/api'
import RevealAnimationPicker from './animations/RevealAnimationPicker'
import LayoutPicker from './animations/LayoutPicker'

function formatDuration(sec) {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// The three source tabs — each maps to a distinct way of resolving media,
// but all three end up producing the exact same `selectedResult` shape
// consumed by attachBrollResult (see editorStore.js), so every source
// lands on the timeline through one code path with one correct
// {assetId, start, duration} item — never a keyword-only stub, never an
// asset the frontend's local state doesn't know about.
const SOURCE_TABS = [
  { id: 'image', label: 'Image Search', icon: ImageIcon },
  { id: 'video', label: 'Video Search', icon: Video },
  { id: 'upload', label: 'Upload Local', icon: Upload },
]

// Compact page-number list with ellipses, e.g. 1 2 3 … 12 for
// (current=2, total=12) or 1 … 5 6 7 … 12 for (current=6, total=12).
function pageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, total, current, current - 1, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…')
    out.push(p)
  })
  return out
}

export default function BrollPicker() {
  const {
    brollLibraryOpen,
    closeBrollLibrary,
    brollTargetRange,
    brollResults,
    brollQuery,
    brollPage,
    brollTotalPages,
    isSearchingBroll,
    isAttachingBroll,
    isUploadingBrollLocal,
    brollError,
    searchBroll,
    attachBrollResult,
    uploadBrollLocalAsset,
  } = useEditorStore()

  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState('video')
  const currentTemplate = useEditorStore((s) => (s.currentTemplate ? s.currentTemplate() : null))
  const brollConfig = currentTemplate?.broll || {}
  const defaultLayout = brollConfig.layout || 'full'
  const defaultReveal = brollConfig.revealAnimation || 'slide_down'
  const defaultDuration = brollConfig.revealDuration !== undefined ? brollConfig.revealDuration : 0.5

  const [selectedAnim, setSelectedAnim] = useState(defaultReveal)
  const [selectedLayout, setSelectedLayout] = useState(defaultLayout)
  const [customDuration, setCustomDuration] = useState(2)
  // Clicking a card only marks it as chosen now — attaching (downloading +
  // placing it on the timeline) is deferred to "Add to Timeline" below, so
  // the layout/reveal-animation choice always applies to the item the user
  // actually meant, instead of firing on the first click before those are set.
  const [selectedResult, setSelectedResult] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const debounceRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    setQuery(brollQuery)
    if (brollTargetRange?.duration) {
      setCustomDuration(Number(brollTargetRange.duration.toFixed(2)))
    }
  }, [brollLibraryOpen, brollTargetRange])

  // A fresh open (or a new target scene) starts with nothing chosen and
  // back on the Video Search tab.
  useEffect(() => {
    setSelectedResult(null)
    setPreviewOpen(false)
    setActiveTab('video')
  }, [brollLibraryOpen, brollTargetRange?.start])

  useEffect(() => {
    if (brollConfig.revealAnimation) {
      setSelectedAnim(brollConfig.revealAnimation)
    }
    setSelectedLayout(brollConfig.layout || 'full')
  }, [currentTemplate?.id, brollConfig.revealAnimation, brollConfig.layout])

  const attachOpts = {
    layout: selectedLayout,
    revealAnimation: selectedAnim,
    revealDuration: defaultDuration,
    duration: customDuration,
  }

  if (!brollLibraryOpen) return null

  function onQueryChange(v) {
    setQuery(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchBroll(v, { media: activeTab, page: 1 }), 350)
  }

  function onTabChange(tab) {
    if (tab === activeTab) return
    setActiveTab(tab)
    setSelectedResult(null)
    if (tab === 'image' || tab === 'video') {
      searchBroll(query, { media: tab, page: 1 })
    }
  }

  async function onFilePicked(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    const asset = await uploadBrollLocalAsset(file)
    if (!asset) return
    setSelectedResult({
      id: asset.id,
      assetId: asset.id,
      kind: asset.kind,
      thumbnail: asset.kind === 'image' ? api.assetUrl(asset) : null,
      previewUrl: api.assetUrl(asset),
      filename: asset.filename,
      duration: asset.duration,
      source: 'upload',
    })
  }

  const isSearchTab = activeTab === 'image' || activeTab === 'video'
  const emptyLabel = activeTab === 'image' ? 'images' : 'video clips'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 transition-all">
      <div className="flex max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-dark-panel shadow-modal border border-dark-border">
        {/* Left: Source Tabs, Search & Media Browser */}
        <div className="flex flex-1 flex-col border-r border-dark-border min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-dark-border px-6 py-4">
            <button
              onClick={closeBrollLibrary}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-dark-panel2 hover:text-white transition"
              title="Close modal"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h3 className="text-sm font-extrabold text-slate-100 mr-1 shrink-0">Add B-roll</h3>
            <div className="flex items-center gap-1.5 rounded-2xl bg-dark-panel2 p-1 border border-dark-border overflow-x-auto">
              {SOURCE_TABS.map((t) => {
                const Icon = t.icon
                const isActive = activeTab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => onTabChange(t.id)}
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${isActive
                        ? 'bg-primary text-white shadow-purpleGlow'
                        : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Search Input Bar (Image/Video Search only) */}
          {isSearchTab && (
            <div className="border-b border-dark-border px-6 py-3.5">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder={activeTab === 'image' ? 'Search stock images (e.g. "office desk sunset")' : 'Search stock footage (e.g. "person working laptop office")'}
                  className="w-full rounded-2xl border border-dark-border bg-dark-panel2 py-2.5 pl-10 pr-9 text-xs font-bold text-slate-100 outline-none focus:border-primary transition"
                />
                {query && (
                  <button
                    onClick={() => {
                      setQuery('')
                      searchBroll('', { media: activeTab, page: 1 })
                    }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-0.5"
                    title="Clear"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            {brollError && (
              <div className="mb-4 rounded-2xl border border-danger/30 bg-red-950/40 p-3 text-xs font-semibold text-danger">
                {brollError}
              </div>
            )}

            {activeTab === 'upload' ? (
              <div className="flex flex-col items-center justify-center gap-4 py-10">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={onFilePicked}
                />
                {selectedResult?.source === 'upload' ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative w-48 overflow-hidden rounded-2xl border-2 border-primary shadow-purpleGlow aspect-[9/16] bg-dark-panel2">
                      {selectedResult.kind === 'image' ? (
                        <img src={selectedResult.thumbnail} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <video src={selectedResult.previewUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                      )}
                      <span className="absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow-purpleGlow">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    </div>
                    <p className="max-w-xs truncate text-xs font-bold text-slate-300">{selectedResult.filename}</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingBrollLocal}
                      className="rounded-xl border border-dark-border bg-dark-panel2 px-3.5 py-1.5 text-xs font-bold text-slate-300 hover:border-primary hover:text-white transition disabled:opacity-50"
                    >
                      Choose a different file
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingBrollLocal}
                    className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-dark-border bg-dark-panel2 px-8 py-14 text-center transition hover:border-primary hover:bg-dark-panel3 disabled:opacity-60"
                  >
                    {isUploadingBrollLocal ? (
                      <>
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="text-xs font-bold text-slate-300">Uploading...</span>
                      </>
                    ) : (
                      <>
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
                          <Upload className="h-6 w-6" />
                        </div>
                        <span className="text-xs font-bold text-slate-200">Click to upload an image or video</span>
                        <span className="text-[11px] text-slate-500">From your device — used exactly like a searched clip</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            ) : isSearchingBroll ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs font-semibold text-slate-400">Searching stock {emptyLabel} library...</span>
              </div>
            ) : brollResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center text-slate-500 gap-2">
                {activeTab === 'image' ? (
                  <ImageIcon className="h-8 w-8 stroke-[1.2] text-slate-700" />
                ) : (
                  <Video className="h-8 w-8 stroke-[1.2] text-slate-700" />
                )}
                <p className="text-xs font-bold text-slate-300">No {emptyLabel} found</p>
                <p className="text-[11px] text-slate-500">Try typing another keyword search prompt</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {brollResults.map((r) => {
                    const isSelected = selectedResult?.id === r.id
                    return (
                      <button
                        key={r.id}
                        disabled={isAttachingBroll}
                        onClick={() => setSelectedResult(isSelected ? null : { ...r, source: 'search' })}
                        className={`group relative block w-full overflow-hidden rounded-2xl border transition-all duration-200 aspect-[9/16] text-left disabled:opacity-50 ${isSelected
                            ? 'border-primary shadow-purpleGlow ring-2 ring-primary'
                            : 'border-dark-border bg-dark-panel2 hover:border-primary hover:shadow-purpleGlow'
                          }`}
                      >
                        <img src={r.thumbnail} alt="" className="h-full w-full object-cover group-hover:scale-105 transition duration-300 opacity-90 group-hover:opacity-100" />
                        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-dark-bg/80 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold text-white border border-dark-border">
                          {r.kind === 'image' ? (
                            <>
                              <ImageIcon className="h-2.5 w-2.5 text-primary" />
                              Image
                            </>
                          ) : (
                            <>
                              <Clock className="h-2.5 w-2.5 text-primary" />
                              {formatDuration(r.duration)}
                            </>
                          )}
                        </span>
                        {isSelected && (
                          <span className="absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow-purpleGlow">
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          </span>
                        )}
                        <span className={`absolute inset-0 items-center justify-center bg-dark-bg/60 backdrop-blur-[1px] text-xs font-bold text-white transition ${isSelected ? 'hidden' : 'hidden group-hover:flex'}`}>
                          Select {r.kind === 'image' ? 'Image' : 'Clip'}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Pagination */}
                {brollTotalPages > 1 && (
                  <div className="mt-5 flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      disabled={brollPage <= 1 || isSearchingBroll}
                      onClick={() => searchBroll(query, { media: activeTab, page: brollPage - 1 })}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-dark-border bg-dark-panel2 text-slate-400 hover:text-white hover:border-primary transition disabled:opacity-30 disabled:hover:border-dark-border"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    {pageList(brollPage, brollTotalPages).map((p, i) =>
                      p === '…' ? (
                        <span key={`e${i}`} className="px-1 text-xs font-bold text-slate-600">…</span>
                      ) : (
                        <button
                          key={p}
                          type="button"
                          disabled={isSearchingBroll}
                          onClick={() => searchBroll(query, { media: activeTab, page: p })}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition ${p === brollPage
                              ? 'bg-primary text-white shadow-purpleGlow'
                              : 'border border-dark-border bg-dark-panel2 text-slate-400 hover:text-white hover:border-primary'
                            }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      disabled={brollPage >= brollTotalPages || isSearchingBroll}
                      onClick={() => searchBroll(query, { media: activeTab, page: brollPage + 1 })}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-dark-border bg-dark-panel2 text-slate-400 hover:text-white hover:border-primary transition disabled:opacity-30 disabled:hover:border-dark-border"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {isAttachingBroll && (
            <div className="border-t border-dark-border px-6 py-2.5 text-xs font-bold text-primary bg-primary/10 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {selectedResult?.source === 'upload' ? 'Placing your upload on the timeline...' : 'Downloading & placing media on timeline...'}
            </div>
          )}
        </div>

        {/* Right: Target Segment Preview Info & Placement Settings */}
        <div className="hidden lg:flex w-80 flex-col items-center justify-start bg-dark-rail p-6 text-center border-l border-dark-border overflow-y-auto">
          {brollTargetRange ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary shadow-purpleGlow">
                <FileVideo className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Placement Target</h4>
                <p className="text-xs font-bold text-slate-100 mt-1">
                  Start: {brollTargetRange.start.toFixed(2)}s | End: {(brollTargetRange.start + customDuration).toFixed(2)}s
                </p>
                {brollTargetRange.label && (
                  <p className="text-xs text-slate-400 mt-2 bg-dark-panel border border-dark-border rounded-xl p-3 leading-relaxed">
                    "{brollTargetRange.label}"
                  </p>
                )}
              </div>

              {/* B-roll Duration Controls */}
              <div className="flex flex-col gap-2.5 w-full mt-1 text-left bg-dark-panel p-3.5 rounded-2xl border border-dark-border">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">B-roll Duration</span>
                  <span className="text-xs font-bold font-mono text-primary">{customDuration.toFixed(1)}s</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomDuration((d) => Math.max(0.5, Number((d - 0.5).toFixed(1))))}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-dark-panel3 text-slate-300 hover:bg-dark-panel2 hover:text-white transition border border-dark-border"
                    title="Decrease duration by 0.5s"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="number"
                    step="0.1"
                    min="0.3"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(Math.max(0.3, parseFloat(e.target.value) || 0.5))}
                    className="w-full rounded-xl border border-dark-border bg-dark-panel3 px-3 py-1.5 text-center text-xs font-bold font-mono text-slate-100 outline-none focus:border-primary transition"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomDuration((d) => Number((d + 0.5).toFixed(1)))}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-dark-panel3 text-slate-300 hover:bg-dark-panel2 hover:text-white transition border border-dark-border"
                    title="Increase duration by 0.5s"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Quick Extend Buttons */}
                <div className="grid grid-cols-4 gap-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setCustomDuration((d) => Number((d + 1.0).toFixed(1)))}
                    className="rounded-lg bg-dark-panel3 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-primary/20 hover:text-primary transition border border-dark-border"
                  >
                    +1.0s
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomDuration((d) => Number((d + 2.0).toFixed(1)))}
                    className="rounded-lg bg-dark-panel3 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-primary/20 hover:text-primary transition border border-dark-border"
                  >
                    +2.0s
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomDuration((d) => Number((d + 5.0).toFixed(1)))}
                    className="rounded-lg bg-dark-panel3 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-primary/20 hover:text-primary transition border border-dark-border"
                  >
                    +5.0s
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomDuration(Number(brollTargetRange.duration.toFixed(2)))}
                    className="flex items-center justify-center rounded-lg bg-dark-panel3 px-2 py-1 text-[10px] font-bold text-slate-400 hover:bg-dark-panel2 hover:text-white transition border border-dark-border"
                    title="Reset to scene length"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>

              {/* Screen Layout Selector — same cover-thumbnail + name card
                  language as the Reveal Animation picker below, instead of
                  plain text pills, so you can see where the b-roll clip
                  sits before placing it. */}
              <div className="flex flex-col gap-2 w-full mt-1 text-left">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Screen Layout</span>
                <LayoutPicker value={selectedLayout} onChange={setSelectedLayout} columns={3} />
              </div>

              {/* Reveal Animation Selector — a live-animated preview card per
                  style (see animations/RevealAnimationPicker.jsx) instead of
                  a plain text pill, so you can see what "Fade In" vs "Zoom In"
                  vs "Bounce In" actually looks like before placing the clip. */}
              <div className="flex flex-col gap-2 w-full mt-1 text-left">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Reveal Animation</span>
                <RevealAnimationPicker value={selectedAnim} onChange={setSelectedAnim} columns={3} />
              </div>

              {/* Add to Timeline — commits the selected media with the
                  layout/animation chosen above. Nothing is downloaded or
                  placed on the timeline until this is clicked. */}
              <button
                type="button"
                disabled={!selectedResult || isAttachingBroll}
                onClick={() => attachBrollResult(selectedResult, attachOpts)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-purpleGlow transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none mt-2"
              >
                {isAttachingBroll ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <PlusCircle className="h-3.5 w-3.5" />
                    Add to Timeline
                  </>
                )}
              </button>

              {/* Preview — a quick large look at the exact media that will
                  be placed, before committing it (nothing is downloaded a
                  second time; it reuses the same thumbnail/preview link the
                  card already has, or the just-uploaded file's own URL). */}
              <button
                type="button"
                disabled={!selectedResult}
                onClick={() => setPreviewOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dark-border bg-dark-panel3 py-2.5 text-xs font-extrabold uppercase tracking-wider text-slate-300 transition hover:border-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play className="h-3.5 w-3.5" />
                Preview
              </button>

              {!selectedResult && (
                <p className="text-[10px] text-slate-500 -mt-1">Pick media above first</p>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500 my-auto">Select a scene to place footage</div>
          )}
        </div>
      </div>

      {/* Preview Lightbox */}
      {previewOpen && selectedResult && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="relative flex max-h-full flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-hidden rounded-2xl border border-dark-border shadow-modal bg-dark-panel2" style={{ maxHeight: '75vh' }}>
              {selectedResult.kind === 'image' ? (
                <img
                  src={selectedResult.thumbnail || selectedResult.previewUrl}
                  alt=""
                  className="max-h-[75vh] w-auto object-contain"
                />
              ) : (
                <video
                  src={selectedResult.previewUrl || selectedResult.downloadUrl}
                  className="max-h-[75vh] w-auto object-contain"
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="flex items-center gap-1.5 rounded-xl bg-dark-panel2 border border-dark-border px-4 py-2 text-xs font-bold text-slate-300 hover:text-white hover:border-primary transition"
            >
              <X className="h-3.5 w-3.5" />
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
