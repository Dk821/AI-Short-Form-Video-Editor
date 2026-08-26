import { Check, Video, User } from 'lucide-react'

// The only three screen layouts render.py/SplitScreenLayout.jsx actually
// support for a broll item — keep in sync with BrollPicker.jsx's old
// LAYOUTS array, models.py's TimelineItem.layout Literal, and render.py's
// `layout in ("full", "split_top", "split_bottom")` branch. Each entry's
// `broll`/`main` fractions describe the little schematic preview below,
// not a real rendering value.
export const BROLL_LAYOUTS = [
  { id: 'full', label: 'Full Screen', brollFrac: 1 },
  { id: 'split_top', label: 'Top Split', brollFrac: 0.5, brollFirst: true },
  { id: 'split_bottom', label: 'Bottom Split', brollFrac: 0.5, brollFirst: false },
]

/**
 * Visual layout picker — a grid of schematic cover-preview cards (one per
 * BROLL_LAYOUTS entry) showing where the b-roll clip sits vs. the main
 * video for that layout, with a checkmark badge on the selected card and
 * a name label underneath. Same card language as RevealAnimationPicker
 * (and the app's other card grids) — built from plain CSS blocks rather
 * than real photos since there's no bundled b-roll/speaker still frame,
 * but it reads the same way: a cover thumbnail, then the name.
 */
export default function LayoutPicker({ value, onChange, columns = 3 }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {BROLL_LAYOUTS.map((l) => {
        const isSelected = value === l.id
        const brollPct = `${l.brollFrac * 100}%`
        const mainPct = `${(1 - l.brollFrac) * 100}%`
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => onChange(l.id)}
            className={`group relative flex flex-col overflow-hidden rounded-2xl border transition-all ${
              isSelected
                ? 'border-primary ring-2 ring-primary/40 shadow-purpleGlow'
                : 'border-dark-border bg-dark-panel2 hover:border-primary/50'
            }`}
          >
            <div className="relative flex w-full flex-col overflow-hidden bg-dark-bg aspect-[9/16]">
              {l.brollFrac < 1 && l.brollFirst && (
                <div className="flex items-center justify-center bg-primary/25" style={{ height: brollPct }}>
                  <Video className="h-4 w-4 text-primary" />
                </div>
              )}
              {l.brollFrac < 1 && (
                <div className="flex items-center justify-center bg-dark-panel3" style={{ height: mainPct }}>
                  <User className="h-4 w-4 text-slate-500" />
                </div>
              )}
              {l.brollFrac < 1 && !l.brollFirst && (
                <div className="flex items-center justify-center bg-primary/25" style={{ height: brollPct }}>
                  <Video className="h-4 w-4 text-primary" />
                </div>
              )}
              {l.brollFrac === 1 && (
                <div className="flex flex-1 items-center justify-center bg-primary/25">
                  <Video className="h-5 w-5 text-primary" />
                </div>
              )}
              {isSelected && (
                <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white shadow-purpleGlow z-10">
                  <Check className="h-3 w-3" strokeWidth={3.5} />
                </span>
              )}
            </div>
            <span
              className={`px-2 py-1.5 text-[11px] font-bold text-center leading-tight ${
                isSelected ? 'text-primary bg-primary/10' : 'text-slate-300 bg-dark-panel2 group-hover:text-slate-100'
              }`}
            >
              {l.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
