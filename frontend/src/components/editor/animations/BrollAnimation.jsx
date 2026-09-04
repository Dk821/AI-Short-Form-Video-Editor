import React, { useState } from 'react'
import { DRIFT_ANIMS, brollDriftPct, BROLL_OVERSCAN } from './driftMotion'
import useOverlaySourceSync from './useOverlaySourceSync'

// Returns { wrapperStyle, innerStyle }.
//
// The WRAPPER is pinned to the B-roll's final target position/size and has
// overflow:hidden — so the media element can translate freely inside it
// without ever leaking outside its designated zone. This eliminates the
// black gap that used to appear when a slide-style B-roll was mid-travel
// (the absolute-positioned media element was off-screen, exposing the
// black canvas background behind it).
//
// The INNER element carries only the animation transform / opacity / clip-
// path — it is always 100%×100% of its clip wrapper, so objectFit:cover
// always fills the zone regardless of where the animation is at.
export function computeRevealStyle({ item, currentTime, layout }) {
  const anim = item.revealAnimation || 'slide_down'
  const dur = item.revealDuration || 0.5
  const p = Math.min(Math.max((currentTime - item.start) / dur, 0), 1)
  const ease = 1 - Math.pow(1 - p, 3)

  let transform = 'none'
  let opacity = item.opacity ?? 1
  let clipPath = 'none'

  // Once the reveal itself finishes, directional b-rolls keep drifting
  // slowly in the same direction they entered from instead of freezing —
  // a subtle continuous motion so the layer never goes fully static. Zero
  // while the entrance is still playing (kicks in only once settled).
  const drift = DRIFT_ANIMS.has(anim) ? brollDriftPct(currentTime, item, dur) : 0

  if (anim === 'slide_down') {
    // Starts above the clip box (translateY -100%) → slides to rest (0%).
    // The clip wrapper's overflow:hidden ensures nothing is visible outside
    // the wrapper, so mid-slide the canvas background is never exposed.
    transform = `translateY(${-100 * (1 - ease) + drift}%) scale(${BROLL_OVERSCAN})`
  } else if (anim === 'slide_up') {
    transform = `translateY(${100 * (1 - ease) - drift}%) scale(${BROLL_OVERSCAN})`
  } else if (anim === 'slide_left') {
    transform = `translateX(${100 * (1 - ease) - drift}%) scale(${BROLL_OVERSCAN})`
  } else if (anim === 'slide_right') {
    transform = `translateX(${-100 * (1 - ease) + drift}%) scale(${BROLL_OVERSCAN})`
  } else if (anim === 'bounce_in') {
    const bounce_p = p < 0.7 ? (p / 0.7) * 1.15 : 1.15 - ((p - 0.7) / 0.3) * 0.15
    transform = `translateY(${-100 * (1 - bounce_p) + drift}%) scale(${BROLL_OVERSCAN})`
  } else if (anim === 'fade_in') {
    opacity = opacity * p
  } else if (anim === 'zoom_in' || anim === 'pop') {
    const scale = 0.05 + 0.95 * ease
    transform = `scale(${scale})`
  } else if (anim === 'wipe_down') {
    // clip-path on the inner element (inside the overflow:hidden wrapper)
    // is fine — it clips relative to the inner element's own box.
    clipPath = `inset(0 0 ${(1 - p) * 100}% 0)`
  }

  const isFull = layout === 'full'
  const topPos = layout === 'split_bottom' ? '50%' : '0%'
  const heightPos = isFull ? '100%' : '50%'

  // Feather mask lives on the WRAPPER so it is applied at the layout
  // boundary (the edge between the two halves) rather than on the
  // animated inner element where it would shift with the transform.
  const featherMask = isFull
    ? undefined
    : layout === 'split_bottom'
      ? 'linear-gradient(to top, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)'
      : 'linear-gradient(to bottom, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)'

  // Wrapper: locked to final position, clips the inner animation.
  const wrapperStyle = {
    position: 'absolute',
    left: 0,
    top: topPos,
    width: '100%',
    height: heightPos,
    overflow: 'hidden',
    // Overlay layer, consistently above the base video (z-0) and below
    // captions (z-20) / speaker+CTA (z-30) — see VideoPreview.jsx's
    // layer comment. Matches RawSourceOverlayVideo and the template
    // overlay-video fallback, which both use z-10.
    zIndex: 8,
    WebkitMaskImage: featherMask,
    maskImage: featherMask,
  }

  // Inner element: fills 100% of the wrapper, carries only the animation.
  const innerStyle = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform,
    opacity,
    clipPath,
    // transformOrigin is set to the SEAM EDGE of the reveal direction so
    // that scale(BROLL_OVERSCAN) expands away from the split boundary
    // rather than into it. This guarantees the visible leading edge of the
    // B-roll inner = ease*50% exactly, perfectly aligned with the main
    // video's top = restTop*ease formula in SplitScreenLayout.jsx.
    //
    //   slide_down / bounce_in → seam is at the BOTTOM of the top-half
    //     wrapper → origin '50% 100%' (bottom center). Scale pushes UP.
    //   slide_up               → seam is at the TOP of the bottom-half
    //     wrapper → origin '50% 0%' (top center). Scale pushes DOWN.
    //   slide_left             → inner enters from the right; fix the
    //     right edge so the horizontal seam (inside the horizontal
    //     wrapper) doesn't drift → '100% 50%'.
    //   slide_right            → mirror → '0% 50%'.
    //   zoom_in / pop / others → no seam issue, keep center-center.
    transformOrigin:
      anim === 'slide_down' || anim === 'bounce_in' ? '50% 100%'
        : anim === 'slide_up' ? '50% 0%'
          : anim === 'slide_left' ? '100% 50%'
            : anim === 'slide_right' ? '0% 50%'
              : 'center center',
  }

  return { wrapperStyle, innerStyle }
}

export default function BrollAnimation({ item, asset, currentTime, src }) {
  const isVideo = asset.kind === 'video'
  const isBroll = item.type === 'broll'
  const layout = item.layout || (isBroll ? 'split_top' : 'full')

  // Dynamic overlay/broll duration & timing (see backend/app/overlays/ and
  // lib/overlayResolver.js): seeks this element to the right point in its
  // SOURCE (respecting sourceStart) and decides whether it should loop,
  // trim, or hold on its last frame once the source runs out — instead of
  // always starting at source t=0 and always looping, which used to be
  // this component's only behavior regardless of what the item asked for.
  const [videoEl, setVideoEl] = useState(null)
  useOverlaySourceSync(videoEl, item, currentTime)

  if (isBroll || layout === 'split_top' || layout === 'split_bottom' || layout === 'full') {
    const { wrapperStyle, innerStyle } = computeRevealStyle({ item, currentTime, layout })
    return (
      <div style={wrapperStyle} className="shadow-2xl">
        {isVideo ? (
          <video
            key={item.id}
            ref={setVideoEl}
            src={src}
            className="absolute object-cover"
            style={innerStyle}
            autoPlay
            muted
            playsInline
          />
        ) : (
          <img
            key={item.id}
            src={src}
            className="absolute object-cover"
            style={innerStyle}
          />
        )}
      </div>
    )
  }

  // Non-split, non-broll overlay (blend-mode overlays: grain, sparkles, etc.)
  const blendMode = item.blendMode || (item.type === 'overlay' ? 'screen' : 'normal')
  const style = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    opacity: item.opacity ?? 1,
    mixBlendMode: blendMode !== 'normal' ? blendMode : undefined,
    // Same overlay-layer z-index as the split/broll branch above — see the
    // comment on computeRevealStyle's own zIndex for the full layer order.
    zIndex: 10,
  }

  return isVideo ? (
    <video key={item.id} ref={setVideoEl} src={src} className="absolute shadow-2xl object-cover" style={style} autoPlay muted playsInline />
  ) : (
    <img key={item.id} src={src} className="absolute shadow-2xl object-cover" style={style} />
  )
}