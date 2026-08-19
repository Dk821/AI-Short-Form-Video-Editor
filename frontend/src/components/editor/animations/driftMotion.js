// Shared "hold-phase drift" math for the slide-style b-roll reveals: once a
// b-roll finishes sliding into place (and, for split layouts, once the main
// video finishes sliding into its complementary half), both keep drifting
// slowly in the same direction instead of freezing solid — a subtle
// parallax so the frame never goes fully static. BrollAnimation.jsx and
// SplitScreenLayout.jsx both import this so the two layers stay perfectly
// in sync (same start time, reveal duration, and easing curve); render.py
// mirrors the same constants/formula for the exported video.

// Reveal animations with a clear translate axis — the only ones that get
// continuous drift. fade_in/zoom_in/wipe_down/none have no directional
// motion to extend, so they stay put once revealed.
export const DRIFT_ANIMS = new Set(['slide_down', 'slide_up', 'slide_left', 'slide_right', 'bounce_in'])

// The main video's split half only ever moves vertically, so it only gets
// parallax drift for reveals that move that way.
export const VERTICAL_DRIFT_ANIMS = new Set(['slide_down', 'slide_up', 'bounce_in'])

// Seconds of being on screen (after the reveal itself finishes) it takes to
// ease up to the full drift amount — deliberately slow.
export const DRIFT_HOLD_SECONDS = 4

export const MAX_BROLL_DRIFT_PCT = 5
export const MAX_MAIN_DRIFT_PCT = 2

// The b-roll drift pans the video WITHIN its own fixed-position box (a CSS
// transform on an already-placed element), so it needs a constant overscan
// — rendered slightly larger than its box — or the pan would expose an
// empty edge. The main video's drift instead moves the box itself (its
// `top` position, same technique as its entrance), which stays fully
// opaque wherever it sits, so it needs no overscan.
export const BROLL_OVERSCAN = 1.14

function smoothstep(x) {
  const c = Math.min(Math.max(x, 0), 1)
  return c * c * (3 - 2 * c)
}

// 0 while still sliding in, eases smoothly up to 1 a few seconds after it
// settles (zero velocity at both ends, so there's no kink where the
// entrance ease hands off into the hold-phase drift).
export function driftFraction(currentTime, item, revealDuration) {
  const heldFor = Math.max(0, currentTime - item.start - revealDuration)
  return smoothstep(heldFor / DRIFT_HOLD_SECONDS)
}

export function brollDriftPct(currentTime, item, revealDuration) {
  return MAX_BROLL_DRIFT_PCT * driftFraction(currentTime, item, revealDuration)
}

export function mainDriftPct(currentTime, item, revealDuration) {
  return MAX_MAIN_DRIFT_PCT * driftFraction(currentTime, item, revealDuration)
}
