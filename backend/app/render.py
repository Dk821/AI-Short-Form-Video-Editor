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
import os
import platform
import shlex
import subprocess
import tempfile
from typing import Dict, List

from .models import Timeline, TimelineItem, Asset


# Hold-phase parallax drift — mirrors frontend/src/components/editor/
# animations/driftMotion.js exactly (same constants, same smoothstep
# easing) so the exported video matches the live preview: once a
# directional b-roll reveal finishes, the b-roll (and, for split layouts,
# the main video) keeps drifting slowly in the same direction instead of
# freezing solid the instant the reveal ends.
_DRIFT_HOLD_SECONDS = 4.0
_MAX_BROLL_DRIFT_PCT = 5.0
_MAX_MAIN_DRIFT_PCT = 2.0
# Any translate-axis reveal gets continuous b-roll drift; fade/zoom/wipe/none
# have no direction to extend. The main video's split half only ever moves
# vertically, so it only parallaxes for the vertical-reading subset.
_DIRECTIONAL_DRIFT_ANIMS = {"slide_down", "slide_up", "slide_left", "slide_right", "bounce_in"}
_VERTICAL_DRIFT_ANIMS = {"slide_down", "slide_up", "bounce_in"}


def _drift_frac_expr(start: float, dur: float) -> str:
    """FFmpeg expression matching driftMotion.js's driftFraction(): 0 while
    the reveal is still playing, smoothstep-eases to 1 a few seconds after
    it settles (zero velocity at both ends, so there's no kink where the
    entrance ease hands off into the hold-phase drift)."""
    held = f"max(0,(t-{start}-{dur})/{_DRIFT_HOLD_SECONDS})"
    c = f"min(max({held},0),1)"
    return f"({c}*{c}*(3-2*{c}))"


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
        return f"{int(height * 0.60)}-(text_h/2)"
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


def _build_video_filtergraph(timeline: Timeline, assets: Dict[str, Asset]):
    """Builds everything needed to turn Timeline JSON into a single
    composited video stream: the ffmpeg input args, the filter_complex
    steps, and the label of the final video output.

    This is the shared core of render_timeline (full export) and
    capture_frame (single-frame project-cover capture) — pulling it out
    means a cover thumbnail is always built from literally the same
    filter graph as the real export, not a separate approximation that
    could quietly drift out of sync with it.

    Returns (input_args, filters, video_out, main_idx, W, H, fps, add_input,
    audio_track, sfx_track) — render_timeline uses the trailing few to keep
    building the audio side; capture_frame stops at video_out.
    """
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

    overlay_track = tracks_by_type.get("overlay")
    all_overlay_items: List[TimelineItem] = [
        it for it in (broll_track.items if broll_track else []) + (overlay_track.items if overlay_track else [])
        if it.assetId or it.sourceUrl
    ]

    # Only an item that actually claims split_top/split_bottom should push the
    # main video into a half-height slot — a "full" layout broll/overlay is
    # meant to float on top of the still-full-screen main video (this matches
    # the frontend's SplitScreenLayout: only an item with layout split_top/
    # split_bottom becomes the `activeSplitItem`).
    split_items = [
        it for it in all_overlay_items
        if getattr(it, "layout", "full") in ("split_top", "split_bottom")
    ]

    filters: List[str] = []
    # Base layer is always the full-frame main video. A split_top/split_bottom
    # item shrinks it into its complementary half only for as long as that
    # item is actually on screen (below), animated in sync with the item's
    # own reveal — never a permanent half-height crop for the whole render.
    filters.append(
        f"[{main_idx}:v]scale={W}:{H}:force_original_aspect_ratio=increase,"
        f"crop={W}:{H},fps={fps},setsar=1[base0]"
    )
    current = "base0"

    # Reveal styles that read as vertical motion — the main video eases into
    # its half in sync with these instead of hard-cutting to half height the
    # instant the item goes active. Non-directional reveals fade the main
    # half into place instead.
    _directional_anims = {"slide_down", "slide_up", "bounce_in", "wipe_down"}

    for i, split_item in enumerate(split_items):
        half_h = H // 2
        # Main video sits in the half NOT claimed by the split item — a
        # split_top item (top half) puts the main video at the bottom, and
        # a split_bottom item (bottom half) puts the main video at the top.
        # This must mirror SplitScreenLayout.jsx's computeBaseVideoStyle
        # exactly, or preview and export disagree about where the speaker
        # ends up (the one golden rule this module is built around).
        main_rest_y = 0 if split_item.layout == "split_bottom" else half_h

        anim = getattr(split_item, "revealAnimation", "slide_down") or "slide_down"
        dur = max(getattr(split_item, "revealDuration", 0.5) or 0.5, 0.01)
        s_start = split_item.start
        s_end = s_start + split_item.duration
        # NOTE: this ease_expr feeds the geq alpha mask below, not overlay's
        # x/y or enable — and geq's eval context names the time variable
        # uppercase T, unlike every other filter here (overlay/drawtext/fade
        # all use lowercase t). Using t here was silently invalid inside geq
        # ("Undefined constant or missing '('") and made ffmpeg abort the
        # whole filtergraph — i.e. it hard-failed every export containing a
        # directional split-screen reveal. Keep this one on T.
        p_expr = f"min(max((T-{s_start})/{dur},0),1)"
        ease_expr = f"sin({p_expr}*1.5707963)"

        raw = f"mainhalf{i}raw"
        filters.append(
            f"[{main_idx}:v]scale={W}:{half_h}:force_original_aspect_ratio=increase,"
            f"crop={W}:{half_h},fps={fps},setsar=1,format=rgba[{raw}]"
        )

        nxt = f"mainhalf{i}"
        if anim in _directional_anims:
            # Wipe the properly-cropped half in from the edge that faces the
            # split boundary, growing toward the OUTER frame edge in sync
            # with the item's own reveal — never a moving box. base0 (always
            # full-frame, appended above) sits underneath this the whole
            # time, so wherever the wipe hasn't reached yet just still shows
            # the ordinary full-frame video instead of exposing empty space
            # — the gap a sliding/off-frame box briefly left behind before.
            feather = max(1, int(half_h * 0.08))
            if main_rest_y == 0:
                # Main rests in the TOP half — its outer edge is the frame's
                # top (Y=0); the reveal grows DOWNWARD from there.
                edge = f"{half_h}*{ease_expr}"
                a_expr = (
                    f"if(lt(Y,({edge})-{feather}),255,"
                    f"if(lt(Y,{edge}),255*(1-(Y-(({edge})-{feather}))/{feather}),0))"
                )
            else:
                # Main rests in the BOTTOM half — its outer edge is the
                # frame's bottom; the reveal grows UPWARD from there.
                edge = f"{half_h}*(1-{ease_expr})"
                a_expr = (
                    f"if(lt(Y,({edge})-{feather}),0,"
                    f"if(lt(Y,{edge}),255*(Y-(({edge})-{feather}))/{feather},255))"
                )
            filters.append(
                f"color=c=white:s={W}x{half_h},format=rgba[mwipe{i}src];"
                f"[mwipe{i}src]geq=r='255':g='255':b='255':a='{a_expr}'[mwipe{i}]"
            )
            filters.append(f"[{raw}][mwipe{i}]alphamerge[mainhalfwiped{i}]")
            label = f"mainhalfwiped{i}"
            y_expr = f"{main_rest_y}"

            if anim in _VERTICAL_DRIFT_ANIMS:
                # Hold-phase parallax: once settled (the wipe is fully open
                # by then), keep drifting the now-revealed half a little
                # further in the SAME direction the split item itself keeps
                # moving (slide_down/bounce_in -> down, slide_up -> up) —
                # synced via the same start/revealDuration/easing so main
                # video and b-roll move together instead of one freezing.
                sign = -1 if anim == "slide_up" else 1
                drift_frac = _drift_frac_expr(s_start, dur)
                y_expr = f"{main_rest_y}+({sign}*{_MAX_MAIN_DRIFT_PCT}/100*{half_h}*{drift_frac})"
        else:
            label = f"mainhalffade{i}"
            filters.append(f"[{raw}]fade=t=in:st={s_start}:d={dur}:alpha=1[{label}]")
            y_expr = f"{main_rest_y}"

        filters.append(
            f"[{current}][{label}]overlay=x=0:y='{y_expr}':"
            f"enable='between(t,{s_start},{s_end})'[{nxt}]"
        )
        current = nxt

    # Zoom moments (Milestone 3 auto-edit output, or manually added).
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

    # Broll & Overlay tracks.
    for i, item in enumerate(sorted(all_overlay_items, key=lambda it: it.zIndex)):
        asset = assets.get(item.assetId) if item.assetId else None
        source_path = asset.url if asset else item.sourceUrl
        if not source_path:
            continue
        is_video = (asset and asset.kind == "video") or (item.sourceUrl and item.sourceUrl.endswith((".mp4", ".webm")))
        extra = ["-t", str(item.duration)]
        if is_video:
            extra = ["-stream_loop", "-1", "-ss", str(item.sourceStart)] + extra
        else:
            extra = ["-loop", "1"] + extra
        idx = add_input(source_path, extra)

        label_scaled = f"broll{i}s"
        end = item.start + item.duration
        nxt = f"ov{i}"
        layout = getattr(item, "layout", "full") or "full"

        if item.type == "broll" or layout in ("full", "split_top", "split_bottom"):
            target_h = H if layout == "full" else (H // 2)
            rest_y = (H // 2) if layout == "split_bottom" else 0
            anim = getattr(item, "revealAnimation", "slide_down") or "slide_down"
            dur = max(getattr(item, "revealDuration", 0.5) or 0.5, 0.01)
            p_expr = f"min(max((t-{item.start})/{dur},0),1)"

            raw_label = f"broll{i}raw"

            if anim == "fade_in":
                filters.append(
                    f"[{idx}:v]scale={W}:{target_h}:force_original_aspect_ratio=increase,"
                    f"crop={W}:{target_h},fps={fps},format=rgba,"
                    f"colorchannelmixer=aa={item.opacity},"
                    f"fade=t=in:st={item.start}:d={dur}:alpha=1[{raw_label}]"
                )
            elif anim in ("zoom_in", "pop"):
                filters.append(
                    f"[{idx}:v]scale={W}:{target_h}:force_original_aspect_ratio=increase,"
                    f"crop={W}:{target_h},fps={fps},format=rgba,"
                    f"scale=w='max(16,int({W}*max(0.05,{p_expr})))':h='max(16,int({target_h}*max(0.05,{p_expr})))':eval=frame,"
                    f"pad={W}:{target_h}:'({W}-iw)/2':'({target_h}-ih)/2':color=black@0,"
                    f"colorchannelmixer=aa={item.opacity}[{raw_label}]"
                )
            elif anim == "wipe_down":
                filters.append(
                    f"[{idx}:v]scale={W}:{target_h}:force_original_aspect_ratio=increase,"
                    f"crop=w={W}:h='max(1,int({target_h}*{p_expr}))':x=0:y=0:exact=1,fps={fps},format=rgba,"
                    f"colorchannelmixer=aa={item.opacity}[{raw_label}]"
                )
            else:
                filters.append(
                    f"[{idx}:v]scale={W}:{target_h}:force_original_aspect_ratio=increase,"
                    f"crop={W}:{target_h},fps={fps},format=rgba,"
                    f"colorchannelmixer=aa={item.opacity}[{raw_label}]"
                )

            if layout in ("split_top", "split_bottom"):
                feather_px = max(1, int(target_h * 0.15))
                a_expr = (
                    f"if(lt(Y,{feather_px}),255*(Y/{feather_px}),255)"
                    if layout == "split_bottom"
                    else f"if(gt(Y,{target_h - feather_px}),255*(1-(Y-({target_h - feather_px}))/{feather_px}),255)"
                )
                filters.append(
                    f"color=c=white:s={W}x{target_h},format=rgba[fmask{i}src];"
                    f"[fmask{i}src]geq=r='255':g='255':b='255':a='{a_expr}'[fmask{i}]"
                )
                filters.append(f"[{raw_label}][fmask{i}]alphamerge[{label_scaled}]")
            else:
                label_scaled = raw_label

            # Once the reveal itself finishes, directional b-rolls keep
            # drifting slowly in the same direction they entered from
            # instead of freezing — mirrors driftMotion.js's driftFraction()
            # exactly (0 during the reveal, eases in a few seconds after).
            drift_frac = _drift_frac_expr(item.start, dur) if anim in _DIRECTIONAL_DRIFT_ANIMS else None
            drift_y_px = f"({_MAX_BROLL_DRIFT_PCT}/100*{target_h}*{drift_frac})" if drift_frac else None
            drift_x_px = f"({_MAX_BROLL_DRIFT_PCT}/100*{W}*{drift_frac})" if drift_frac else None

            x_expr = "0"
            if anim == "slide_down":
                ease_expr = f"sin({p_expr}*1.5707963)"
                y_expr = f"{rest_y}-({target_h}*(1-{ease_expr}))+{drift_y_px}"
            elif anim == "slide_up":
                ease_expr = f"sin({p_expr}*1.5707963)"
                y_expr = f"{rest_y}+({target_h}*(1-{ease_expr}))-{drift_y_px}"
            elif anim == "slide_left":
                ease_expr = f"sin({p_expr}*1.5707963)"
                y_expr = f"{rest_y}"
                x_expr = f"{W}*(1-{ease_expr})-{drift_x_px}"
            elif anim == "slide_right":
                ease_expr = f"sin({p_expr}*1.5707963)"
                y_expr = f"{rest_y}"
                x_expr = f"-{W}*(1-{ease_expr})+{drift_x_px}"
            elif anim == "bounce_in":
                bounce_p = f"if(lt({p_expr},0.7), ({p_expr}/0.7)*1.15, 1.15 - (({p_expr}-0.7)/0.3)*0.15)"
                y_expr = f"{rest_y}-({target_h}*(1-{bounce_p}))+{drift_y_px}"
            else:
                y_expr = f"{rest_y}"

            filters.append(
                f"[{current}][{label_scaled}]overlay=x='{x_expr}':y='{y_expr}':"
                f"enable='between(t,{item.start},{end})'[{nxt}]"
            )
        else:
            scale = item.transform.scale
            ow = int(W * (1.0 if item.type == "overlay" else 0.5) * scale)
            filters.append(
                f"[{idx}:v]scale={ow}:-1,fps={fps},format=rgba,"
                f"colorchannelmixer=aa={item.opacity}[{label_scaled}]"
            )
            rest_x = int(item.transform.x)
            rest_y = int(item.transform.y)
            x_expr = f"{rest_x}"
            y_expr = f"{rest_y}"
            anim = getattr(item, "revealAnimation", "slide_down") or "slide_down"
            dur = max(getattr(item, "revealDuration", 0.5) or 0.5, 0.01)

            if item.type == "broll" and anim != "none":
                p_expr = f"min(max((t-{item.start})/{dur},0),1)"
                ease_expr = f"sin({p_expr}*1.5707963)"
                if anim == "slide_left":
                    x_expr = f"{rest_x}+({W}*(1-{ease_expr}))"
                elif anim == "slide_right":
                    x_expr = f"{rest_x}-({W}*(1-{ease_expr}))"
                else:
                    y_expr = f"{rest_y}-({H}*(1-{ease_expr}))"

            blend_mode = getattr(item, "blendMode", None) or ("screen" if item.type == "overlay" else "normal")
            if blend_mode == "screen":
                filters.append(
                    f"[{current}][{label_scaled}]blend=all_mode=screen:"
                    f"enable='between(t,{item.start},{end})'[{nxt}]"
                )
            else:
                filters.append(
                    f"[{current}][{label_scaled}]overlay=x='{x_expr}':y='{y_expr}':"
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

    return input_args, filters, video_out, main_idx, W, H, fps, add_input, audio_track, sfx_track


_fontconfig_conf_path: str | None = None


def _fontconfig_env() -> dict:
    """drawtext's font='Family Name' option (used for every caption — see
    the caption loop below) resolves the family through fontconfig. Many
    ffmpeg builds compile fontconfig support in (including the Windows
    "full" gyan.dev build), but Windows itself ships no fontconfig install
    — no fonts.conf, no font cache — so the very first caption filter
    aborted the ENTIRE render with "Fontconfig error: Cannot load default
    config file: No such file: (null)" before a single frame was produced.
    This is distinct from (and was previously masked by) the geq/audio-map
    bugs, since ffmpeg only gets around to initializing drawtext once the
    rest of the graph parses cleanly.

    Fix: generate a minimal fonts.conf once, pointing fontconfig at the
    OS's real font directory, and pass it to the ffmpeg subprocess via
    FONTCONFIG_FILE so font='...' lookups resolve normally (falling back
    to a substitute font if the exact family isn't installed, rather than
    hard-failing)."""
    global _fontconfig_conf_path
    if _fontconfig_conf_path is None:
        conf_dir = os.path.join(tempfile.gettempdir(), "ai_editor_fontconfig")
        cache_dir = os.path.join(conf_dir, "cache")
        os.makedirs(cache_dir, exist_ok=True)

        system = platform.system()
        if system == "Windows":
            font_dirs = [os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")]
        elif system == "Darwin":
            font_dirs = ["/System/Library/Fonts", "/Library/Fonts", os.path.expanduser("~/Library/Fonts")]
        else:
            font_dirs = ["/usr/share/fonts", "/usr/local/share/fonts", os.path.expanduser("~/.fonts")]
        dirs_xml = "".join(f"<dir>{d}</dir>" for d in font_dirs if os.path.isdir(d))

        conf_path = os.path.join(conf_dir, "fonts.conf")
        with open(conf_path, "w", encoding="utf-8") as f:
            f.write(
                '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n'
                f"{dirs_xml}<cachedir>{cache_dir}</cachedir>\n</fontconfig>\n"
            )
        _fontconfig_conf_path = conf_path
    return {"FONTCONFIG_FILE": _fontconfig_conf_path}


def _run_ffmpeg(cmd_prefix: List[str], filter_complex: str, cmd_suffix: List[str], error_prefix: str) -> None:
    """Runs ffmpeg with the filter graph passed via -filter_complex_script
    (a temp file) instead of inline on the command line. A timeline with
    several split-screen/broll/caption items easily produces a filter graph
    tens of thousands of characters long; passed inline that pushed the
    full assembled command past Windows' CreateProcess command-line limit,
    which surfaced not as an ffmpeg error but as the opaque Python
    `[WinError 206] The filename or extension is too long` — failing the
    export before ffmpeg even ran. A script file has no such limit."""
    with tempfile.NamedTemporaryFile("w", suffix=".ffscript", delete=False, encoding="utf-8") as f:
        f.write(filter_complex)
        script_path = f.name
    try:
        cmd = [*cmd_prefix, "-filter_complex_script", script_path, *cmd_suffix]
        env = {**os.environ, **_fontconfig_env()}
        proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
        if proc.returncode != 0:
            raise RuntimeError(f"{error_prefix}:\n{' '.join(shlex.quote(c) for c in cmd)}\n\n{proc.stderr[-4000:]}")
    finally:
        try:
            os.remove(script_path)
        except OSError:
            pass


# The export panel's Quality option. Controls encoder CRF for mp4/webm
# (lower CRF = higher quality/bigger file) and, since a GIF has no
# bitrate/CRF concept, its pixel width + frame rate ceiling instead.
QUALITY_PRESETS = {
    "draft":    {"mp4_crf": 30, "webm_crf": 40, "gif_width": 480, "gif_fps_cap": 10},
    "standard": {"mp4_crf": 23, "webm_crf": 32, "gif_width": 640, "gif_fps_cap": 15},
    "high":     {"mp4_crf": 18, "webm_crf": 24, "gif_width": 854, "gif_fps_cap": 20},
}


def render_timeline(
    timeline: Timeline,
    assets: Dict[str, Asset],
    output_path: str,
    fmt: str = "mp4",
    quality: str = "standard",
    frame_rate: int | None = None,
) -> None:
    """`fmt` selects the export container/codec — "mp4" (H.264/AAC, the
    default, universally playable), "webm" (VP9/Opus, smaller file for web
    embedding), or "gif" (silent looping preview, no audio track at all).
    `quality` is one of QUALITY_PRESETS' keys. `frame_rate`, if given,
    overrides the project's own fps for JUST the final output — the
    internal filter graph still normalizes at the project's fps (`fps`,
    below) for consistent compositing/timing, exactly like the live
    preview; only the exported file's frame rate changes.

    All formats composite from the exact same filter graph via
    _build_video_filtergraph, so the picture is identical across formats —
    only the tail end (audio handling + output codec/frame-rate args)
    differs."""
    (input_args, filters, video_out, main_idx, W, H, fps,
     add_input, audio_track, sfx_track) = _build_video_filtergraph(timeline, assets)

    preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS["standard"])
    out_fps = frame_rate if frame_rate else fps

    if fmt == "gif":
        # Standard high-quality ffmpeg GIF recipe: build an optimized
        # palette from the composited video, then dither the same video
        # through it. Runs on top of the shared video_out label, so a GIF
        # export still matches the live preview frame-for-frame — no
        # separate/approximated pipeline. No audio: GIF has no audio track.
        # A GIF has no real use for a very high frame rate (file size
        # balloons for no visible benefit), so the requested rate is still
        # capped by the quality preset's gif_fps_cap.
        gif_fps = min(out_fps, preset["gif_fps_cap"])
        gif_w = preset["gif_width"]
        filters.append(f"[{video_out}]fps={gif_fps},scale={gif_w}:-1:flags=lanczos,split[gifs0][gifs1]")
        filters.append("[gifs0]palettegen=stats_mode=diff[gifpal]")
        filters.append("[gifs1][gifpal]paletteuse=dither=bayer[gifout]")
        filter_complex = ";".join(filters)

        cmd_prefix = ["ffmpeg", "-y", *input_args]
        cmd_suffix = ["-map", "[gifout]", output_path]
        _run_ffmpeg(cmd_prefix, filter_complex, cmd_suffix, "ffmpeg failed")
        return

    # Audio: main clip audio + audio track + sfx track, mixed.
    audio_labels = [f"{main_idx}:a"]
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
        audio_map = "[aout]"
    else:
        # Nothing to mix in — just the main clip's own audio, which was
        # never fed through -filter_complex. `-map` treats a bracketed
        # name as a lookup for a *named pad declared inside the filter
        # graph* (e.g. the "[aout]" created above), not a plain stream
        # specifier — wrapping a raw "{idx}:a" in brackets here made ffmpeg
        # fail every export with "Output with label '0:a' does not exist
        # in any defined filter graph", since no such pad was ever
        # declared. A bare input stream specifier must be mapped unbracketed.
        audio_map = audio_labels[0]

    filter_complex = ";".join(filters)

    if fmt == "webm":
        # -cpu-used 4 trades a little quality for a lot of speed — libvpx-vp9
        # defaults to cpu-used=0 (its slowest setting), which turns a normal
        # short-form clip into a multi-minute background job. -row-mt 1 lets
        # it use multiple threads per row too.
        codec_args = ["-c:v", "libvpx-vp9", "-crf", str(preset["webm_crf"]), "-b:v", "0", "-deadline", "good",
                      "-cpu-used", "4", "-row-mt", "1", "-c:a", "libopus"]
    else:  # "mp4" (default)
        codec_args = ["-c:v", "libx264", "-preset", "veryfast", "-crf", str(preset["mp4_crf"]), "-c:a", "aac"]

    cmd_prefix = ["ffmpeg", "-y", *input_args]
    cmd_suffix = ["-map", f"[{video_out}]", "-map", audio_map,
                  "-r", str(out_fps), *codec_args, "-shortest", output_path]
    _run_ffmpeg(cmd_prefix, filter_complex, cmd_suffix, "ffmpeg failed")


def capture_frame(timeline: Timeline, assets: Dict[str, Asset], at_time: float, output_path: str) -> None:
    """Grabs a single composited frame at `at_time` (seconds, project-
    timeline time) and writes it as a still image — used for the project
    cover picker. Reuses the exact same filter graph as render_timeline,
    so the captured frame always matches what an actual export would show
    at that moment — main video alone, or the main video plus whatever
    b-roll/split/overlay layer is active there — never a separate
    approximation that could drift from the real render.

    `-ss` here is an *output* seek (it comes after -filter_complex/-map,
    not attached to a specific -i), so it applies to the fully composited
    stream: ffmpeg decodes and filters normally from the timeline's start
    and only starts emitting frames once the composited output reaches
    `at_time`, then -frames:v 1 grabs the first one there.
    """
    input_args, filters, video_out, main_idx, W, H, fps, add_input, _, _ = _build_video_filtergraph(timeline, assets)
    filter_complex = ";".join(filters)
    at_time = max(0.0, at_time)

    cmd_prefix = ["ffmpeg", "-y", *input_args]
    cmd_suffix = ["-map", f"[{video_out}]", "-ss", str(at_time), "-frames:v", "1", output_path]
    _run_ffmpeg(cmd_prefix, filter_complex, cmd_suffix, "ffmpeg cover capture failed")