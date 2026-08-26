"""
Template engine (Milestone 3, step 3).

The last leg of "AI decides -> Structured Edit Decisions -> Validation ->
Template Engine -> Timeline JSON". Takes an already-validated
EditDecisions object and mutates a Timeline by adding TimelineItems —
this is the ONLY place auto-edit output touches the timeline, and it
only ever adds well-formed items using the existing schema. The LLM
never produces timeline items or ffmpeg commands directly.

Template decides HOW — when a VideoTemplate is passed in, broll items
adopt the template's layout/scale/reveal settings and zoom items are
clamped to the template's minScale/maxScale range.
"""
from __future__ import annotations

import uuid
from typing import Optional, TYPE_CHECKING

from .ai_edit import EditDecisions
from .models import Timeline, Track, TimelineItem, Transform

if TYPE_CHECKING:
    from .templates.schema import VideoTemplate


def _find_or_create_track(timeline: Timeline, track_type: str) -> Track:
    for t in timeline.tracks:
        if t.type == track_type:
            return t
    track = Track(id=f"track_{track_type}", type=track_type, items=[])
    timeline.tracks.append(track)
    return track


def apply_edit_decisions(
    timeline: Timeline,
    decisions: EditDecisions,
    broll_assets: dict[str, str] | None = None,
    template: Optional["VideoTemplate"] = None,
) -> Timeline:
    """Turn validated decisions into TimelineItems.

    `broll_assets` maps a broll keyword to an already-fetched asset id
    (see pexels.py / the auto-edit router); when a keyword has no asset,
    the item stays a keyword-only suggestion that the renderer skips.

    `template` is the active VideoTemplate. When provided:
    - Broll items inherit layout, revealAnimation, revealDuration, and
      defaultScale from template.broll (template decides HOW).
    - Zoom items are clamped to template.zoom.minScale / maxScale.
    - Emphasis captions use template.caption.emphasisColor instead of a
      hardcoded fallback.
    """
    zoom_track = _find_or_create_track(timeline, "zoom")
    broll_track = _find_or_create_track(timeline, "broll")
    caption_track = _find_or_create_track(timeline, "caption")
    overlay_track = _find_or_create_track(timeline, "overlay")

    # ---- resolve template sub-config with safe defaults ----
    broll_cfg = template.broll if template else None
    zoom_cfg = template.zoom if template else None
    caption_cfg = template.caption if template else None

    # broll defaults (template decides HOW; these mirror BrollStyle defaults)
    b_layout = getattr(broll_cfg, "layout", "full") or "full"
    b_reveal = getattr(broll_cfg, "revealAnimation", "none") or "none"
    b_reveal_dur = getattr(broll_cfg, "revealDuration", 0.5) or 0.5
    b_scale = getattr(broll_cfg, "defaultScale", 0.55) or 0.55

    # zoom defaults
    z_min = getattr(zoom_cfg, "minScale", 1.1) or 1.1
    z_max = getattr(zoom_cfg, "maxScale", 1.5) or 1.5
    zoom_enabled = getattr(zoom_cfg, "enabled", True)

    # caption emphasis color
    emphasis_color = getattr(caption_cfg, "emphasisColor", None) or "#FBBF24"

    # overlay config — template decides HOW (which asset, duration bounds,
    # whether looping is appropriate); the AI only ever decides WHERE/WHEN
    # via a semantic style, never a filename or an exact ffmpeg duration.
    overlay_cfg = template.overlay if template else None
    overlay_video_url = getattr(template, "overlayVideoUrl", None) if template else None
    o_min = getattr(overlay_cfg, "minDuration", 1.0) or 1.0
    o_max = getattr(overlay_cfg, "maxDuration", 10.0) or 10.0
    o_default = getattr(overlay_cfg, "defaultDuration", 3.0) or 3.0
    o_supports_loop = getattr(overlay_cfg, "supportsLoop", True)
    o_opacity = getattr(overlay_cfg, "opacity", 1.0) or 1.0
    o_blend = getattr(overlay_cfg, "blendMode", "screen") or "screen"

    # Content-aware duration per semantic style (master prompt: a short
    # "hook" burst and a longer "ambient" texture should NOT default to
    # the same length) — a starting hint the AI's own start/end span can
    # still adjust, all bounded by the template's min/max so no single
    # overlay item can run implausibly short or long for its style.
    _STYLE_DURATION_HINT = {"hook": 4.5, "transition": 3.0, "emphasis": 3.0, "ambient": 7.0}

    for m in decisions.moments:
        duration = round(m.end - m.start, 3)

        if m.type == "zoom":
            if not zoom_enabled:
                # Template disables zoom (e.g. Podcast, Business) — skip
                continue
            # Clamp scale to template's configured range
            raw_scale = m.scale or 1.25
            scale = round(min(max(raw_scale, z_min), z_max), 3)
            zoom_track.items.append(
                TimelineItem(
                    id=f"zoom_{uuid.uuid4().hex[:8]}",
                    type="zoom",
                    start=m.start,
                    duration=duration,
                    transform=Transform(scale=scale),
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
                    # Template decides HOW: layout, reveal, scale
                    layout=b_layout,
                    revealAnimation=b_reveal,
                    revealDuration=b_reveal_dur,
                    transform=Transform(scale=b_scale),
                    zIndex=10,
                    keyword=m.keyword,
                )
            )

        elif m.type == "overlay":
            # No template, or the template has no bundled overlay asset —
            # the AI never invents a filename, so there is nothing to
            # place. Skip rather than fabricate a source.
            if not overlay_video_url:
                continue
            raw_span = m.end - m.start
            hint = _STYLE_DURATION_HINT.get(m.style, o_default)
            target = raw_span if raw_span > 0 else hint
            item_duration = round(min(max(target, o_min), o_max), 3)
            overlay_track.items.append(
                TimelineItem(
                    id=f"overlay_{uuid.uuid4().hex[:8]}",
                    type="overlay",
                    assetId=None,
                    sourceUrl=overlay_video_url,
                    start=m.start,
                    duration=item_duration,
                    sourceStart=0,
                    sourceDuration=None,
                    # ambient-style templates may loop the texture; anything
                    # meant as a one-shot flourish (hook/transition/emphasis
                    # burst) never loops — it trims or holds its last frame.
                    loop=None if o_supports_loop else False,
                    opacity=o_opacity,
                    blendMode=o_blend,
                    zIndex=200,
                    templateId=template.id if template else None,
                )
            )

        elif m.type == "emphasis_caption":
            for item in caption_track.items:
                item_end = item.start + item.duration
                if item.start < m.end and item_end > m.start:
                    item.fontSize = int((item.fontSize or 64) * 1.25)
                    # Use template's emphasisColor instead of hardcoded yellow
                    item.color = emphasis_color

    return timeline
