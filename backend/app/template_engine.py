"""
Template engine (Milestone 3, step 3).

The last leg of "AI decides -> Structured Edit Decisions -> Validation ->
Template Engine -> Timeline JSON". Takes an already-validated
EditDecisions object and mutates a Timeline by adding TimelineItems —
this is the ONLY place auto-edit output touches the timeline, and it
only ever adds well-formed items using the existing schema. The LLM
never produces timeline items or ffmpeg commands directly.
"""
from __future__ import annotations

import uuid

from .ai_edit import EditDecisions
from .models import Timeline, Track, TimelineItem, Transform


def _find_or_create_track(timeline: Timeline, track_type: str) -> Track:
    for t in timeline.tracks:
        if t.type == track_type:
            return t
    track = Track(id=f"track_{track_type}", type=track_type, items=[])
    timeline.tracks.append(track)
    return track


def apply_edit_decisions(
    timeline: Timeline, decisions: EditDecisions, broll_assets: dict[str, str] | None = None
) -> Timeline:
    """Turn validated decisions into TimelineItems. `broll_assets` maps a
    broll keyword to an already-fetched asset id (see pexels.py / the
    auto-edit router); when a keyword has no asset, the item stays a
    keyword-only suggestion that the renderer skips."""
    zoom_track = _find_or_create_track(timeline, "zoom")
    broll_track = _find_or_create_track(timeline, "broll")
    caption_track = _find_or_create_track(timeline, "caption")

    for m in decisions.moments:
        duration = round(m.end - m.start, 3)

        if m.type == "zoom":
            zoom_track.items.append(
                TimelineItem(
                    id=f"zoom_{uuid.uuid4().hex[:8]}",
                    type="zoom",
                    start=m.start,
                    duration=duration,
                    transform=Transform(scale=m.scale or 1.25),
                    zIndex=50,
                )
            )

        elif m.type == "broll_suggestion":
            # assetId is filled in when the router found and downloaded a
            # Pexels clip for this keyword; otherwise it stays None and the
            # renderer skips the item rather than failing the export.
            asset_id = (broll_assets or {}).get(m.keyword)
            broll_track.items.append(
                TimelineItem(
                    id=f"broll_{uuid.uuid4().hex[:8]}",
                    type="broll",
                    assetId=asset_id,
                    start=m.start,
                    duration=duration,
                    zIndex=10,
                    keyword=m.keyword,
                )
            )

        elif m.type == "emphasis_caption":
            for item in caption_track.items:
                item_end = item.start + item.duration
                if item.start < m.end and item_end > m.start:
                    item.fontSize = int((item.fontSize or 64) * 1.25)
                    item.color = item.highlightColor or "#FBBF24"

    return timeline
