import { useRef, useState } from 'react'
import { Music, X, Play, Pause, Loader2, Clock, Zap, Bell, Wind } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

// Category -> icon, purely cosmetic grouping of the bundled catalog (see
// backend/app/sfx/registry.py's SFX_CATALOG) — unknown/future categories
// fall back to the plain Music icon rather than crashing.
const CATEGORY_ICONS = {
  UI: Zap,
  Notification: Bell,
  Impact: Music,
  Transition: Wind,
}

function formatDuration(sec) {
  if (!sec) return ''
  return `${sec.toFixed(2)}s`
}

/**
 * SFX Library — bundled placeholder sounds (see backend/app/sfx/library/
 * README.txt), triggered by the same "+" -> Effects -> Sound flow as
 * Zoom. Same modal shell as RevealAnimationModal/TemplateLibrary (icon+
 * title+close header, scrollable grid body) since there's no per-item
 * config to make (unlike B-roll's layout/reveal/duration side panel) —
 * clicking a card attaches it immediately, same live-apply feel as
 * picking a reveal animation.
 */
export default function SfxPicker() {
  const {
    sfxPickerOpen, closeSfxPicker, sfxCatalog, isLoadingSfxCatalog,
    isAttachingSfx, sfxError, attachSfxResult, sfxTargetRange,
  } = useEditorStore()

  const [previewingId, setPreviewingId] = useState(null)
  const audioRef = useRef(null)

  if (!sfxPickerOpen) return null

  function togglePreview(entry) {
    const audio = audioRef.current
    if (!audio) return
    if (previewingId === entry.id) {
      audio.pause()
      setPreviewingId(null)
      return
    }
    audio.src = entry.url
    audio.currentTime = 0
    audio.play().catch(() => {})
    setPreviewingId(entry.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 transition-all">
      <audio ref={audioRef} onEnded={() => setPreviewingId(null)} />
      <div className="flex w-full max-w-lg max-h-[85vh] flex-col overflow-hidden rounded-3xl bg-dark-panel shadow-modal border border-dark-border">
        <div className="flex items-center justify-between border-b border-dark-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-purpleGlow">
              <Music className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-tight">Sound Effects</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {sfxTargetRange?.label ? `Placing on: "${sfxTargetRange.label}"` : 'Pick a sound to place here.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSfxPicker}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-dark-panel2 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {sfxError && (
            <div className="mb-4 rounded-2xl border border-danger/30 bg-red-950/40 p-3 text-xs font-semibold text-danger">
              {sfxError}
            </div>
          )}

          {isLoadingSfxCatalog ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span className="text-xs font-semibold text-slate-400">Loading sound library...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {sfxCatalog.map((entry) => {
                const Icon = CATEGORY_ICONS[entry.category] || Music
                const isPreviewing = previewingId === entry.id
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2.5 rounded-2xl border border-dark-border bg-dark-panel2 p-2.5 hover:border-primary/60 transition"
                  >
                    <button
                      type="button"
                      onClick={() => togglePreview(entry)}
                      title={isPreviewing ? 'Stop preview' : 'Preview sound'}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-dark-panel3 text-primary hover:bg-primary/20 transition"
                    >
                      {isPreviewing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                    </button>

                    <button
                      type="button"
                      disabled={isAttachingSfx}
                      onClick={() => attachSfxResult(entry)}
                      className="flex flex-1 min-w-0 flex-col items-start text-left disabled:opacity-50"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-100 truncate w-full">
                        <Icon className="h-3 w-3 text-slate-500 shrink-0" />
                        {entry.name}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDuration(entry.duration)} · {entry.category}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {isAttachingSfx && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Placing sound on timeline...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
