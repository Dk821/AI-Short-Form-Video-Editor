import { useEffect, useRef, useState } from 'react'
import {
  Search,
  X,
  ArrowLeft,
  Flame,
  Sparkles,
  Video,
  Loader2,
  Clock
} from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

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
  const debounceRef = useRef(null)

  useEffect(() => {
    setQuery(brollQuery)
  }, [brollLibraryOpen])

  const currentTemplateId = useEditorStore((s) => s.project?.templateId)
  const isSplitReaction = currentTemplateId === 'split_reaction'
  const attachOpts = isSplitReaction
    ? { layout: 'split_bottom', revealAnimation: 'slide_down', revealDuration: 0.5 }
    : { layout: 'full', revealAnimation: 'none', revealDuration: 0.5 }

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
                  className={`rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${
                    activeTab === t
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
                className={`flex items-center gap-1 rounded-xl px-3 py-1 text-xs font-bold transition-all ${
                  activeFilter === f
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
                {brollResults.map((r) => (
                  <button
                    key={r.id}
                    disabled={isAttachingBroll}
                    onClick={() => attachBrollResult(r, attachOpts)}
                    className="group relative block w-full overflow-hidden rounded-2xl border border-dark-border bg-dark-panel2 hover:border-primary hover:shadow-purpleGlow transition-all duration-200 aspect-[9/16] text-left disabled:opacity-50"
                  >
                    <img src={r.thumbnail} alt="" className="h-full w-full object-cover group-hover:scale-105 transition duration-300 opacity-90 group-hover:opacity-100" />
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-dark-bg/80 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold text-white border border-dark-border">
                      <Clock className="h-2.5 w-2.5 text-primary" />
                      {formatDuration(r.duration)}
                    </span>
                    <span className="absolute inset-0 hidden items-center justify-center bg-dark-bg/60 backdrop-blur-[1px] text-xs font-bold text-white group-hover:flex transition">
                      + Attach Footage
                    </span>
                  </button>
                ))}
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

        {/* Right: Target Segment Preview Info */}
        <div className="hidden lg:flex w-80 flex-col items-center justify-center bg-dark-rail p-8 text-center border-l border-dark-border">
          {brollTargetRange ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary shadow-purpleGlow">
                <Video className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Target Scene Segment</h4>
                <p className="text-sm font-bold text-slate-100 mt-1">
                  {brollTargetRange.start.toFixed(1)}s — {(brollTargetRange.start + brollTargetRange.duration).toFixed(1)}s
                </p>
                {brollTargetRange.label && (
                  <p className="text-xs text-slate-400 mt-2 bg-dark-panel border border-dark-border rounded-xl p-3 leading-relaxed">
                    "{brollTargetRange.label}"
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Select a scene to place footage</div>
          )}
        </div>
      </div>
    </div>
  )
}
