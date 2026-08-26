import { Check } from 'lucide-react'

// The full set of reveal styles the renderer/preview actually support —
// see backend/app/render.py's broll/overlay loop and
// BrollAnimation.jsx's computeRevealStyle. Keep this list, models.py's
// TimelineItem.revealAnimation Literal, and templates/schema.py's
// BrollStyle.revealAnimation Literal in sync — a style added to only one
// of the three either can't be picked (missing here) or gets silently
// rejected on save (missing from a Literal).
export const REVEAL_ANIMATIONS = [
  { id: 'none', label: 'None' },
  { id: 'slide_down', label: 'Slide Down' },
  { id: 'slide_up', label: 'Slide Up' },
  { id: 'slide_left', label: 'Slide Left' },
  { id: 'slide_right', label: 'Slide Right' },
  { id: 'fade_in', label: 'Fade In' },
  { id: 'zoom_in', label: 'Zoom In' },
  { id: 'pop', label: 'Pop' },
  { id: 'wipe_down', label: 'Wipe Down' },
  { id: 'bounce_in', label: 'Bounce In' },
]

// Each card plays the REAL reveal animation (same directions/easing as
// computeRevealStyle in BrollAnimation.jsx) directly on its thumbnail
// image — see public/reveal-thumbnails/<id>.jpg (drop your own frame in
// there, same filename, to replace the placeholder — see that folder's
// README.txt). A short, readable loop: reveal in, hold, replay — not a
// constant slide — so the card is legible at a glance, same as before.
const KEYFRAMES = `
@keyframes revealPreview-none { 0%, 100% { opacity: 1; transform: none; } }
@keyframes revealPreview-slide_down {
  0% { transform: translateY(-120%); opacity: 0; }
  22% { transform: translateY(0); opacity: 1; }
  85% { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(-120%); opacity: 0; }
}
@keyframes revealPreview-slide_up {
  0% { transform: translateY(120%); opacity: 0; }
  22% { transform: translateY(0); opacity: 1; }
  85% { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(120%); opacity: 0; }
}
@keyframes revealPreview-slide_left {
  0% { transform: translateX(120%); opacity: 0; }
  22% { transform: translateX(0); opacity: 1; }
  85% { transform: translateX(0); opacity: 1; }
  100% { transform: translateX(120%); opacity: 0; }
}
@keyframes revealPreview-slide_right {
  0% { transform: translateX(-120%); opacity: 0; }
  22% { transform: translateX(0); opacity: 1; }
  85% { transform: translateX(0); opacity: 1; }
  100% { transform: translateX(-120%); opacity: 0; }
}
@keyframes revealPreview-fade_in {
  0% { opacity: 0; }
  22% { opacity: 1; }
  85% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes revealPreview-zoom_in {
  0% { transform: scale(0.15); opacity: 0; }
  22% { transform: scale(1); opacity: 1; }
  85% { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.15); opacity: 0; }
}
@keyframes revealPreview-pop {
  0% { transform: scale(0.15); opacity: 0; }
  16% { transform: scale(1.12); opacity: 1; }
  22% { transform: scale(0.96); }
  27% { transform: scale(1); }
  85% { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.15); opacity: 0; }
}
@keyframes revealPreview-wipe_down {
  0% { clip-path: inset(0 0 100% 0); opacity: 1; }
  22% { clip-path: inset(0 0 0 0); }
  85% { clip-path: inset(0 0 0 0); }
  100% { clip-path: inset(0 0 100% 0); }
}
@keyframes revealPreview-bounce_in {
  0% { transform: translateY(-120%); opacity: 0; }
  14% { transform: translateY(6%); opacity: 1; }
  19% { transform: translateY(-3%); }
  24% { transform: translateY(0); }
  85% { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(-120%); opacity: 0; }
}
`

/**
 * Visual, live-animated reveal-style picker — a grid of thumbnail cards
 * (one per REVEAL_ANIMATIONS entry), each playing its actual reveal
 * effect on top of a real image (public/reveal-thumbnails/<id>.jpg),
 * with a checkmark badge on the selected card — same layout language as
 * the app's other card grids (TemplateLibrary, ExportPanel). Used both
 * inline (the B-roll attach modal) and inside RevealAnimationModal (the
 * "Edit Transition" popup for an already-placed item).
 */
export default function RevealAnimationPicker({ value, onChange, columns = 3 }) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <style>{KEYFRAMES}</style>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {REVEAL_ANIMATIONS.map((anim) => {
          const isSelected = value === anim.id
          return (
            <button
              key={anim.id}
              type="button"
              onClick={() => onChange(anim.id)}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border transition-all ${
                isSelected
                  ? 'border-primary ring-2 ring-primary/40 shadow-purpleGlow'
                  : 'border-dark-border bg-dark-panel2 hover:border-primary/50'
              }`}
            >
              <div className="relative w-full overflow-hidden bg-dark-bg aspect-[9/16]">
                <img
                  src={`/reveal-thumbnails/${anim.id}.jpg`}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    animation: `revealPreview-${anim.id} 2.4s ease-in-out infinite`,
                    animationDelay: '0.2s',
                  }}
                  onError={(e) => {
                    e.currentTarget.style.animation = 'none'
                    e.currentTarget.style.opacity = 0
                  }}
                  draggable={false}
                />
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
                {anim.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
