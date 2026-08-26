import { useEffect, useRef } from 'react'
import { resolveOverlayPlan } from '../../../lib/overlayResolver'

/**
 * Applies the overlay/broll resolver's decision to a real <video>
 * element: seeks it to the right point in the SOURCE (respecting
 * sourceStart, and — if the user scrubbed into the middle of the
 * item's active window rather than its very start — however far in
 * they landed), and sets its native `loop` attribute only when the
 * resolver actually decided to loop.
 *
 * Why this is enough, and doesn't need to run on every timeUpdate:
 * VideoPreview only renders this <video> for items where
 * `activeAt(item)` is true (see the `.filter(activeAt)` there and in
 * BrollAnimation's callers) — so React unmounts the element the
 * instant the item goes inactive and mounts a fresh one the next time
 * it goes active. That mount IS the "entering the active window"
 * moment; one seek there is all strict start-of-window parity needs.
 * From then on:
 *   - "trim": duration <= source available, so native playback alone
 *     never reaches the item's own end before the timeline does.
 *   - "loop": the native `loop` attribute restarts the element at
 *     source position 0 on repeat — which is also what ffmpeg's
 *     `-stream_loop` does for iterations after the first (it only
 *     honors `-ss` on the very first pass) — so preview and export
 *     agree on repeat behavior, not just on the first play-through.
 *   - "hold": no `loop` attribute, and mode="hold" only exists when
 *     the source's own natural length ends before the timeline slot
 *     does — so the browser's default "pause on end, last frame stays
 *     visible" behavior IS the hold, no extra code needed.
 */
export default function useOverlaySourceSync(videoEl, item, currentTime) {
  const appliedForRef = useRef(null)

  useEffect(() => {
    if (!videoEl || appliedForRef.current === item.id) return

    function apply() {
      const probed = videoEl.duration && isFinite(videoEl.duration) ? videoEl.duration : null
      const plan = resolveOverlayPlan({
        duration: item.duration,
        sourceStart: item.sourceStart || 0,
        sourceDuration: item.sourceDuration ?? null,
        loop: item.loop ?? null,
        probedSourceDuration: probed,
      })
      const elapsedSinceStart = Math.max(0, currentTime - item.start)
      videoEl.loop = plan.mode === 'loop'
      try {
        videoEl.currentTime = plan.sourceStart + Math.min(elapsedSinceStart, plan.consume)
      } catch {
        // Not seekable yet (some browsers throw pre-metadata) — the
        // loadedmetadata path below covers this case instead.
      }
      appliedForRef.current = item.id
    }

    if (videoEl.readyState >= 1) {
      apply()
    } else {
      videoEl.addEventListener('loadedmetadata', apply, { once: true })
      return () => videoEl.removeEventListener('loadedmetadata', apply)
    }
    // Only re-run when the element or the item identity changes — NOT on
    // every currentTime tick, or this would keep re-seeking mid-playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEl, item.id])
}
