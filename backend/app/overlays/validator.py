"""
Overlay/broll item timing validation.

Only checks "is this item well-formed" — never decides trim/loop/hold
(that's resolver.py). Raises ValueError with a human-readable message;
callers decide whether that becomes an HTTP 400, a dropped item, or a
skipped render step.
"""
from __future__ import annotations

from typing import Optional


def validate_overlay_timing(
    *,
    duration: float,
    start: float = 0.0,
    source_start: float = 0.0,
    source_duration: Optional[float] = None,
) -> None:
    """Rules (master prompt "Validation Rules"):
      - duration must be > 0
      - start must be >= 0
      - sourceStart must be >= 0
      - sourceStart must be < sourceDuration, when sourceDuration is set
    """
    if duration is None or duration <= 0:
        raise ValueError(f"duration must be > 0 (got {duration!r})")
    if start is None or start < 0:
        raise ValueError(f"start must be >= 0 (got {start!r})")
    if source_start is None or source_start < 0:
        raise ValueError(f"sourceStart must be >= 0 (got {source_start!r})")
    if source_duration is not None and source_start >= source_duration:
        raise ValueError(
            f"sourceStart ({source_start!r}) must be < sourceDuration ({source_duration!r})"
        )
