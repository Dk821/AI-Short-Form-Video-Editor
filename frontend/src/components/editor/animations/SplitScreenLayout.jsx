import React from 'react'

// Animations where the B-roll physically moves/reveals toward the split axis.
const DIRECTIONAL_ANIMS = new Set([
  'slide_down',
  'slide_up',
  'slide_left',
  'slide_right',
  'bounce_in',
  'wipe_down',
])

// -----------------------------------------------------------------------------
// TOP SPLIT GEOMETRY
// -----------------------------------------------------------------------------
//
// The B-roll is visually displayed in the TOP 50%.
//
// However, the main video intentionally extends underneath the B-roll:
//
//   B-roll visible area: 0%  -> 50%
//   Main video layer:    40% -> 100%
//
// This gives us a 10% overlap:
//
//                 0%
// ┌─────────────────────────┐
// │                         │
// │       B-ROLL             │
// │                         │
// │                         │
// ├─────────────────────────┤ 50%
// │      MAIN VIDEO          │
// │                         │
// │                         │
// └─────────────────────────┘ 100%
//
// Main video actually starts at 40%, so the B-roll feather/soft edge
// has video underneath it instead of exposing the black canvas.
//
// The user still sees exactly 50% B-roll + 50% main video.
//
// -----------------------------------------------------------------------------

const TOP_BROLL_VISIBLE = 50

// Main video begins 10% above the visual B-roll boundary.
const TOP_MAIN_OVERLAP = 10

// Therefore:
//
// 50 - 10 = 40
//
// Main video occupies 40% -> 100% = 60%.
const TOP_MAIN_START =
  TOP_BROLL_VISIBLE - TOP_MAIN_OVERLAP

const TOP_MAIN_HEIGHT =
  100 - TOP_MAIN_START

/**
 * Calculate the base/main video style while B-roll is active.
 */
export function computeBaseVideoStyle({
  activeSplitItem,
  zoomScale,
  currentTime = 0,
}) {
  // ---------------------------------------------------------------------------
  // No active split B-roll
  // ---------------------------------------------------------------------------

  if (!activeSplitItem) {
    return {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: `scale(${zoomScale})`,
      transformOrigin: 'center center',
      zIndex: 0,
    }
  }

  const layout = activeSplitItem.layout
  const anim = activeSplitItem.revealAnimation || 'slide_down'

  const duration = Math.max(
    Number(activeSplitItem.revealDuration) || 0.5,
    0.001
  )

  const start = Number(activeSplitItem.start) || 0

  // ---------------------------------------------------------------------------
  // Animation progress
  // ---------------------------------------------------------------------------

  const rawP = Math.min(
    Math.max(
      (currentTime - start) / duration,
      0
    ),
    1
  )

  // Smooth cubic ease-out.
  const ease =
    1 - Math.pow(1 - rawP, 3)

  // ---------------------------------------------------------------------------
  // HARD CUT
  // ---------------------------------------------------------------------------

  if (anim === 'none') {
    if (layout === 'split_top') {
      return {
        position: 'absolute',
        left: 0,

        // IMPORTANT:
        // Start the main video at 40%, not 50%.
        //
        // This creates a 10% overlap underneath the B-roll feather.
        top: `${TOP_MAIN_START}%`,

        width: '100%',

        // 40% -> 100% = 60%.
        height: `${TOP_MAIN_HEIGHT}%`,

        objectFit: 'cover',
        transform: `scale(${zoomScale})`,
        transformOrigin: 'center center',
        zIndex: 0,
      }
    }

    return {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: `scale(${zoomScale})`,
      transformOrigin: 'center center',
      zIndex: 0,
    }
  }

  // ---------------------------------------------------------------------------
  // TOP SPLIT
  // ---------------------------------------------------------------------------

  if (layout === 'split_top') {
    // -------------------------------------------------------------------------
    // Directional animations
    // -------------------------------------------------------------------------

    if (DIRECTIONAL_ANIMS.has(anim)) {
      // wipe_down uses linear progress.
      //
      // Other directional animations use ease-out.
      const fraction =
        anim === 'wipe_down'
          ? rawP
          : ease

      // The MAIN VIDEO moves from:
      //
      // 0% -> 40%
      //
      // rather than:
      //
      // 0% -> 50%
      //
      // This intentionally creates the 10% overlap.
      const top =
        TOP_MAIN_START * fraction

      // Main video starts at 100% height and ends at 60%.
      //
      // 100% -> 60%
      const height =
        100 -
        TOP_MAIN_OVERLAP * fraction

      return {
        position: 'absolute',
        left: 0,
        top: `${top}%`,
        width: '100%',
        height: `${height}%`,

        objectFit: 'cover',

        transform: `scale(${zoomScale})`,
        transformOrigin: 'center center',

        // Main video must stay behind the B-roll.
        zIndex: 0,

        // Prevent transformed content from leaking outside.
        overflow: 'hidden',
      }
    }

    // -------------------------------------------------------------------------
    // FADE / ZOOM / POP
    // -------------------------------------------------------------------------

    if (
      anim === 'fade_in' ||
      anim === 'zoom_in' ||
      anim === 'pop'
    ) {
      /*
       * Even for visual-only animations, keep the main video underneath
       * the B-roll feather.
       *
       * The main video gradually moves:
       *
       * 0% -> 40%
       *
       * and ends with:
       *
       * top: 40%
       * height: 60%
       */

      const top =
        TOP_MAIN_START * ease

      const height =
        100 -
        TOP_MAIN_OVERLAP * ease

      return {
        position: 'absolute',
        left: 0,
        top: `${top}%`,
        width: '100%',
        height: `${height}%`,

        objectFit: 'cover',

        transform: `scale(${zoomScale})`,
        transformOrigin: 'center center',

        zIndex: 0,

        overflow: 'hidden',
      }
    }

    // -------------------------------------------------------------------------
    // Safe fallback
    // -------------------------------------------------------------------------

    const top =
      TOP_MAIN_START * ease

    const height =
      100 -
      TOP_MAIN_OVERLAP * ease

    return {
      position: 'absolute',
      left: 0,
      top: `${top}%`,
      width: '100%',
      height: `${height}%`,

      objectFit: 'cover',

      transform: `scale(${zoomScale})`,
      transformOrigin: 'center center',

      zIndex: 0,

      overflow: 'hidden',
    }
  }

  // ---------------------------------------------------------------------------
  // SPLIT BOTTOM
  // ---------------------------------------------------------------------------

  if (layout === 'split_bottom') {
    if (DIRECTIONAL_ANIMS.has(anim)) {
      const fraction =
        anim === 'wipe_down'
          ? rawP
          : ease

      const seam =
        TOP_BROLL_VISIBLE * fraction

      return {
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: `${100 - seam}%`,

        objectFit: 'cover',

        transform: `scale(${zoomScale})`,
        transformOrigin: 'center center',

        zIndex: 0,

        overflow: 'hidden',
      }
    }

    return {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',

      objectFit: 'cover',

      transform: `scale(${zoomScale})`,
      transformOrigin: 'center center',

      zIndex: 0,
    }
  }

  // ---------------------------------------------------------------------------
  // OTHER LAYOUTS
  // ---------------------------------------------------------------------------

  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',

    objectFit: 'cover',

    transform: `scale(${zoomScale})`,
    transformOrigin: 'center center',

    zIndex: 0,
  }
}

// -----------------------------------------------------------------------------
// COMPONENT
// -----------------------------------------------------------------------------

export default function SplitScreenLayout({
  children,
  activeSplitItem,
  zoomScale,
  currentTime,
}) {
  const style = computeBaseVideoStyle({
    activeSplitItem,
    zoomScale,
    currentTime,
  })

  return React.cloneElement(children, {
    style: {
      ...children.props?.style,
      ...style,
    },
  })
}