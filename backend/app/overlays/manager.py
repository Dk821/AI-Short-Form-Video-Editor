"""
Public entry points for the overlay/broll duration-and-timing system.

render.py and the routers should import from HERE (not resolver.py /
validator.py directly) so validation + resolution stay a single
call-site contract instead of every caller re-deriving the sequence.
"""
from __future__ import annotations

from typing import List, Optional, TYPE_CHECKING

from .resolver import OverlayPlan, resolve_overlay_plan
from .validator import validate_overlay_timing

if TYPE_CHECKING:
    from ..models import Timeline, TimelineItem


def plan_for_item(item: "TimelineItem", probed_source_duration: Optional[float] = None) -> OverlayPlan:
    """Validates then resolves a single broll/overlay TimelineItem.
    Raises ValueError (see validator.py) on invalid timing — callers
    that must never crash a whole render (render.py) should catch this
    and skip just that item; callers that should reject bad input
    outright (save_timeline) should let it propagate as an HTTP 400."""
    validate_overlay_timing(
        duration=item.duration,
        start=item.start,
        source_start=item.sourceStart,
        source_duration=item.sourceDuration,
    )
    return resolve_overlay_plan(
        duration=item.duration,
        source_start=item.sourceStart,
        source_duration=item.sourceDuration,
        loop=item.loop,
        probed_source_duration=probed_source_duration,
    )


def validate_timeline_overlays(timeline: "Timeline") -> List[str]:
    """Validates every broll/overlay item on a Timeline without raising.
    Returns a list of human-readable problems (empty == all valid) so a
    caller like save_timeline can report every issue at once instead of
    failing on just the first one found."""
    errors: List[str] = []
    for track in timeline.tracks:
        if track.type not in ("broll", "overlay"):
            continue
        for item in track.items:
            try:
                validate_overlay_timing(
                    duration=item.duration,
                    start=item.start,
                    source_start=item.sourceStart,
                    source_duration=item.sourceDuration,
                )
            except ValueError as e:
                errors.append(f"{track.type} item '{item.id}': {e}")
    return errors
