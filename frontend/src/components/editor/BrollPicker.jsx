import { useEffect, useRef, useState } from 'react'
import {
  Search,
  X,
  ArrowLeft,
  Flame,
  Sparkles,
  Video,
  Loader2,
  Clock,
  Plus,
  Minus,
  RotateCcw,
  Check,
  Save
} from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import RevealAnimationPicker from './animations/RevealAnimationPicker'
import LayoutPicker from './animations/LayoutPicker'

function formatDuration(sec) {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const TABS = ['AI Generated', 'B-rolls', 'Stock Images']
const FILTERS = ['Trendy', 'Free', 'Premium', 'My Uploads', 'Saved']

export default function BrollPicker() {
  const {
    brollLibraryOpen,
    closeBrollLibrary,
    brollTargetRange,
    brollResults,
    brollQuery,
    isSearchingBroll,
    isAttachingBroll,
    brollError,
    searchBroll,
    attachBrollResult,
  } = useEditorStore()

  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState('B-rolls')
  const [activeFilter, setActiveFilter] = useState('Trendy')
  const currentTemplate = useEditorStore((s) => (s.currentTemplate ? s.currentTemplate() : null))
  const brollConfig = currentTemplate?.broll || {}
  const defaultLayout = brollConfig.layout || 'full'
  const defaultReveal = brollConfig.revealAnimation || 'slide_down'
  const defaultDuration = brollConfig.revealDuration !== undefined ? brollConfig.revealDuration : 0.5

  const [selectedAnim, setSelectedAnim] = useState(defaultReveal)
  const [selectedLayout, setSelectedLayout] = useState(defaultLayout)
  const [customDuration, setCustomDuration] = useState(2)
  // Clicking a clip only marks it as chosen now — attaching (downloading +
  // placing it on the timeline) is deferred to the Save button below, so
  // the layout/reveal-animation choice always applies to the clip the user
  // actually meant, instead of firing on the first click before those are set.
  const [selectedResult, setSelectedResult] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    setQuery(brollQuery)
    if (brollTargetRange?.duration) {
      setCustomDuration(Number(brollTargetRange.duration.toFixed(2)))
    }
  }, [brollLibraryOpen, brollTargetRange])

  // A fresh open (or a new target scene) starts with nothing chosen.
  useEffect(() => {
    setSelectedResult(null)
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
    debounceRef.current = setTimeout(() => searchBroll(v), 350)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 transition-all">
      <div className="flex max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-dark-panel shadow-modal border border-dark-border">
        {/* Left: Search & Media Browser */}
        <div className="flex flex-1 flex-col border-r border-dark-border min-w-0">
          {/* Header */}
          <div className="flex items-center gap-4 border-b border-dark-border px-6 py-4">
            <button
              onClick={closeBrollLibrary}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-dark-panel2 hover:text-white transition"
              title="Close modal"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5 rounded-2xl bg-dark-panel2 p-1 border border-dark-border">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${activeTab === t
                      ? 'bg-primary text-white shadow-purpleGlow'
                      : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 border-b border-dark-border px-6 py-2.5 bg-dark-bg/60">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`flex items-center gap-1 rounded-xl px-3 py-1 text-xs font-bold transition-all ${activeFilter === f
                    ? 'bg-primary text-white shadow-purpleGlow'
                    : 'border border-dark-border bg-dark-panel text-slate-400 hover:bg-dark-panel2 hover:text-slate-200'
                  }`}
              >
                {f === 'Trendy' && <Flame className="h-3 w-3 fill-white" />}
                {f}
              </button>
            ))}
          </div>

          {/* Search Input Bar */}
          <div className="border-b border-dark-border px-6 py-3.5">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                autoFocus
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder='Search stock footage (e.g. "person working laptop office")'
                className="w-full rounded-2xl border border-dark-border bg-dark-panel2 py-2.5 pl-10 pr-9 text-xs font-bold text-slate-100 outline-none focus:border-primary transition"
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery('')
                    searchBroll('')
                  }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-0.5"
                  title="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Results Grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {brollError && (
              <div className="mb-4 rounded-2xl border border-danger/30 bg-red-950/40 p-3 text-xs font-semibold text-danger">
                {brollError}
              </div>
            )}

            {isSearchingBroll ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs font-semibold text-slate-400">Searching stock footage library...</span>
              </div>
            ) : brollResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center text-slate-500 gap-2">
                <Video className="h-8 w-8 stroke-[1.2] text-slate-700" />
                <p className="text-xs font-bold text-slate-300">No footage clips found</p>
                <p className="text-[11px] text-slate-500">Try typing another keyword search prompt</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {brollResults.map((r) => {
                  const isSelected = selectedResult?.id === r.id
                  return (
                    <button
                      key={r.id}
                      disabled={isAttachingBroll}
                      onClick={() => setSelectedResult(isSelected ? null : r)}
                      className={`group relative block w-full overflow-hidden rounded-2xl border transition-all duration-200 aspect-[9/16] text-left disabled:opacity-50 ${isSelected
                          ? 'border-primary shadow-purpleGlow ring-2 ring-primary'
                          : 'border-dark-border bg-dark-panel2 hover:border-primary hover:shadow-purpleGlow'
                        }`}
                    >
                      <img src={r.thumbnail} alt="" className="h-full w-full object-cover group-hover:scale-105 transition duration-300 opacity-90 group-hover:opacity-100" />
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-dark-bg/80 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold text-white border border-dark-border">
                        <Clock className="h-2.5 w-2.5 text-primary" />
                        {formatDuration(r.duration)}
                      </span>
                      {isSelected && (
                        <span className="absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow-purpleGlow">
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                      )}
                      <span className={`absolute inset-0 items-center justify-center bg-dark-bg/60 backdrop-blur-[1px] text-xs font-bold text-white transition ${isSelected ? 'hidden' : 'hidden group-hover:flex'}`}>
                        Select Clip
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {isAttachingBroll && (
            <div className="border-t border-dark-border px-6 py-2.5 text-xs font-bold text-primary bg-primary/10 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Downloading & placing clip on timeline...
            </div>
          )}
        </div>

        {/* Right: Target Segment Preview Info & Reveal Settings */}
        <div className="hidden lg:flex w-80 flex-col items-center justify-start bg-dark-rail p-6 text-center border-l border-dark-border overflow-y-auto">
          {brollTargetRange ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary shadow-purpleGlow">
                <Video className="h-6 w-6" />
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
                  a plain text pill, so you can see what "Pop" vs "Zoom In"
                  vs "Bounce In" actually looks like before placing the clip. */}
              <div className="flex flex-col gap-2 w-full mt-1 text-left">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Reveal Animation</span>
                <RevealAnimationPicker value={selectedAnim} onChange={setSelectedAnim} columns={3} />
              </div>

              {/* Save — commits the selected clip with the layout/animation
                  chosen above. Nothing is downloaded or placed on the
                  timeline until this is clicked. */}
              <button
                type="button"
                disabled={!selectedResult || isAttachingBroll}
                onClick={() => attachBrollResult(selectedResult, attachOpts)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-purpleGlow transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none mt-2"
              >
                {isAttachingBroll ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    Save B-roll
                  </>
                )}
              </button>
              {!selectedResult && (
                <p className="text-[10px] text-slate-500 -mt-1">Pick a clip above first</p>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500 my-auto">Select a scene to place footage</div>
          )}
        </div>
      </div>
    </div>
  )
}