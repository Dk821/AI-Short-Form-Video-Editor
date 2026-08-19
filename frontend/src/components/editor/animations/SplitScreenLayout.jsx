import React from 'react'
import { VERTICAL_DRIFT_ANIMS, mainDriftPct } from './driftMotion'

// Reveal styles that read as a vertical motion — the main video eases into
// its half in sync with these instead of hard-cutting to half height the
// instant the item goes active. Non-directional reveals (fade/zoom/none/
// horizontal slides) fade the main video into place instead, since a
// guessed slide direction wouldn't match.
const DIRECTIONAL_ANIMS = new Set(['slide_down', 'slide_up', 'bounce_in', 'wipe_down'])

export function computeBaseVideoStyle({ activeSplitItem, zoomScale, currentTime = 0 }) {
  if (activeSplitItem) {
    // Main video rests in the half NOT claimed by the split b-roll — mirrors
    // render.py's split-screen placement exactly (see _build_video_filtergraph).
    const restTop = activeSplitItem.layout === 'split_top' ? 50 : 0

    const anim = activeSplitItem.revealAnimation || 'slide_down'
    const dur = activeSplitItem.revealDuration || 0.5
    const p = Math.min(Math.max((currentTime - activeSplitItem.start) / dur, 0), 1)
    const ease = 1 - Math.pow(1 - p, 3)
    const isVerticalDrift = VERTICAL_DRIFT_ANIMS.has(anim)

    let top = restTop
    let height = 50
    let opacity = 1
    if (DIRECTIONAL_ANIMS.has(anim)) {
      // Shrink from fullscreen into its resting half instead of sliding a
      // fixed-size box in from off-frame. The edge against the OUTER frame
      // boundary stays anchored (flush with the screen edge the entire
      // time — top=0 for a top-resting half, bottom=100 for a
      // bottom-resting half — see the algebra below), so the main video
      // never exposes empty space mid-transition; only the edge facing the
      // b-roll's split boundary advances, in sync with the b-roll's own
      // reveal. That inner-edge motion reads as the same direction the
      // b-roll is revealing (down into a bottom half, up into a top half)
      // without ever leaving a gap the way an off-screen slide-in did.
      top = restTop * ease
      height = 100 - 50 * ease
    } else {
      opacity = ease
    }

    // Hold-phase parallax: once settled, keep drifting a little further in
    // the SAME direction the b-roll itself keeps moving (slide_down /
    // bounce_in -> down, slide_up -> up) — synced via the same
    // start/revealDuration/easing so the two layers move together.
    if (isVerticalDrift) {
      const sign = anim === 'slide_up' ? -1 : 1
      top += sign * mainDriftPct(currentTime, activeSplitItem, dur)
    }

    return {
      position: 'absolute',
      left: 0,
      top: `${top}%`,
      width: '100%',
      height: `${height}%`,
      objectFit: 'cover',
      opacity,
      transform: `scale(${zoomScale})`,
    }
  }

  return {
    height: '100%',
    width: '100%',
    objectFit: 'cover',
    transform: `scale(${zoomScale})`,
  }
}

export default function SplitScreenLayout({ children, activeSplitItem, zoomScale, currentTime }) {
  const style = computeBaseVideoStyle({ activeSplitItem, zoomScale, currentTime })
  return React.cloneElement(children, { style })
}
