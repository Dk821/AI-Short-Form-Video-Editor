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

import functools
import json
import os
import platform
import shlex
import shutil
import subprocess
import tempfile
from typing import Dict, List, Optional

from .models import Timeline, TimelineItem, Asset
from .overlays import plan_for_item
from .templates.registry import resolve_overlay_path
from .sfx import resolve_sfx_path
from .font_manager import resolve_font, escape_fontfile_path


def _resolve_bundled_source(source_path: str | None) -> str | None:
    """A non-asset item's `sourceUrl` (a template-bundled overlay video, or
    a catalog sfx clip — see routers/templates.py's _apply_overlay_video
    and routers/sfx.py) is a browser-servable API URL like
    '/api/templates/overlays/x.mp4' or '/api/sfx/library/x.mp3', not a
    real filesystem path — ffmpeg needs the latter. Map it back to the
    bundled file it actually came from; anything that isn't one of our
    own bundled-asset routes (an already-real path, e.g. asset.url) is
    returned unchanged."""
    if not source_path:
        return source_path
    resolved = resolve_overlay_path(source_path) or resolve_sfx_path(source_path)
    return str(resolved) if resolved else source_path


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

# Speaker PiP bubble: a small corner copy of the main video, cropped square
# and masked circle/rounded. Sized as a fraction of frame width at
# transform.scale=1 so it reads consistently across 1080x1920 and other
# project dimensions, then scaled by the item's own transform.scale.
_SPEAKER_BASE_FRAC = 0.34

# CTA overlay icon names (set by the frontend's CtaPicker — see Task #15) ->
# a unicode glyph prefixed onto the pill text. ffmpeg's drawtext has no
# notion of an icon asset, so this is the pragmatic MVP rendering: no icon
# name (or an unrecognized one) just renders the plain text, no glyph.
_CTA_ICON_GLYPHS = {
    "arrow": "→",
    "heart": "♥",
    "cart": "\U0001F6D2",
    "link": "\U0001F517",
    "star": "★",
    "fire": "\U0001F525",
    "bell": "\U0001F514",
    "play": "▶",
}


def _drift_frac_expr(start: float, dur: float) -> str:
    """FFmpeg expression matching driftMotion.js's driftFraction(): 0 while
    the reveal is still playing, smoothstep-eases to 1 a few seconds after
    it settles (zero velocity at both ends, so there's no kink where the
    entrance ease hands off into the hold-phase drift)."""
    held = f"max(0,(t-{start}-{dur})/{_DRIFT_HOLD_SECONDS})"
    c = f"min(max({held},0),1)"
    return f"({c}*{c}*(3-2*{c}))"


def _escape_drawtext(text: str) -> str:
    """Escape caption text for drawtext's *filter-argument* syntax.

    Deliberately does NOT touch '%'. drawtext has a second, separate layer
    on top of this \u2014 text expansion, where '%' introduces a '%{...}'
    directive \u2014 and there is no working escape for a literal percent there:
    ffmpeg rejects '\\%', a bare '%', and '%%' alike with "Stray % near ...".
    On ffmpeg 6 that was only a warning, but on 8.x it became a hard
    filtering error, so a single caption containing a percent sign ("90%")
    killed the whole export at the exact frame that caption appeared.

    The fix is to disable that expansion layer entirely \u2014 every drawtext
    built here passes `expansion=none` \u2014 after which '%' (and '{'/'}') are
    literal and need no escaping at all. Caption text is always literal
    user/transcript text; nothing here ever wants an expansion directive.
    The escapes below are the argument-level ones, which still apply.
    """
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\u2019")
    )


@functools.lru_cache(maxsize=1)
def _configured_ffmpeg() -> str:
    """The ffmpeg to use, honouring an explicit FFMPEG_BINARY override.

    Set FFMPEG_BINARY in backend/.env (or the environment) to an absolute
    path to point the whole renderer at a different ffmpeg build without
    touching PATH — useful because a crash inside ffmpeg itself is a
    property of the BUILD, not of the filter graph, so swapping the binary
    is often the entire fix. Falls back to whatever `ffmpeg` PATH resolves.
    """
    override = (os.environ.get("FFMPEG_BINARY") or "").strip().strip('"')
    if override and os.path.isfile(override):
        return override
    return "ffmpeg"


@functools.lru_cache(maxsize=1)
def _ffprobe_exe() -> str:
    """ffprobe matching _configured_ffmpeg: an explicit FFPROBE_BINARY, else
    the ffprobe sitting next to an overridden ffmpeg, else PATH."""
    override = (os.environ.get("FFPROBE_BINARY") or "").strip().strip('"')
    if override and os.path.isfile(override):
        return override
    ffmpeg = _configured_ffmpeg()
    if os.path.isfile(ffmpeg):
        sibling = os.path.join(
            os.path.dirname(ffmpeg),
            "ffprobe.exe" if ffmpeg.lower().endswith(".exe") else "ffprobe",
        )
        if os.path.isfile(sibling):
            return sibling
    return "ffprobe"


# Filters this renderer cannot build a graph without. Worth checking on any
# candidate fallback binary, because "has ffmpeg" does not imply "has the
# filters we need": drawtext gained a hard libharfbuzz dependency in FFmpeg
# 7.0, so widely-used static builds (imageio-ffmpeg's bundled one among them)
# ship without it entirely and would turn a crash into a baffling
# "No such filter: 'drawtext'" instead of a working export.
_REQUIRED_FILTERS = ("drawtext", "geq", "alphamerge", "overlay")


@functools.lru_cache(maxsize=8)
def _has_required_filters(exe: str) -> bool:
    try:
        out = subprocess.run([exe, "-hide_banner", "-filters"], capture_output=True, text=True)
    except OSError:
        return False
    listing = out.stdout or ""
    return all(f" {name} " in listing for name in _REQUIRED_FILTERS)


@functools.lru_cache(maxsize=1)
def _fallback_ffmpeg() -> Optional[str]:
    """A second, independently-compiled ffmpeg to retry with when the
    primary one CRASHES (see _run_ffmpeg's ladder).

    `pip install imageio-ffmpeg` ships a self-contained ffmpeg binary built
    by a completely different toolchain than the system one. When the
    system ffmpeg segfaults on a graph that is otherwise valid — which is a
    build bug, not a graph bug — running the identical command through that
    second binary is very often all that is needed. Returns None when the
    package isn't installed or resolves to the same file we already tried.
    """
    try:
        import imageio_ffmpeg  # optional dependency, absent by default
        exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None
    if not exe or not os.path.isfile(exe):
        return None
    primary = shutil.which(_configured_ffmpeg()) or _configured_ffmpeg()
    try:
        if os.path.samefile(exe, primary):
            return None
    except OSError:
        if os.path.abspath(exe) == os.path.abspath(primary):
            return None
    if not _has_required_filters(exe):
        # Present but unusable — say so once rather than letting it fail the
        # retry later with an error that looks unrelated to the real problem.
        print(
            f"[render] ignoring fallback ffmpeg at {exe}: it is missing one of "
            f"{', '.join(_REQUIRED_FILTERS)} (drawtext needs a build made with "
            "libharfbuzz). Point FFMPEG_BINARY at a full build instead."
        )
        return None
    return exe


def _luma_mask(src_label: str, out_label: str, w: int, h: int, fps: int, expr: str) -> str:
    """Build a grayscale mask to feed alphamerge's second input.

    alphamerge takes the alpha it applies from its second input's GRAYSCALE
    VALUE — not from that input's alpha channel. Encoding the mask shape in
    `a` while pinning r/g/b to 255 (which this renderer used to do
    everywhere) produces a uniformly white mask, i.e. "fully opaque
    everywhere": the mask silently does nothing at all. That is why, in
    exports, speaker bubbles came out as hard squares instead of circles,
    split-screen edges had no feathering, and the main video's wipe-in
    never animated — while the browser preview, which uses real CSS
    masks, showed all three correctly.

    `expr` is a geq expression in 0..255 over X/Y (and T for time-varying
    masks). gray is both the correct plane to write and a quarter the work
    of evaluating four RGBA planes. r={fps} matters for animated masks:
    `color` defaults to 25fps, and a mask ticking slower than the layer it
    gates makes the animation visibly step.
    """
    return (
        f"color=c=white:s={w}x{h}:r={fps},format=gray[{src_label}];"
        f"[{src_label}]geq=lum='{expr}'[{out_label}]"
    )


def _css_to_ffmpeg_color(css_hex: str) -> str:
    """'#RRGGBB' or '#RRGGBBAA' -> ffmpeg's '0xRRGGBB' or '0xRRGGBB@a.aa'."""
    h = css_hex.lstrip("#")
    if len(h) == 8:
        rgb, alpha_hex = h[:6], h[6:8]
        alpha = round(int(alpha_hex, 16) / 255, 3)
        return f"0x{rgb}@{alpha}"
    return f"0x{h}"


# Per-character width classes for _estimate_text_width — there's no
# reliable font file to measure against (drawtext's font='Family Name'
# resolves through fontconfig against whatever's actually installed on the
# machine running ffmpeg, which this app doesn't control or bundle — see
# _fontconfig_env above), so exact glyph metrics aren't available. This is
# a deliberately simple average-width-per-character approximation, good
# enough to lay out the short (typically 3-10 word) caption-style bursts
# this app generates without visible drift, not a typesetting engine.
_NARROW_CHARS = set("iIl.,:;'!|jtfr ")
_WIDE_CHARS = set("mMWw@")


def _estimate_text_width(text: str, font_size: float) -> float:
    total = 0.0
    for ch in text:
        if ch in _WIDE_CHARS:
            total += font_size * 0.82
        elif ch in _NARROW_CHARS:
            total += font_size * 0.30
        else:
            total += font_size * 0.56
    return total


def _resolve_font_variant(family: str | None, weight: int | None, style: str | None) -> str | None:
    """DEPRECATED — no longer called by the rendering pipeline.

    Previously used to build fontconfig family-name strings like
    'Inter Bold Italic' for drawtext's font= option. Replaced by
    font_manager.resolve_font() + fontfile= to avoid the
    0xC0000005 ACCESS_VIOLATION crash caused by fontconfig on
    FFmpeg 8.x / Windows. Kept here only so external callers (e.g.
    old test scripts) don't break; do NOT add new callers.
    """
    if not family:
        return family
    suffix = ""
    if weight and weight >= 700:
        suffix += " Bold"
    if style == "italic":
        suffix += " Italic"
    return f"{family}{suffix}"


def _caption_y_expr(position: str, height: int) -> str:
    if position == "top":
        return f"{int(height * 0.08)}"
    if position == "center":
        return f"{int(height * 0.60)}-(text_h/2)"
    return f"h-{int(height * 0.14)}-text_h"  # bottom (default)


def _build_stress_caption_filters(item, W: int, H: int, current: str, item_idx: int) -> tuple[list[str], str]:
    """One drawtext filter PER WORD instead of the single whole-line
    drawtext the normal caption path uses — the only way to give specific
    words their own background/color/font/stroke, since a single drawtext
    call has exactly one fontcolor/box for its whole string. x offsets are
    pre-computed in Python with _estimate_text_width and baked in as
    literal numbers (not an ffmpeg expression) since there's no way to
    read one drawtext filter's rendered width from a later, separate
    filter in the same chain. Only called for a line that actually has
    stress words (see the caption loop below) — every other line keeps
    the cheaper, exact single-drawtext path untouched."""
    words = (item.text or "").split(" ")
    stress_set = set(item.stressWordIndices or [])
    end = item.start + item.duration
    y = _caption_y_expr(item.position or "bottom", H)

    base_font_size = item.fontSize or 64
    stress_font_size = item.stressFontSize or base_font_size
    space_w = _estimate_text_width(" ", base_font_size)

    # Pass 1: figure out each word's effective size, then the whole line's
    # estimated width so it can be centered as a block, matching the base
    # path's `x=(w-text_w)/2` (here computed ahead of time in Python
    # instead of read from ffmpeg's own text_w at render time).
    sizes = [stress_font_size if wi in stress_set else base_font_size for wi in range(len(words))]
    widths = [_estimate_text_width(w, sizes[wi]) for wi, w in enumerate(words)]
    total_width = sum(widths) + space_w * max(0, len(words) - 1)
    cursor_x = (W - total_width) / 2

    stress_stroke_on = (
        item.stressStrokeEnabled if item.stressStrokeEnabled is not None
        else bool(item.strokeWidth and item.strokeColor)
    )

    new_filters: list[str] = []
    for wi, word in enumerate(words):
        if not word:
            cursor_x += space_w
            continue
        is_stress = wi in stress_set
        text = _escape_drawtext(word)
        nxt = f"cap{item_idx}w{wi}"

        if is_stress:
            fontsize = stress_font_size
            fontcolor = item.stressColor or item.color
            # Resolve stress font: explicit stressFontFamily first, then
            # fall back to the base caption family. resolve_font handles
            # weight/style normalisation and falls back to Inter if the
            # family isn't in the local registry.
            font_path = resolve_font(
                item.stressFontFamily or item.fontFamily,
                item.stressFontWeight or getattr(item, "fontWeight", None),
                item.stressFontStyle or "normal",
            )
            bg = item.stressBackgroundColor  # None = deliberately no background
            padding = item.stressPadding if item.stressPadding is not None else 12
            if stress_stroke_on:
                stroke_color = item.stressStrokeColor or item.strokeColor or "#000000"
                stroke_width = item.stressStrokeWidth or item.strokeWidth or 1
            else:
                stroke_color = stroke_width = None
        else:
            fontsize = base_font_size
            fontcolor = item.color
            # Base caption font — always resolve to a local file so we
            # never rely on fontconfig (which crashes FFmpeg 8.x on Windows).
            font_path = resolve_font(
                item.fontFamily,
                getattr(item, "fontWeight", None),
                "normal",
            )
            bg = item.backgroundColor
            padding = 18
            if item.strokeWidth and item.strokeColor:
                stroke_color, stroke_width = item.strokeColor, item.strokeWidth
            else:
                stroke_color = stroke_width = None

        parts = [
            f"text='{text}'",
            # Literal text only — see _escape_drawtext for why this is
            # required rather than optional.
            "expansion=none",
            f"fontsize={fontsize}",
            f"fontcolor={fontcolor}",
            f"x={cursor_x:.1f}",
            f"y={y}",
        ]
        # fontfile= bypasses fontconfig entirely — this is the fix for the
        # 0xC0000005 ACCESS_VIOLATION crash on FFmpeg 8.1.1 / Windows.
        # escape_fontfile_path converts backslashes and escapes ':' for
        # FFmpeg's filter-argument parser.
        parts.append(f"fontfile='{escape_fontfile_path(font_path)}'")
        if bg:
            parts.append(f"box=1:boxcolor={_css_to_ffmpeg_color(bg)}:boxborderw={padding}")
        if stroke_width and stroke_color:
            parts.append(f"borderw={stroke_width}:bordercolor={stroke_color}")
        if (item.animation or "fade") != "none":
            fade_dur = min(0.18, item.duration / 2)
            parts.append(
                f"alpha='if(lt(t,{item.start}+{fade_dur}),(t-{item.start})/{fade_dur},"
                f"if(gt(t,{end}-{fade_dur}),({end}-t)/{fade_dur},1))'"
            )
        parts.append(f"enable='between(t,{item.start},{end})'")

        new_filters.append(f"[{current}]drawtext={':'.join(parts)}[{nxt}]")
        current = nxt
        cursor_x += widths[wi] + space_w

    return new_filters, current


def probe_duration(path: str) -> float:
    out = subprocess.run(
        [
            _ffprobe_exe(), "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", path,
        ],
        capture_output=True, text=True,
    )
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


_source_duration_cache: Dict[str, float] = {}


def _probed_source_duration(path: str, asset: Asset | None) -> float | None:
    """The REAL length of a broll/overlay source file — used by the
    overlay resolver as the fallback "available window" for any item
    that doesn't explicitly set sourceDuration (i.e. every pre-existing
    item), so old projects keep rendering exactly as they did before
    this system existed. Prefers the already-probed Asset.duration
    (set at upload/download time — see pexels.py); falls back to
    ffprobe'ing template-bundled sourceUrl files directly, cached by
    path since those are static files re-used across many renders."""
    if asset and asset.duration:
        return asset.duration
    if path in _source_duration_cache:
        return _source_duration_cache[path]
    dur = probe_duration(path)
    if dur > 0:
        _source_duration_cache[path] = dur
        return dur
    return None


def probe_dimensions(path: str) -> tuple[int, int]:
    out = subprocess.run(
        [
            _ffprobe_exe(), "-v", "error", "-select_streams", "v:0",
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
    cta_track = tracks_by_type.get("cta")

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
            filters.append(_luma_mask(f"mwipe{i}src", f"mwipe{i}", W, half_h, fps, a_expr))
            filters.append(f"[{raw}][mwipe{i}]alphamerge=shortest=1[mainhalfwiped{i}]")
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
        source_path = asset.url if asset else _resolve_bundled_source(item.sourceUrl)
        if not source_path:
            continue
        is_video = (asset and asset.kind == "video") or (item.sourceUrl and item.sourceUrl.endswith((".mp4", ".webm")))

        # Dynamic overlay duration: the item's `duration` is a TIMELINE
        # length, independent of this source file's own physical length
        # (see overlays/resolver.py). A bad item (duration<=0, negative
        # start/sourceStart, sourceStart>=sourceDuration) is skipped —
        # logged, not fatal — rather than aborting the whole export, since
        # this graph is built from possibly-old data that predates
        # validation being wired into save_timeline.
        hold_duration = 0.0

        # A speaker item that reuses the main video's own footage (the
        # normal case — see models.py) must NOT be opened as a second
        # `-i` on the same physical file: doing so builds fine but was
        # found, while building this feature, to deadlock this ffmpeg
        # build's scheduler as soon as an sfx/audio amix was also present
        # in the graph (two independent decoders on one file, one of them
        # gated behind an audio mix the other doesn't feed). Trimming the
        # ALREADY-DECODED main stream (`{main_idx}:v`) with a filter-level
        # trim instead sidesteps that entirely, and is cheaper too since
        # the file is only decoded once either way. This only covers
        # trim/hold, not an explicit forced loop (rare for a same-source
        # speaker bubble, since it never outlasts the main clip it mirrors)
        # — that one case still falls through to the normal add_input path.
        reuse_main_input = (
            item.type == "speaker" and asset is not None and asset.url == main_asset.url
        )

        if reuse_main_input:
            try:
                plan = plan_for_item(item, probed_source_duration=_probed_source_duration(source_path, asset))
            except ValueError as e:
                print(f"[render] skipping overlay/broll item '{item.id}': {e}")
                continue
            if plan.mode != "loop":
                hold_duration = plan.hold_duration
                trimmed = f"spktrim{i}"
                filters.append(
                    f"[{main_idx}:v]trim=start={plan.source_start}:duration={plan.consume},"
                    f"setpts=PTS-STARTPTS[{trimmed}]"
                )
                video_in = trimmed
            else:
                reuse_main_input = False  # forced-loop edge case — fall through below

        if not reuse_main_input:
            if is_video:
                try:
                    plan = plan_for_item(item, probed_source_duration=_probed_source_duration(source_path, asset))
                except ValueError as e:
                    print(f"[render] skipping overlay/broll item '{item.id}': {e}")
                    continue
                extra = ["-ss", str(plan.source_start), "-t", str(plan.consume)]
                if plan.mode == "loop":
                    extra = ["-stream_loop", "-1"] + extra
                hold_duration = plan.hold_duration
            else:
                extra = ["-loop", "1", "-t", str(item.duration)]
            idx = add_input(source_path, extra)
            video_in = f"{idx}:v"

        # "hold" mode: the source ran out before the timeline slot did and
        # looping is disabled — clone the last decoded frame for the
        # remainder so the layer still covers its full on-screen duration
        # without ever repeating. Every later reference to this input's
        # video stream in this loop iteration goes through `video_in`
        # instead of the raw `{idx}:v`, so this applies uniformly whether
        # the item ends up on the broll/split path or the float-on-top path.
        if hold_duration > 0:
            filters.append(f"[{video_in}]tpad=stop_mode=clone:stop_duration={hold_duration}[ovhold{i}]")
            video_in = f"ovhold{i}"

        # PRE-EXISTING BUG, fixed here as part of this "Timing" work: the
        # overlay/broll input stream starts decoding from its own PTS 0 at
        # the same moment the WHOLE render starts, in lockstep with the
        # main video — not at item.start. Without correcting for that, the
        # `enable='between(t,start,end)'` below correctly gates WHEN the
        # layer is visible, but the CONTENT shown is whatever the source
        # happens to be at (sourceStart + <seconds since the render
        # began>) instead of (sourceStart + <seconds since this item went
        # active>) — i.e. any item with start > 0 silently shows the wrong
        # slice of its source. Shifting this stream's presentation
        # timestamps forward by item.start re-aligns its local clock with
        # the main timeline's clock at the exact moment enable flips true,
        # so elapsed-since-item-start (not elapsed-since-render-start)
        # is what determines the visible source frame — required for
        # strict preview/export parity per item, not just for item 0.
        if item.start > 0:
            filters.append(f"[{video_in}]setpts=PTS+{item.start}/TB[ovshift{i}]")
            video_in = f"ovshift{i}"

        label_scaled = f"broll{i}s"
        end = item.start + item.duration
        nxt = f"ov{i}"
        layout = getattr(item, "layout", "full") or "full"

        if item.type == "speaker":
            # Picture-in-picture bubble: a small square (or rounded-square)
            # crop of the main video's own footage, masked circle/rounded
            # per item.shape and positioned by transform.x/y (raw pixel
            # coordinates — same convention the generic float-on-top branch
            # below uses for broll/overlay items). Never goes through the
            # full-frame/split layout branch — a speaker bubble is always
            # a small corner element regardless of item.layout.
            size = max(24, int(W * _SPEAKER_BASE_FRAC * (item.transform.scale or 1)))
            raw_label = f"spk{i}raw"
            filters.append(
                f"[{video_in}]scale={size}:{size}:force_original_aspect_ratio=increase,"
                f"crop={size}:{size},fps={fps},format=rgba,"
                f"colorchannelmixer=aa={item.opacity}[{raw_label}]"
            )

            shape = getattr(item, "shape", "circle") or "circle"
            if shape == "circle":
                r = size / 2
                a_expr = f"if(lte(pow(X-{r},2)+pow(Y-{r},2),pow({r},2)),255,0)"
            else:  # "rounded" — a rounded square via four corner-circle tests
                rad = max(4, int(size * 0.16))
                inner = size - rad
                a_expr = (
                    f"if(lt(X,{rad})*lt(Y,{rad}),if(lte(pow(X-{rad},2)+pow(Y-{rad},2),pow({rad},2)),255,0),"
                    f"if(gt(X,{inner})*lt(Y,{rad}),if(lte(pow(X-{inner},2)+pow(Y-{rad},2),pow({rad},2)),255,0),"
                    f"if(lt(X,{rad})*gt(Y,{inner}),if(lte(pow(X-{rad},2)+pow(Y-{inner},2),pow({rad},2)),255,0),"
                    f"if(gt(X,{inner})*gt(Y,{inner}),if(lte(pow(X-{inner},2)+pow(Y-{inner},2),pow({rad},2)),255,0),"
                    f"255))))"
                )
            filters.append(_luma_mask(f"spkmsrc{i}", f"spkmask{i}", size, size, fps, a_expr))
            filters.append(f"[{raw_label}][spkmask{i}]alphamerge=shortest=1[spk{i}]")

            rest_x = int(item.transform.x)
            rest_y = int(item.transform.y)
            filters.append(
                f"[{current}][spk{i}]overlay=x={rest_x}:y={rest_y}:"
                f"enable='between(t,{item.start},{end})'[{nxt}]"
            )
        elif item.type == "broll" or layout in ("full", "split_top", "split_bottom"):
            target_h = H if layout == "full" else (H // 2)
            rest_y = (H // 2) if layout == "split_bottom" else 0
            anim = getattr(item, "revealAnimation", "slide_down") or "slide_down"
            dur = max(getattr(item, "revealDuration", 0.5) or 0.5, 0.01)
            p_expr = f"min(max((t-{item.start})/{dur},0),1)"

            raw_label = f"broll{i}raw"

            # EVERY branch below must emit a layer of CONSTANT W x target_h.
            # ffmpeg reinitializes its filter chain whenever a frame's SIZE
            # changes mid-stream, and the downstream filters here (pad,
            # alphamerge, overlay) do not survive that: it produced either
            # "Error reinitializing filters!" or an outright SIGSEGV/SIGABRT
            # on every ffmpeg version tested (6.1 and 8.x alike). So a reveal
            # that "grows" or "wipes" the layer is done by padding back onto a
            # fixed-size canvas, or by animating ALPHA — never by letting the
            # frame dimensions themselves vary over time.
            base_chain = (
                f"[{video_in}]scale={W}:{target_h}:force_original_aspect_ratio=increase,"
                f"crop={W}:{target_h},fps={fps},format=rgba,"
                f"colorchannelmixer=aa={item.opacity}"
            )

            if anim == "fade_in":
                filters.append(f"{base_chain},fade=t=in:st={item.start}:d={dur}:alpha=1[{raw_label}]")
            elif anim in ("zoom_in", "pop"):
                # trunc(), not int(): ffmpeg's expression evaluator has no
                # int() function at all, so an int() here is rejected as
                # "Unknown function" and fails the whole graph at init.
                # The pad MUST carry eval=frame: its output size is fixed,
                # but its x/y centering expressions read the (shrinking)
                # input size, and a pad still evaluating an init-time size
                # against a resized frame segfaults ffmpeg outright.
                filters.append(
                    f"{base_chain},"
                    f"scale=w='max(16,trunc({W}*max(0.05,{p_expr})))':h='max(16,trunc({target_h}*max(0.05,{p_expr})))':eval=frame,"
                    f"pad={W}:{target_h}:'({W}-iw)/2':'({target_h}-ih)/2':color=black@0:eval=frame[{raw_label}]"
                )
            else:
                filters.append(f"{base_chain}[{raw_label}]")

            # Alpha masks — the constant-size way to express both the
            # wipe_down reveal and the split-screen feathered edge. geq's
            # time variable is uppercase T (t is the drawtext/overlay one),
            # and its per-pixel row is Y.
            p_expr_t = f"min(max((T-{item.start})/{dur},0),1)"
            mask_terms = []
            if anim == "wipe_down":
                # Reveal top-down: opaque above the advancing line, clear below.
                mask_terms.append(f"if(lt(Y,{target_h}*{p_expr_t}),255,0)")
            if layout in ("split_top", "split_bottom"):
                feather_px = max(1, int(target_h * 0.15))
                mask_terms.append(
                    f"if(lt(Y,{feather_px}),255*(Y/{feather_px}),255)"
                    if layout == "split_bottom"
                    else f"if(gt(Y,{target_h - feather_px}),255*(1-(Y-({target_h - feather_px}))/{feather_px}),255)"
                )

            if mask_terms:
                # Two masks compose multiplicatively (both are 0..255, so
                # divide once to stay in range) — a wipe_down b-roll in a
                # split layout needs the moving wipe AND the feathered edge,
                # not whichever one happened to be applied last.
                a_expr = mask_terms[0] if len(mask_terms) == 1 else f"({mask_terms[0]})*({mask_terms[1]})/255"
                if item.opacity is not None and item.opacity != 1:
                    # alphamerge REPLACES the layer's alpha, so the opacity
                    # applied in base_chain is discarded here — fold it into
                    # the mask instead of silently losing it.
                    a_expr = f"({a_expr})*{item.opacity}"
                filters.append(_luma_mask(f"fmask{i}src", f"fmask{i}", W, target_h, fps, a_expr))
                filters.append(f"[{raw_label}][fmask{i}]alphamerge=shortest=1[{label_scaled}]")
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
                f"[{video_in}]scale={ow}:-1,fps={fps},format=rgba,"
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
        if item.hidden:
            # "AI Subtitles & Captions" turned off, or this one line's
            # eye-toggle hidden — skip it entirely rather than drawing it,
            # while leaving the item itself untouched on the timeline so
            # re-enabling needs no re-generation. See models.py's `hidden`.
            continue

        if item.stressWordIndices:
            # "AI Stress Text Highlighter" — this line has detected words
            # that need their own color/background/font, which a single
            # drawtext call can't give a substring of its own text. See
            # _build_stress_caption_filters.
            stress_filters, current = _build_stress_caption_filters(item, W, H, current, i)
            filters.extend(stress_filters)
            continue

        text = _escape_drawtext(item.text or "")
        end = item.start + item.duration
        y = _caption_y_expr(item.position or "bottom", H)
        nxt = f"cap{i}"

        parts = [
            f"text='{text}'",
            # Literal text only — see _escape_drawtext for why this is
            # required rather than optional.
            "expansion=none",
            f"fontsize={item.fontSize}",
            f"fontcolor={item.color}",
            f"x=(w-text_w)/2",
            f"y={y}",
        ]
        # fontfile= bypasses fontconfig — fix for 0xC0000005 on FFmpeg 8.x.
        # Always resolve even when fontFamily is None: resolve_font() falls
        # back to Inter Regular in that case, so we always get a valid path.
        _cap_font_path = resolve_font(
            item.fontFamily,
            getattr(item, "fontWeight", None),
            getattr(item, "fontStyle", None) or "normal",
        )
        parts.append(f"fontfile='{escape_fontfile_path(_cap_font_path)}'")
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

    # CTA pill overlays. Rendered the same way as captions (drawtext with
    # its own box=1 background) since ffmpeg's drawtext has no native pill/
    # rounded-rect shape — box=1 with a generous boxborderw is the pragmatic
    # MVP approximation of a rounded button. item.ctaIcon (a name the
    # frontend's CtaPicker offers — see Task #15) maps to a unicode glyph
    # prefixed onto the text; an unrecognized/missing icon just renders
    # plain text.
    cta_items: List[TimelineItem] = cta_track.items if cta_track else []
    for i, item in enumerate(cta_items):
        glyph = _CTA_ICON_GLYPHS.get(item.ctaIcon or "", "")
        raw_text = f"{glyph}  {item.text or ''}".strip() if glyph else (item.text or "")
        text = _escape_drawtext(raw_text)
        end = item.start + item.duration
        y = _caption_y_expr(item.position or "bottom", H)
        nxt = f"cta{i}"

        parts = [
            f"text='{text}'",
            # Literal text only — see _escape_drawtext for why this is
            # required rather than optional.
            "expansion=none",
            f"fontsize={item.fontSize or 42}",
            f"fontcolor={item.color or '#FFFFFF'}",
            "x=(w-text_w)/2",
            f"y={y}",
            f"box=1:boxcolor={_css_to_ffmpeg_color(item.backgroundColor or '#7C3AED')}:boxborderw=24",
        ]
        # fontfile= bypasses fontconfig — fix for 0xC0000005 on FFmpeg 8.x.
        _cta_font_path = resolve_font(
            item.fontFamily,
            getattr(item, "fontWeight", None),
            getattr(item, "fontStyle", None) or "normal",
        )
        parts.append(f"fontfile='{escape_fontfile_path(_cta_font_path)}'")

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


@functools.lru_cache(maxsize=4)
def _filter_graph_file_option(exe: str = "ffmpeg") -> str:
    """Which option this ffmpeg build uses to read a filter graph from a file.

    ffmpeg 7.0 introduced the generic "read this option's value from a file"
    form, `-/filter_complex FILE`, and deprecated the old
    `-filter_complex_script FILE`. ffmpeg 8.x still accepts the old spelling
    but prints a deprecation notice; builds newer than that have REMOVED it
    outright ("Unrecognized option 'filter_complex_script'"), which fails the
    export before a single frame is decoded.

    Rather than parse a version string (builds label themselves
    inconsistently — "8.1.1-full_build", "N-126308-g...", distro forks), probe
    once with a throwaway one-frame render and cache the answer for the
    process. Prefers the modern spelling, falls back to the legacy one.

    Cached PER BINARY: the crash fallback may run a different (often older)
    ffmpeg build that only understands the legacy spelling, so the answer
    for one binary must never be reused for another.
    """
    with tempfile.NamedTemporaryFile("w", suffix=".ffscript", delete=False, encoding="utf-8") as f:
        f.write("[0:v]null[probeout]")
        probe_path = f.name
    try:
        for option in ("-/filter_complex", "-filter_complex_script"):
            try:
                proc = subprocess.run(
                    [exe, "-hide_banner", "-loglevel", "error", "-f", "lavfi",
                     "-i", "color=c=black:s=16x16:d=0.1", option, probe_path,
                     "-map", "[probeout]", "-frames:v", "1", "-f", "null", "-"],
                    capture_output=True, text=True,
                )
            except OSError:
                break  # ffmpeg missing entirely — let the real render report it
            if proc.returncode == 0:
                return option
    finally:
        try:
            os.remove(probe_path)
        except OSError:
            pass
    # Neither probe succeeded (unusual — e.g. lavfi unavailable). Use the
    # modern spelling: every ffmpeg that still supports the legacy one also
    # supports this, and only the legacy one is at risk of being removed.
    return "-/filter_complex"


# Windows NTSTATUS values ffmpeg can die with. A process killed this way is
# gone before the C runtime flushes stderr, so the log usually stops mid-way
# (often after nothing but the version banner) and the exit code is the only
# real evidence left — worth translating rather than showing as a bare number.
_WINDOWS_CRASH_CODES = {
    3221225477: "0xC0000005 ACCESS_VIOLATION — ffmpeg crashed (segfault equivalent)",
    3221225725: "0xC00000FD STACK_OVERFLOW — ffmpeg crashed on a too-deeply-nested expression",
    3221226505: "0xC0000409 STACK_BUFFER_OVERRUN — ffmpeg aborted on a corrupted stack",
    3221225620: "0xC0000094 INTEGER_DIVIDE_BY_ZERO — ffmpeg crashed",
}


# Retry arguments for a build whose threading is what's crashing. These are
# global options, so they go immediately after the executable name, before
# any input. -filter_threads disables filter slice-threading (geq, scale,
# overlay and drawtext all use it); -threads 1 does the same for the codecs.
# Slower, but a slow export beats a crashed one. The gyan.dev Windows builds
# are compiled --disable-w32threads, i.e. they use winpthreads rather than
# native Win32 threads, which is the configuration where filter threading
# crashes have historically shown up.
_SINGLE_THREAD_ARGS = ["-filter_threads", "1", "-threads", "1"]


def _exit_code_note(code: int, stderr: str) -> str:
    """One human-readable line explaining a non-zero ffmpeg exit, when the
    code itself carries more information than the (possibly truncated or
    entirely absent) stderr does."""
    if code in _WINDOWS_CRASH_CODES:
        note = f"\n[{_WINDOWS_CRASH_CODES[code]}]"
        if len(stderr.strip()) < 2500 or "Error" not in stderr:
            note += (
                "\nffmpeg died before it could report why, so the log above is"
                " incomplete. It was already retried with all threading"
                " disabled"
                + ("" if _fallback_ffmpeg() else
                   ", and no alternative ffmpeg build is installed to retry with"
                   " (`pip install imageio-ffmpeg` adds one)")
                + ". Run `python diagnose_export.py` from the backend folder to"
                " find which part of the render is responsible."
            )
        return note
    if code < 0:
        return f"\n[killed by signal {-code}]"
    return ""


def _run_ffmpeg(cmd_prefix: List[str], filter_complex: str, cmd_suffix: List[str], error_prefix: str) -> None:
    """Runs ffmpeg with the filter graph passed in a temp file instead of
    inline on the command line. A timeline with several split-screen/broll/
    caption items easily produces a filter graph tens of thousands of
    characters long; passed inline that pushed the full assembled command
    past Windows' CreateProcess command-line limit, which surfaced not as an
    ffmpeg error but as the opaque Python `[WinError 206] The filename or
    extension is too long` — failing the export before ffmpeg even ran. A
    graph file has no such limit. See _filter_graph_file_option for which
    spelling of that option this ffmpeg build wants."""
    with tempfile.NamedTemporaryFile("w", suffix=".ffscript", delete=False, encoding="utf-8") as f:
        f.write(filter_complex)
        script_path = f.name
    try:
        env = {**os.environ, **_fontconfig_env()}
        primary = _configured_ffmpeg()

        # Attempt 1 is the normal, fully-threaded command. If ffmpeg *crashes*
        # (as opposed to reporting an error), the later attempts re-run the
        # identical graph in ways that route around the two things a crash in
        # otherwise-valid ffmpeg is usually caused by: that build's threading,
        # then that build entirely. A crash is a property of the binary, not
        # of the graph, so a second independently-compiled ffmpeg often just
        # works. Each attempt only runs if the previous one CRASHED.
        attempts = [
            (primary, [], "default"),
            (primary, _SINGLE_THREAD_ARGS, "single-threaded"),
        ]
        fallback = _fallback_ffmpeg()
        if fallback:
            attempts.append((fallback, [], "with the bundled imageio-ffmpeg build"))

        last = None
        for exe, extra, label in attempts:
            cmd = [exe, *extra, *cmd_prefix[1:],
                   _filter_graph_file_option(exe), script_path, *cmd_suffix]
            proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
            if proc.returncode == 0:
                if label != "default":
                    print(
                        f"[render] ffmpeg crashed on the default settings but succeeded "
                        f"{label}. That points at the ffmpeg build rather than this "
                        f"project's filter graph; the fallback will keep being used."
                    )
                return
            last = (cmd, proc)
            if proc.returncode not in _WINDOWS_CRASH_CODES and proc.returncode >= 0:
                break  # a real, reported error — retrying changes nothing

        cmd, proc = last
        # Include the exit code and BOTH ends of stderr. ffmpeg puts its
        # version banner (~2KB of ./configure flags) at the top and the
        # actual error at the bottom, so a naive tail-only slice can be
        # entirely banner and report nothing useful about the failure —
        # which is exactly what made a real export failure undiagnosable.
        stderr = proc.stderr or ""
        if len(stderr) > 6000:
            stderr = f"{stderr[:1500]}\n...[{len(stderr) - 5500} chars omitted]...\n{stderr[-4000:]}"
        note = _exit_code_note(proc.returncode, stderr)
        raise RuntimeError(
            f"{error_prefix} (ffmpeg exited with code {proc.returncode}):\n"
            f"{' '.join(shlex.quote(c) for c in cmd)}\n{note}\n{stderr}"
        )
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

    # Audio: main clip audio + audio track + sfx track, mixed. An sfx item
    # may come from the bundled placeholder SFX library (Task #12) rather
    # than an uploaded project asset — those ship as template-style
    # `sourceUrl` files, same fallback pattern as broll/overlay's sourceUrl
    # support above, so a bundled sfx renders without ever needing an entry
    # in project.assets.
    audio_labels = [f"{main_idx}:a"]
    for item in (audio_track.items if audio_track else []) + (sfx_track.items if sfx_track else []):
        asset = assets.get(item.assetId) if item.assetId else None
        source_path = asset.url if asset else _resolve_bundled_source(item.sourceUrl)
        if not source_path:
            continue
        idx = add_input(source_path, ["-ss", str(item.sourceStart), "-t", str(item.duration)])
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