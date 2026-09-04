import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import useFontFamilies from '../../../lib/useFontFamilies'
import { resolveOverlayFont } from '../../../lib/captionLayout'

const WEIGHT_OPTIONS = [
  { label: 'Regular', value: 400 },
  { label: 'Medium', value: 500 },
  { label: 'Semibold', value: 600 },
  { label: 'Bold', value: 700 },
  { label: 'Heavy', value: 900 },
]
const ANIMATIONS = [
  { id: 'none', label: 'None' },
  { id: 'pop', label: 'Pop' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'underline', label: 'Underline' },
  { id: 'glow', label: 'Glow' },
]

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold text-slate-300 shrink-0">{label}</span>
      {children}
    </div>
  )
}

function ColorSwatch({ value, onChange, disabled }) {
  return (
    <label className={`flex items-center gap-2 rounded-xl border border-dark-border bg-dark-panel3 px-2.5 py-1.5 ${disabled ? 'opacity-40' : 'cursor-pointer hover:border-primary/60'}`}>
      <span className="h-5 w-5 rounded-lg border border-white/20 shrink-0" style={{ backgroundColor: value || 'transparent' }} />
      <span className="text-[11px] font-bold text-slate-300 uppercase">{value || '—'}</span>
      <input
        type="color"
        value={value || '#000000'}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
    </label>
  )
}

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-xl bg-dark-panel3 p-0.5 shadow-inner">
      {options.map((opt) => (
        <button
          key={opt.value ?? opt}
          type="button"
          onClick={() => onChange(opt.value ?? opt)}
          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${value === (opt.value ?? opt)
            ? 'bg-primary text-white shadow-purpleGlow'
            : 'text-slate-400 hover:text-slate-200'
            }`}
        >
          {opt.label ?? opt}
        </button>
      ))}
    </div>
  )
}

/**
 * "AI Stress Text Highlighter" style editor — opened from the boost
 * card's "Edit" action (Sidebar.jsx). `value` is the shared highlight
 * style (aggregated from the first caption item's stress* fields, since
 * Sidebar.jsx bulk-applies every change to every caption line the same
 * way it already does for the base caption style via updateAllCaptions).
 * Every control here calls `onChange` with a patch shaped exactly like
 * TimelineItem's stress* fields, live-applied immediately — same
 * no-draft-step convention as RevealAnimationModal.
 */
export default function StressHighlightModal({ value, onChange, onClose }) {
  // Dynamic — see useFontFamilies.js. backend/fonts/registry.json is the
  // single source of truth; there is no hardcoded FONTS list here any more.
  const FONTS = useFontFamilies()
  const [lastBgColor, setLastBgColor] = useState(value.stressBackgroundColor || '#FACC15')
  const [lastStrokeColor, setLastStrokeColor] = useState(value.stressStrokeColor || '#000000')

  // Live-sample font — resolved and loaded the SAME way the real stress
  // word will be (caption_layout.py's resolve_words(), via the same
  // per-file FontFace mechanism captions/CTA already use — see
  // resolveOverlayFont in captionLayout.js). Previously this preview set
  // a literal CSS font-family string (e.g. "'Poppins', sans-serif") with
  // no matching FontFace ever registered for most families, so it always
  // rendered in the browser's generic fallback font regardless of which
  // family was actually selected.
  const [previewFont, setPreviewFont] = useState(null)
  useEffect(() => {
    let cancelled = false
    setPreviewFont(null)
    resolveOverlayFont(
      value.stressFontFamily || 'Inter',
      value.stressFontWeight || 900,
      value.stressFontStyle || 'normal',
    ).then((font) => {
      if (!cancelled) setPreviewFont(font)
    })
    return () => { cancelled = true }
  }, [value.stressFontFamily, value.stressFontWeight, value.stressFontStyle])

  const hasBackground = value.stressBackgroundColor != null
  const strokeWidth = value.stressStrokeWidth != null ? value.stressStrokeWidth : (value.stressStrokeEnabled ? 2 : 0)
  const strokeOn = !!value.stressStrokeEnabled && strokeWidth > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 transition-all">
      <div className="flex w-full max-w-lg max-h-[85vh] flex-col overflow-hidden rounded-3xl bg-dark-panel shadow-modal border border-dark-border">
        <div className="flex items-center justify-between border-b border-dark-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-purpleGlow">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-tight">Stress Highlight Style</h2>
              <p className="text-xs text-slate-400 mt-0.5">Applies only to the detected stress words in your captions.</p>
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

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {/* Live sample */}
          <div className="flex min-h-[80px] w-full items-center justify-center overflow-hidden rounded-2xl bg-dark-panel3 px-4 py-6">
            <span className="max-w-full text-center text-sm font-black leading-relaxed text-slate-100 break-words">
              This is a{' '}
              <span
                className={`rounded-md px-1.5 py-0.5 stress-anim-${value.stressAnimation || 'none'}`}
                style={{
                  color: value.stressColor || '#0F172A',
                  backgroundColor: hasBackground ? value.stressBackgroundColor : 'transparent',
                  fontFamily: previewFont?.cssFamily || `'${value.stressFontFamily || 'Inter'}', sans-serif`,
                  fontWeight: previewFont ? 400 : (value.stressFontWeight || 900),
                  fontStyle: previewFont ? 'normal' : (value.stressFontStyle || 'normal'),
                  fontSize: value.stressFontSize ? `${Math.max(14, Math.round(value.stressFontSize / 3.0))}px` : undefined,
                  padding: `${(value.stressPadding ?? 12) / 2}px ${value.stressPadding ?? 12}px`,
                  borderRadius: `${value.stressCornerRadius ?? 10}px`,
                  WebkitTextStroke: strokeOn && strokeWidth > 0 ? `${strokeWidth}px ${value.stressStrokeColor || lastStrokeColor || '#000000'}` : 'none',
                  paintOrder: 'stroke fill',
                }}
              >
                stress word
              </span>
              {' '}highlighted.
            </span>
          </div>

          <Row label="Text color">
            <ColorSwatch value={value.stressColor || '#0F172A'} onChange={(c) => onChange({ stressColor: c })} />
          </Row>

          <Row label="No background">
            <button
              type="button"
              onClick={() => {
                if (hasBackground) {
                  setLastBgColor(value.stressBackgroundColor)
                  onChange({ stressBackgroundColor: null })
                } else {
                  onChange({ stressBackgroundColor: lastBgColor })
                }
              }}
              className={`toggle-switch ${!hasBackground ? 'active' : ''}`}
            />
          </Row>

          <Row label="Background color">
            <ColorSwatch
              value={hasBackground ? value.stressBackgroundColor : lastBgColor}
              disabled={!hasBackground}
              onChange={(c) => { setLastBgColor(c); onChange({ stressBackgroundColor: c }) }}
            />
          </Row>

          <div className="h-px bg-dark-border" />

          <Row label="Stroke / outline">
            <button
              type="button"
              onClick={() => {
                if (strokeOn) {
                  onChange({ stressStrokeEnabled: false, stressStrokeWidth: 0 })
                } else {
                  const restoredWidth = (value.stressStrokeWidth && value.stressStrokeWidth > 0) ? value.stressStrokeWidth : 2
                  onChange({
                    stressStrokeEnabled: true,
                    stressStrokeWidth: restoredWidth,
                    stressStrokeColor: value.stressStrokeColor || lastStrokeColor || '#000000',
                  })
                }
              }}
              className={`toggle-switch ${strokeOn ? 'active' : ''}`}
            />
          </Row>

          <Row label="Stroke color">
            <ColorSwatch
              value={strokeOn ? (value.stressStrokeColor || lastStrokeColor) : lastStrokeColor}
              disabled={!strokeOn}
              onChange={(c) => { setLastStrokeColor(c); onChange({ stressStrokeColor: c }) }}
            />
          </Row>

          <Row label="Stroke thickness">
            <div className="flex items-center gap-2 w-44">
              <input
                type="range"
                min={0}
                max={8}
                step={1}
                value={strokeOn ? strokeWidth : 0}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  if (val === 0) {
                    onChange({ stressStrokeWidth: 0, stressStrokeEnabled: false })
                  } else {
                    onChange({
                      stressStrokeWidth: val,
                      stressStrokeEnabled: true,
                      stressStrokeColor: value.stressStrokeColor || lastStrokeColor || '#000000',
                    })
                  }
                }}
                className="w-full accent-primary"
              />
              <span className="text-[11px] font-bold text-slate-400 w-10 text-right">
                {strokeOn && strokeWidth > 0 ? `${strokeWidth}px` : 'None'}
              </span>
            </div>
          </Row>

          <div className="h-px bg-dark-border" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-300 mb-1 block">Font Family</label>
              <select
                value={value.stressFontFamily || 'Inter'}
                onChange={(e) => onChange({ stressFontFamily: e.target.value })}
                className="w-full rounded-xl border border-dark-border bg-dark-panel3 px-3 py-2 text-xs font-bold text-slate-100 outline-none focus:border-primary cursor-pointer"
              >
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-300 mb-1 block">Font Weight</label>
              <select
                value={value.stressFontWeight || 900}
                onChange={(e) => onChange({ stressFontWeight: Number(e.target.value) })}
                className="w-full rounded-xl border border-dark-border bg-dark-panel3 px-3 py-2 text-xs font-bold text-slate-100 outline-none focus:border-primary cursor-pointer"
              >
                {WEIGHT_OPTIONS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </div>
          </div>

          <Row label="Text style">
            <SegmentedControl
              options={[{ label: 'Normal', value: 'normal' }, { label: 'Italic', value: 'italic' }]}
              value={value.stressFontStyle || 'normal'}
              onChange={(v) => onChange({ stressFontStyle: v })}
            />
          </Row>

          <Row label="Font size">
            <div className="flex items-center gap-2 w-40">
              <input
                type="range"
                min={32}
                max={140}
                step={2}
                value={value.stressFontSize || 72}
                onChange={(e) => onChange({ stressFontSize: Number(e.target.value) })}
                className="w-full accent-primary"
              />
              <span className="text-[11px] font-bold text-slate-400 w-8 text-right">{value.stressFontSize || 72}</span>
            </div>
          </Row>

          <div className="h-px bg-dark-border" />

          <Row label="Highlight padding">
            <div className="flex items-center gap-2 w-40">
              <input
                type="range"
                min={0}
                max={32}
                step={1}
                disabled={!hasBackground}
                value={value.stressPadding ?? 12}
                onChange={(e) => onChange({ stressPadding: Number(e.target.value) })}
                className="w-full accent-primary disabled:opacity-40"
              />
              <span className="text-[11px] font-bold text-slate-400 w-6 text-right">{value.stressPadding ?? 12}</span>
            </div>
          </Row>

          <Row label="Corner radius">
            <div className="flex items-center gap-2 w-40">
              <input
                type="range"
                min={0}
                max={24}
                step={1}
                disabled={!hasBackground}
                value={value.stressCornerRadius ?? 10}
                onChange={(e) => onChange({ stressCornerRadius: Number(e.target.value) })}
                className="w-full accent-primary disabled:opacity-40"
              />
              <span className="text-[11px] font-bold text-slate-400 w-6 text-right">{value.stressCornerRadius ?? 10}</span>
            </div>
          </Row>

          <Row label="Animation">
            <select
              value={value.stressAnimation || 'none'}
              onChange={(e) => onChange({ stressAnimation: e.target.value })}
              className="rounded-xl border border-dark-border bg-dark-panel3 px-3 py-2 text-xs font-bold text-slate-100 outline-none focus:border-primary cursor-pointer"
            >
              {ANIMATIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </Row>
          <p className="text-[11px] text-slate-500 -mt-2">
            Corner radius and animation preview live here and in the editor canvas. The exported video renders the highlight statically (ffmpeg has no rounded-box or per-word animation support) with everything else — color, background, stroke, font, padding — matching exactly.
          </p>
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
