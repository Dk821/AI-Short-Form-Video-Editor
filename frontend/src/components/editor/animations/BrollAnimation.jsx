import React from 'react'
import { DRIFT_ANIMS, brollDriftPct, BROLL_OVERSCAN } from './driftMotion'

export function computeRevealStyle({ item, currentTime, layout }) {
  const anim = item.revealAnimation || 'slide_down'
  const dur = item.revealDuration || 0.5
  const p = Math.min(Math.max((currentTime - item.start) / dur, 0), 1)
  const ease = 1 - Math.pow(1 - p, 3)

  let transform = 'translateY(0%)'
  let opacity = item.opacity ?? 1
  let clipPath = 'none'

  // Once the reveal itself finishes, directional b-rolls keep drifting
  // slowly in the same direction they entered from instead of freezing —
  // a subtle continuous motion so the layer never goes fully static. Zero
  // while the entrance is still playing (kicks in only once settled).
  const drift = DRIFT_ANIMS.has(anim) ? brollDriftPct(currentTime, item, dur) : 0

  if (anim === 'slide_down') {
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
    clipPath = `inset(0 0 ${(1 - p) * 100}% 0)`
  }

  const isFull = layout === 'full'
  const topPos = layout === 'split_bottom' ? '50%' : '0%'
  const heightPos = isFull ? '100%' : '50%'
  const featherMask = isFull
    ? undefined
    : layout === 'split_bottom'
      ? 'linear-gradient(to top, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)'
      : 'linear-gradient(to bottom, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)'

  return {
    position: 'absolute',
    left: 0,
    top: topPos,
    width: '100%',
    height: heightPos,
    objectFit: 'cover',
    transform,
    opacity,
    clipPath,
    zIndex: 15,
    WebkitMaskImage: featherMask,
    maskImage: featherMask,
  }
}

export default function BrollAnimation({ item, asset, currentTime, src }) {
  const isVideo = asset.kind === 'video'
  const isBroll = item.type === 'broll'
  const layout = item.layout || (isBroll ? 'split_top' : 'full')

  if (isBroll || layout === 'split_top' || layout === 'split_bottom') {
    const style = computeRevealStyle({ item, currentTime, layout })
    return isVideo ? (
      <video key={item.id} src={src} className="absolute shadow-2xl z-15 object-cover" style={style} autoPlay muted loop playsInline />
    ) : (
      <img key={item.id} src={src} className="absolute shadow-2xl z-15 object-cover" style={style} />
    )
  }

  const blendMode = item.blendMode || (item.type === 'overlay' ? 'screen' : 'normal')
  const style = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    opacity: item.opacity ?? 1,
    mixBlendMode: blendMode !== 'normal' ? blendMode : undefined,
    zIndex: 15,
  }

  return isVideo ? (
    <video key={item.id} src={src} className="absolute shadow-2xl z-10 object-cover" style={style} autoPlay muted loop playsInline />
  ) : (
    <img key={item.id} src={src} className="absolute shadow-2xl z-10 object-cover" style={style} />
  )
}