"""
Overlay/broll source-consumption resolver.

Decides, for one broll/overlay TimelineItem, how the SOURCE asset
should be played to fill the TIMELINE duration it's been given — a
pure function, no ffmpeg/DOM/IO here, so it can be exercised by unit
tests and mirrored line-for-line in the frontend
(overlayResolver.js).

Inputs, all read straight off the TimelineItem (see models.py):
  duration               how long the item shows ON THE TIMELINE.
  source_start            in-point inside the source asset (seconds).
  source_duration          how much of the source to consume from
                           source_start onward, before trim/loop/hold
                           kicks in. None = "use the source's whole
                           remaining length" (see probed_source_duration).
  loop                    None = auto (loop only if the source runs out
                           before the timeline duration does), True =
                           force loop even when not needed, False =
                           never loop — hold the last frame instead.
  probed_source_duration  the REAL ffprobe'd (or HTMLMediaElement-
                           reported) length of the source file. Used
                           ONLY when source_duration wasn't explicitly
                           set, so a pre-existing item with no new
                           fields at all keeps behaving exactly as it
                           did before this system existed: "the whole
                           remaining file, from source_start onward,
                           is the available window."

Output: an OverlayPlan describing exactly what to feed ffmpeg's input
options (mode == "trim"/"loop": -ss source_start -t consume, plus
-stream_loop -1 for "loop") and, for the frontend, what to seek an
HTML5 <video> to and whether to set its `loop` attribute.

Three rules, matching the master prompt's Rule A/B/C:
  A. duration <= available source        -> "trim"  (no loop needed)
  B. duration >  available, loop allowed  -> "loop"  (repeat to fill)
  C. duration >  available, loop == False -> "hold"  (freeze last frame
                                                        for the remainder)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class OverlayPlan:
    mode: str                   # "trim" | "loop" | "hold"
    source_start: float         # where in the source to start (-ss)
    consume: float              # seconds of source ffmpeg should read (-t)
    timeline_duration: float    # the on-screen duration this plan fills (== item.duration)
    hold_duration: float = 0.0  # "hold" only: extra seconds to freeze the last frame for


def resolve_overlay_plan(
    *,
    duration: float,
    source_start: float = 0.0,
    source_duration: Optional[float] = None,
    loop: Optional[bool] = None,
    probed_source_duration: Optional[float] = None,
) -> OverlayPlan:
    source_start = max(0.0, source_start or 0.0)

    if source_duration is not None:
        available = max(0.0, source_duration)
    elif probed_source_duration is not None:
        available = max(0.0, probed_source_duration - source_start)
    else:
        # Source length unknown (e.g. an unprobed template-bundled asset).
        # Assume it's at least as long as requested — behaves as a plain
        # trim, same as ffmpeg's own -t past end-of-file behavior.
        available = duration

    if duration <= available:
        # Rule A: source has enough — simple trim, no loop.
        return OverlayPlan(mode="trim", source_start=source_start, consume=duration,
                            timeline_duration=duration)

    if loop is False:
        # Rule C: looping explicitly disabled — play what's there once,
        # then hold on the last frame for the rest of the timeline slot.
        return OverlayPlan(mode="hold", source_start=source_start, consume=available,
                            timeline_duration=duration, hold_duration=round(duration - available, 6))

    # Rule B: loop is None (auto) or True — loop to fill the timeline duration.
    return OverlayPlan(mode="loop", source_start=source_start, consume=duration,
                        timeline_duration=duration)
