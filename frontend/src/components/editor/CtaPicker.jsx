import { useEffect, useState } from 'react'
import {
  MousePointerClick, X, ArrowRight, Heart, ShoppingCart, Link2, Star, Flame, Bell, Play, Save,
} from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

// Icon id <-> picker button. The id strings are exactly what render.py's
// _CTA_ICON_GLYPHS and VideoPreview.jsx's CTA_ICON_GLYPHS key off of — the
// lucide component here is just this picker's own button glyph, a
// different (nicer-looking, interactive) stand-in for the same icon the
// exported video renders as a plain unicode character.
const CTA_ICONS = [
  { id: 'arrow', Icon: ArrowRight },
  { id: 'heart', Icon: Heart },
  { id: 'cart', Icon: ShoppingCart },
  { id: 'link', Icon: Link2 },
  { id: 'star', Icon: Star },
  { id: 'fire', Icon: Flame },
  { id: 'bell', Icon: Bell },
  { id: 'play', Icon: Play },
]

const COLOR_PRESETS = [
  { backgroundColor: '#7C3AED', color: '#FFFFFF', label: 'Purple' },
  { backgroundColor: '#DB2777', color: '#FFFFFF', label: 'Pink' },
  { backgroundColor: '#2563EB', color: '#FFFFFF', label: 'Blue' },
  { backgroundColor: '#FFFFFF', color: '#111827', label: 'White' },
  { backgroundColor: '#111827', color: '#FFFFFF', label: 'Black' },
]

const POSITIONS = [
  { id: 'top', label: 'Top' },
  { id: 'center', label: 'Center' },
  { id: 'bottom', label: 'Bottom' },
]

export default function CtaPicker() {
  const { ctaPickerOpen, closeCtaPicker, ctaTargetRange, attachCta } = useEditorStore()

  const [text, setText] = useState('Follow for more')
  const [ctaIcon, setCtaIcon] = useState('arrow')
  const [position, setPosition] = useState('top')
  const [colorIdx, setColorIdx] = useState(0)

  // A fresh open (or a new target scene) starts from the same sensible
  // defaults rather than whatever was left over from the last CTA placed.
  useEffect(() => {
    if (ctaPickerOpen) {
      setText('Follow for more')
      setCtaIcon('arrow')
      setPosition('top')
      setColorIdx(0)
    }
  }, [ctaPickerOpen, ctaTargetRange?.start])

  if (!ctaPickerOpen) return null

  const preset = COLOR_PRESETS[colorIdx]
  const canSave = text.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 transition-all">
      <div className="flex w-full max-w-lg max-h-[85vh] flex-col overflow-hidden rounded-3xl bg-dark-panel shadow-modal border border-dark-border">
        <div className="flex items-center justify-between border-b border-dark-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-purpleGlow">
              <MousePointerClick className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-tight">Call To Action</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {ctaTargetRange?.label ? `Placing on: "${ctaTargetRange.label}"` : 'A pill overlay prompting a viewer action.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeCtaPicker}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-dark-panel2 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Live preview of the pill, matching the export's own look */}
          <div className="flex items-center justify-center rounded-2xl border border-dark-border bg-dark-bg py-8">
            <span
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold shadow-lg shadow-black/40"
              style={{ backgroundColor: preset.backgroundColor, color: preset.color }}
            >
              {(() => {
                const Icon = CTA_ICONS.find((i) => i.id === ctaIcon)?.Icon
                return Icon ? <Icon className="h-4 w-4" /> : null
              })()}
              {text || 'Your text here'}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Text</span>
            <input
              autoFocus
              value={text}
              maxLength={40}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Follow for more"
              className="w-full rounded-xl border border-dark-border bg-dark-panel2 px-3.5 py-2.5 text-xs font-bold text-slate-100 outline-none focus:border-primary transition"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Icon</span>
            <div className="grid grid-cols-8 gap-1.5">
              {CTA_ICONS.map(({ id, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCtaIcon(ctaIcon === id ? null : id)}
                  className={`flex h-9 items-center justify-center rounded-xl transition ${ctaIcon === id
                      ? 'bg-primary text-white shadow-purpleGlow'
                      : 'bg-dark-panel2 text-slate-400 hover:bg-dark-panel3 hover:text-slate-200'
                    }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Color</span>
            <div className="flex items-center gap-2">
              {COLOR_PRESETS.map((c, idx) => (
                <button
                  key={c.label}
                  type="button"
                  title={c.label}
                  onClick={() => setColorIdx(idx)}
                  className={`h-8 w-8 rounded-full border-2 transition ${colorIdx === idx ? 'border-primary shadow-purpleGlow' : 'border-dark-border'
                    }`}
                  style={{ backgroundColor: c.backgroundColor }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Position</span>
            <div className="grid grid-cols-3 gap-1.5 bg-dark-panel2 p-1.5 rounded-2xl border border-dark-border">
              {POSITIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPosition(p.id)}
                  className={`rounded-xl px-2 py-1.5 text-[11px] font-bold transition-all ${position === p.id
                      ? 'bg-primary text-white shadow-purpleGlow'
                      : 'text-slate-400 hover:bg-dark-panel3 hover:text-slate-200'
                    }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-dark-border px-6 py-3.5 flex justify-end">
          <button
            type="button"
            disabled={!canSave}
            onClick={() => attachCta({ text, ctaIcon, position, color: preset.color, backgroundColor: preset.backgroundColor })}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-white shadow-purpleGlow hover:bg-primary-hover transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="h-3.5 w-3.5" />
            Add CTA
          </button>
        </div>
      </div>
    </div>
  )
}
