import { Wand2, X } from 'lucide-react'
import RevealAnimationPicker from './RevealAnimationPicker'

/**
 * "Edit Transition" popup — lets you change an already-placed b-roll/
 * overlay item's reveal animation from a full card grid instead of the
 * compact text-pill row. Same modal shell as TemplateLibrary/BrollPicker/
 * ExportPanel (backdrop, rounded-3xl panel, header with icon+title+close),
 * so it reads as the same app rather than a bolted-on popup.
 *
 * Selecting a card applies immediately via onChange (same live-apply
 * behavior as the picker always had — there's nothing to "save", so
 * there's no separate confirm step, just a Done button to close).
 */
export default function RevealAnimationModal({ value, onChange, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 transition-all">
      <div className="flex w-full max-w-lg max-h-[85vh] flex-col overflow-hidden rounded-3xl bg-dark-panel shadow-modal border border-dark-border">
        <div className="flex items-center justify-between border-b border-dark-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-purpleGlow">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-tight">Reveal Animation</h2>
              <p className="text-xs text-slate-400 mt-0.5">Choose how this clip enters the frame.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-dark-panel2 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <RevealAnimationPicker value={value} onChange={onChange} columns={3} />
        </div>

        <div className="border-t border-dark-border px-6 py-3.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-white shadow-purpleGlow hover:bg-primary-hover transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
