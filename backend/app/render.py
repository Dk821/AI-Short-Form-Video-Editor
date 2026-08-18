"""
Server-side renderer.

Golden rule from the architecture doc: "Preview and export consume the
same timeline model." This module is the ONE place that turns Timeline
JSON into pixels. It never receives raw LLM output or ad-hoc commands,
only validated Timeline JSON (see models.Timeline).

MVP scope (first milestone in the doc):
  - one base video (trim / split via sourceStart + duration)
  - broll images/videos overlaid with position + timing
  - animated-ish captions via drawtext, timed per item
  - audio + sfx tracks mixed in with per-item volume and start offset

Not implemented yet (see README "Roadmap"): word-level caption
animation curves, zoom/ken-burns keyframes, transitions, GPU workers,
async job queue. The filter-graph approach below is the extension
point for all of those — each is another chained ffmpeg filter.
"""
from __future__ import annotations

import json
import shlex
import subprocess
from typing import Dict, List

from .models import Timeline, TimelineItem, Asset


def _escape_drawtext(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\u2019")
        .replace("%", "\\%")
    )


def _css_to_ffmpeg_color(css_hex: str) -> str:
    """'#RRGGBB' or '#RRGGBBAA' -> ffmpeg's '0xRRGGBB' or '0xRRGGBB@a.aa'."""
    h = css_hex.lstrip("#")
    if len(h) == 8:
        rgb, alpha_hex = h[:6], h[6:8]
        alpha = round(int(alpha_hex, 16) / 255, 3)
        return f"0x{rgb}@{alpha}"
    return f"0x{h}"


def _caption_y_expr(position: str, height: int) -> str:
    if position == "top":
        return f"{int(height * 0.08)}"
    if position == "center":
        return "(h-text_h)/2"
    return f"h-{int(height * 0.14)}-text_h"  # bottom (default)


def probe_duration(path: str) -> float:
    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", path,
        ],
        capture_output=True, text=True,
    )
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def probe_dimensions(path: str) -> tuple[int, int]:
    out = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=s=x:p=0", path,
        ],
        capture_output=True, text=True,
    )
    try:
        w, h = out.stdout.strip().split("x")
        return int(w), int(h)
    except Exception:
        return (0, 0)


def render_timeline(timeline: Timeline, assets: Dict[str, Asset], output_path: str) -> None:
    project = timeline.project
    W, H = project.width, project.height
    fps = project.fps

    tracks_by_type = {t.type: t for t in timeline.tracks}
    video_track = tracks_by_type.get("video")
    broll_track = tracks_by_type.get("broll")
    caption_track = tracks_by_type.get("caption")
    audio_track = tracks_by_type.get("audio")
    sfx_track = tracks_by_type.get("sfx")
    zoom_track = tracks_by_type.get("zoom")

    if not video_track or not video_track.items:
        raise ValueError("Timeline has no items on the video track")

    main_item = video_track.items[0]
    main_asset = assets[main_item.assetId]

    inputs: List[str] = []
    input_args: List[str] = []

    def add_input(path: str, extra: List[str] | None = None) -> int:
        idx = len(inputs)
        if extra:
            input_args.extend(extra)
        input_args.extend(["-i", path])
        inputs.append(path)
        return idx

    main_idx = add_input(main_asset.url, ["-ss", str(main_item.sourceStart), "-t", str(main_item.duration)])

    # Base video: scale to cover WxH, pad/crop to exact size, set fps.
    filters: List[str] = []
    filters.append(
        f"[{main_idx}:v]scale={W}:{H}:force_original_aspect_ratio=increase,"
        f"crop={W}:{H},fps={fps},setsar=1[base0]"
    )
    current = "base0"

    # Zoom moments (Milestone 3 auto-edit output, or manually added).
    # Implemented as a second scaled+cropped copy of the SAME main input,
    # overlaid full-frame only during the zoom window — a "punch in" that
    # reuses the overlay machinery below rather than needing zoompan/
    # per-frame filter expressions.
    zoom_items: List[TimelineItem] = zoom_track.items if zoom_track else []
    for i, item in enumerate(zoom_items):
        scale = max(item.transform.scale or 1.25, 1.01)
        zw, zh = int(W * scale), int(H * scale)
        pre = f"zoomsrc{i}"
        filters.append(
            f"[{main_idx}:v]scale={zw}:{zh}:force_original_aspect_ratio=increase,"
            f"crop={W}:{H},fps={fps},setsar=1[{pre}]"
        )
        end = item.start + item.duration
        nxt = f"zoomov{i}"
        filters.append(f"[{current}][{pre}]overlay=x=0:y=0:enable='between(t,{item.start},{end})'[{nxt}]")
        current = nxt

    # Broll & Overlay tracks. Items with no assetId are AI-suggested keywords
    # (see template_engine.py) awaiting real footage — skip them rather
    # than failing the whole export.
    overlay_track = tracks_by_type.get("overlay")
    all_overlay_items: List[TimelineItem] = [
        it for it in (broll_track.items if broll_track else []) + (overlay_track.items if overlay_track else [])
        if it.assetId
    ]
    for i, item in enumerate(sorted(all_overlay_items, key=lambda it: it.zIndex)):
        asset = assets[item.assetId]
        is_video = asset.kind == "video"
        extra = ["-t", str(item.duration)]
        if is_video:
            extra = ["-ss", str(item.sourceStart)] + extra
        else:
            extra = ["-loop", "1"] + extra
        idx = add_input(asset.url, extra)

        scale = item.transform.scale
        ow = int(W * (1.0 if item.type == "overlay" else 0.5) * scale)
        label_scaled = f"broll{i}s"
        filters.append(
            f"[{idx}:v]scale={ow}:-1,fps={fps},format=rgba,"
            f"colorchannelmixer=aa={item.opacity}[{label_scaled}]"
        )
        x_expr = f"{int(item.transform.x)}"
        y_expr = f"{int(item.transform.y)}"
        end = item.start + item.duration
        nxt = f"ov{i}"

        blend_mode = getattr(item, "blendMode", None) or ("screen" if item.type == "overlay" else "normal")
        if blend_mode == "screen":
            filters.append(
                f"[{current}][{label_scaled}]blend=all_mode=screen:"
                f"enable='between(t,{item.start},{end})'[{nxt}]"
            )
        else:
            filters.append(
                f"[{current}][{label_scaled}]overlay=x={x_expr}:y={y_expr}:"
                f"enable='between(t,{item.start},{end})'[{nxt}]"
            )
        current = nxt

    # Captions via drawtext. Style fields (font/color/stroke/background/
    # animation) come from the applied template's CaptionStyle — see
    # templates/schema.py — with sane fallbacks for hand-added captions
    # that never went through a template.
    caption_items: List[TimelineItem] = caption_track.items if caption_track else []
    for i, item in enumerate(caption_items):
        text = _escape_drawtext(item.text or "")
        end = item.start + item.duration
        y = _caption_y_expr(item.position or "bottom", H)
        nxt = f"cap{i}"

        parts = [
            f"text='{text}'",
            f"fontsize={item.fontSize}",
            f"fontcolor={item.color}",
            f"x=(w-text_w)/2",
            f"y={y}",
        ]
        if item.fontFamily:
            parts.append(f"font='{item.fontFamily}'")
        if item.backgroundColor:
            parts.append(f"box=1:boxcolor={_css_to_ffmpeg_color(item.backgroundColor)}:boxborderw=18")
        if item.strokeWidth and item.strokeColor:
            parts.append(f"borderw={item.strokeWidth}:bordercolor={item.strokeColor}")

        # Fade is the one animation style every template's `animation`
        # maps to at render time (pop/karaoke/slide_up render as fade
        # server-side; the richer per-word motion is a browser-preview-only
        # approximation — see VideoPreview.jsx).
        if (item.animation or "fade") != "none":
            fade_dur = min(0.18, item.duration / 2)
            parts.append(
                f"alpha='if(lt(t,{item.start}+{fade_dur}),(t-{item.start})/{fade_dur},"
                f"if(gt(t,{end}-{fade_dur}),({end}-t)/{fade_dur},1))'"
            )

        parts.append(f"enable='between(t,{item.start},{end})'")
        filters.append(f"[{current}]drawtext={':'.join(parts)}[{nxt}]")
        current = nxt

    video_out = current

    # Audio: main clip audio + audio track + sfx track, mixed.
    audio_labels = [f"{main_idx}:a"]
    extra_audio_inputs = []
    for item in (audio_track.items if audio_track else []) + (sfx_track.items if sfx_track else []):
        asset = assets[item.assetId]
        idx = add_input(asset.url, ["-ss", str(item.sourceStart), "-t", str(item.duration)])
        delay_ms = int(item.start * 1000)
        vol = item.volume if item.volume is not None else 1.0
        label = f"a{idx}"
        filters.append(
            f"[{idx}:a]volume={vol},adelay={delay_ms}|{delay_ms}[{label}]"
        )
        audio_labels.append(label)

    if len(audio_labels) > 1:
        mix_inputs = "".join(f"[{lbl}]" for lbl in audio_labels)
        filters.append(f"{mix_inputs}amix=inputs={len(audio_labels)}:dropout_transition=0[aout]")
        audio_out = "aout"
    else:
        audio_out = audio_labels[0]

    filter_complex = ";".join(filters)

    cmd = ["ffmpeg", "-y", *input_args,
           "-filter_complex", filter_complex,
           "-map", f"[{video_out}]", "-map", f"[{audio_out}]",
           "-r", str(fps), "-c:v", "libx264", "-preset", "veryfast",
           "-c:a", "aac", "-shortest", output_path]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{' '.join(shlex.quote(c) for c in cmd)}\n\n{proc.stderr[-4000:]}")
