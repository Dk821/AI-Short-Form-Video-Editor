import { Layers, Check, X, Loader2 } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

function CaptionSample({ caption, accentColor }) {
  const text = caption.case === 'upper' ? 'THE HOOK' : 'the hook'
  const textShadow = caption.strokeWidth
    ? `-${caption.strokeWidth}px 0 ${caption.strokeColor}, 0 ${caption.strokeWidth}px ${caption.strokeColor}, ${caption.strokeWidth}px 0 ${caption.strokeColor}, 0 -${caption.strokeWidth}px ${caption.strokeColor}`
    : 'none'

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl"
      style={{
        background: `radial-gradient(120% 120% at 50% 0%, ${accentColor}33, #0D111A 65%)`,
      }}
    >
      <div
        className="absolute inset-x-3 flex justify-center"
        style={{
          top: caption.position === 'top' ? '12%' : caption.position === 'center' ? '42%' : undefined,
          bottom: caption.position === 'bottom' ? '12%' : undefined,
        }}
      >
        <span
          className="rounded-lg px-2.5 py-1 text-center font-bold leading-tight shadow-md border border-dark-border"
          style={{
            fontFamily: caption.fontFamily === 'Space Grotesk'
              ? "'Space Grotesk', sans-serif"
              : caption.fontFamily === 'Montserrat'
              ? "'Montserrat', sans-serif"
              : "'Inter', sans-serif",
            fontWeight: caption.fontWeight,
            fontSize: Math.max(11, caption.fontSize / 6.2),
            color: caption.color,
            textShadow,
            backgroundColor: caption.backgroundColor || 'transparent',
            letterSpacing: caption.case === 'upper' ? '0.03em' : 0,
          }}
        >
          {text}
        </span>
      </div>
    </div>
  )
}

export default function TemplateLibrary() {
  const {
    templateLibraryOpen,
    closeTemplateLibrary,
    templates,
    applyTemplate,
    isApplyingTemplate,
    applyTemplateError,
    project,
  } = useEditorStore()

  if (!templateLibraryOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 transition-all">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-dark-panel shadow-modal border border-dark-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dark-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-purpleGlow">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-tight">Template Library</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Bundling subtitle styling, typography, colors, animations, and aspect ratios.
              </p>
            </div>
          </div>
          <button
            onClick={closeTemplateLibrary}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-dark-panel2 hover:text-white transition"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {applyTemplateError && (
          <div className="border-b border-danger/30 bg-red-950/40 px-6 py-2.5 text-xs font-semibold text-danger">
            {applyTemplateError}
          </div>
        )}

        {/* Grid */}
        <div className="grid flex-1 grid-cols-2 gap-4 overflow-y-auto p-6 sm:grid-cols-3 md:grid-cols-4">
          {templates.map((t) => {
            const isApplied = project?.templateId === t.id
            return (
              <button
                key={t.id}
                disabled={isApplyingTemplate}
                onClick={() => applyTemplate(t.id)}
                className={`group flex flex-col overflow-hidden rounded-2xl border text-left transition-all duration-200 disabled:opacity-50 ${
                  isApplied
                    ? 'border-primary ring-2 ring-primary/40 shadow-purpleGlow'
                    : 'border-dark-border bg-dark-panel2 hover:border-primary/50'
                }`}
              >
                <div className="aspect-[9/12] w-full">
                  <CaptionSample caption={t.caption} accentColor={t.accentColor} />
                </div>
                <div className="flex flex-col gap-1 bg-dark-panel2 p-3 border-t border-dark-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 group-hover:text-primary transition">
                      {t.name}
                    </span>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
                      style={{ backgroundColor: t.accentColor }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-slate-500">
                    {t.aspectRatio} · {t.tags.join(', ')}
                  </span>
                  {isApplied && (
                    <span className="mt-1 flex items-center gap-1 text-[11px] font-bold text-primary">
                      <Check className="h-3 w-3" /> Applied
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {isApplyingTemplate && (
          <div className="border-t border-dark-border px-6 py-3 text-xs font-bold text-primary bg-primary/10 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Applying template styles & re-generating captions...
          </div>
        )}
      </div>
    </div>
  )
}
