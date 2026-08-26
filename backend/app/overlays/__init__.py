"""
Dynamic overlay/broll duration & timing system.

Golden rule (from the architecture doc, and this master prompt's own
non-negotiable): "AI decides. Timeline stores. Renderer executes.
Preview and export consume the same timeline model."

This package is the ONE place that decides how a source video asset
(e.g. a 10s overlay.mp4) gets consumed to fill a TimelineItem's
`duration` on the timeline — trimmed, looped, or held on its last
frame — independent of the source file's own physical length, and
without ever modifying that source file.

  manager.py    Public entry points. render.py and the routers import
                from here, not from resolver.py/validator.py directly.
  resolver.py   Pure function: (duration, sourceStart, sourceDuration,
                loop, probed length) -> OverlayPlan (trim/loop/hold).
  validator.py  Rejects malformed timing (duration<=0, start<0, etc.)
                before it ever reaches the resolver or the renderer.

frontend/src/lib/overlayResolver.js mirrors resolve_overlay_plan()
exactly (same rules, same trim/loop/hold semantics) so the live
preview and the exported file always agree about when an overlay is
on screen and what part of its source is showing.
"""
from .manager import plan_for_item, validate_timeline_overlays

__all__ = ["plan_for_item", "validate_timeline_overlays"]
