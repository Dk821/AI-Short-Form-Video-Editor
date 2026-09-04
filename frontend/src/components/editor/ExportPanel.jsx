import { Film, Globe, Repeat, X, Download, Loader2, CheckCircle2, AlertTriangle, Save } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

// The 3 export formats — see backend/app/render.py's render_timeline(fmt=...)
// for what each one actually renders differently. Keep this list and the
// backend's EXPORT_FORMATS set (routers/export.py) in sync.
const FORMATS = [
  {
    id: 'mp4',
    label: 'MP4',
    icon: Film,
    tagline: 'Standard video',
    description: 'H.264 + AAC audio. Universally playable — upload straight to TikTok, Reels, or YouTube Shorts.',
  },
  {
    id: 'webm',
    label: 'WebM',
    icon: Globe,
    tagline: 'Smaller, web-friendly',
    description: 'VP9 + Opus audio. Noticeably smaller file than MP4 at similar quality — good for embedding on a site.',
  },
  {
    id: 'gif',
    label: 'GIF',
    icon: Repeat,
    tagline: 'Looping preview',
    description: 'Silent, looping animated image. No audio track — handy for a quick preview, chat, or looping teaser.',
  },
]

// Keep in sync with backend/app/render.py's QUALITY_PRESETS.
const QUALITIES = [
  { id: 'draft', label: 'Draft', description: 'Fastest, smallest file' },
  { id: 'standard', label: 'Standard', description: 'Balanced (recommended)' },
  { id: 'high', label: 'High', description: 'Best quality, largest file' },
]

const FRAME_RATE_OPTIONS = [24, 30, 60]

export default function ExportPanel() {
  const {
    exportPanelOpen,
    closeExportPanel,
    exportFormat,
    setExportFormat,
    exportQuality,
    setExportQuality,
    exportFrameRate,
    setExportFrameRate,
    startExport,
    exportJob,
    timeline,
  } = useEditorStore()

  if (!exportPanelOpen) return null

  const jobStatus = exportJob?.status
  const isBusy = jobStatus === 'queued' || jobStatus === 'processing'
  const projectFps = timeline?.project?.fps || 30
  const progress = exportJob?.progress || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 transition-all">
      <div className="flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-3xl bg-dark-panel shadow-modal border border-dark-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dark-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-purpleGlow">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-tight">Export Video</h2>
              <p className="text-xs text-slate-400 mt-0.5">Choose a format, quality, and frame rate, then save.</p>
            </div>
          </div>
          <button
            onClick={closeExportPanel}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-dark-panel2 hover:text-white transition"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto">
          {/* Format options */}
          <div className="flex flex-col gap-2.5 p-6 pb-0">
            {FORMATS.map((f) => {
              const Icon = f.icon
              const selected = exportFormat === f.id
              return (
                <button
                  key={f.id}
                  disabled={isBusy}
                  onClick={() => setExportFormat(f.id)}
                  className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all disabled:opacity-50 ${
                    selected
                      ? 'border-primary ring-2 ring-primary/40 bg-primary/10'
                      : 'border-dark-border bg-dark-panel2 hover:border-primary/50'
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      selected ? 'bg-primary/20 text-primary' : 'bg-dark-panel text-slate-400'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-100">{f.label}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {f.tagline}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs leading-snug text-slate-400">{f.description}</p>
                  </div>
                  {selected && <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>

          {/* Quality */}
          <div className="px-6 pt-5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Video quality</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {QUALITIES.map((q) => {
                const selected = exportQuality === q.id
                return (
                  <button
                    key={q.id}
                    disabled={isBusy}
                    onClick={() => setExportQuality(q.id)}
                    className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-all disabled:opacity-50 ${
                      selected
                        ? 'border-primary ring-2 ring-primary/40 bg-primary/10 text-primary'
                        : 'border-dark-border bg-dark-panel2 text-slate-300 hover:border-primary/50'
                    }`}
                  >
                    <span className="text-xs font-bold">{q.label}</span>
                    <span className="text-[10px] leading-tight text-slate-500">{q.description}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Frame rate */}
          <div className="px-6 pt-5 pb-6">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Frame rate</span>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                disabled={isBusy}
                onClick={() => setExportFrameRate(null)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50 ${
                  exportFrameRate == null
                    ? 'border-primary ring-2 ring-primary/40 bg-primary/10 text-primary'
                    : 'border-dark-border bg-dark-panel2 text-slate-300 hover:border-primary/50'
                }`}
              >
                Match project ({projectFps}fps)
              </button>
              {FRAME_RATE_OPTIONS.map((fr) => {
                const selected = exportFrameRate === fr
                return (
                  <button
                    key={fr}
                    disabled={isBusy}
                    onClick={() => setExportFrameRate(fr)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50 ${
                      selected
                        ? 'border-primary ring-2 ring-primary/40 bg-primary/10 text-primary'
                        : 'border-dark-border bg-dark-panel2 text-slate-300 hover:border-primary/50'
                    }`}
                  >
                    {fr} fps
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Status / actions — three explicit states: Rendering, Completed, Failed */}
        <div className="border-t border-dark-border px-6 py-4">
          {isBusy && (
            <div className="mb-3 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-primary">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Rendering
                </span>
                <span className="font-mono text-[11px]">{progress}%</span>
              </div>
              {exportJob?.stage && (
                <p className="mt-1 text-[11px] text-slate-400">{exportJob.stage}</p>
              )}
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-dark-panel3">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.max(4, progress)}%` }}
                />
              </div>
            </div>
          )}

          {jobStatus === 'failed' && (
            <div className="mb-3 rounded-xl border border-danger/30 bg-red-950/40 px-3.5 py-2.5">
              <div className="flex items-start gap-2 text-xs font-bold text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Failed{exportJob?.errorStage ? ` during ${exportJob.errorStage}` : ''}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-[11px] font-medium text-danger/90">
                {exportJob.error || 'Export failed.'}
              </p>
            </div>
          )}

          {jobStatus === 'done' && exportJob.outputUrl && (
            <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Completed
              </div>
              <a
                href={exportJob.outputUrl}
                download
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/20 px-4 py-2.5 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/30"
              >
                <Download className="h-3.5 w-3.5" />
                Download {(exportJob.format || exportFormat).toUpperCase()}
              </a>
            </div>
          )}

          {exportJob?.warnings?.length > 0 && jobStatus === 'done' && (
            <p className="mb-3 text-[11px] leading-snug text-amber-300/80">
              Rendered with {exportJob.warnings.length} approximation
              {exportJob.warnings.length === 1 ? '' : 's'} — see the notes above.
            </p>
          )}

          <button
            onClick={() => startExport()}
            disabled={isBusy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-purpleGlow transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBusy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Rendering {exportFormat.toUpperCase()}...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                {jobStatus === 'done' || jobStatus === 'failed' ? 'Export again' : 'Export'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
