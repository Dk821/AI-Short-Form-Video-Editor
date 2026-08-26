/**
 * Overlay/broll source-consumption resolver — JS mirror of
 * backend/app/overlays/resolver.py's resolve_overlay_plan(). Keep the
 * two in lock-step: this is what gives the live preview and the
 * exported file strict duration/timing parity (the golden rule:
 * "Preview and export consume the same timeline model").
 *
 * Decides how a source video should be consumed to fill a
 * TimelineItem's `duration` on the timeline: trimmed, looped, or held
 * on its last frame — independent of the source file's own physical
 * length, and without ever touching that file.
 *
 * Rules (same as the backend):
 *   A. duration <= available source        -> "trim"  (no loop needed)
 *   B. duration >  available, loop allowed  -> "loop"  (repeat to fill)
 *   C. duration >  available, loop === false -> "hold" (freeze last frame)
 *
 * `probedSourceDuration` is used ONLY when `sourceDuration` wasn't
 * explicitly set on the item, so a pre-existing item (no new fields at
 * all) behaves exactly as it always did: "the whole remaining file,
 * from sourceStart onward, is the available window."
 */
export function resolveOverlayPlan({
  duration,
  sourceStart = 0,
  sourceDuration = null,
  loop = null,
  probedSourceDuration = null,
}) {
  const start = Math.max(0, sourceStart || 0)

  let available
  if (sourceDuration != null) {
    available = Math.max(0, sourceDuration)
  } else if (probedSourceDuration != null) {
    available = Math.max(0, probedSourceDuration - start)
  } else {
    // Source length unknown yet (e.g. metadata hasn't loaded) — assume
    // it's enough, same as the backend's fallback.
    available = duration
  }

  if (duration <= available) {
    return { mode: 'trim', sourceStart: start, consume: duration, timelineDuration: duration, holdDuration: 0 }
  }

  if (loop === false) {
    return {
      mode: 'hold',
      sourceStart: start,
      consume: available,
      timelineDuration: duration,
      holdDuration: Math.max(0, duration - available),
    }
  }

  return { mode: 'loop', sourceStart: start, consume: duration, timelineDuration: duration, holdDuration: 0 }
}
