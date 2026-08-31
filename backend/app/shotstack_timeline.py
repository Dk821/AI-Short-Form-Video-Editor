"""
Timeline -> Shotstack Edit API JSON.

Converts this app's own Timeline model (models.py) into the JSON the
Shotstack Edit API expects, WITHOUT changing the timeline model itself:
this is a one-way projection used only when the Shotstack export engine is
selected. render.py remains the source of truth for FFmpeg exports and is
untouched.

Two things about Shotstack drive the shape of everything below.

1. Track order is INVERTED relative to this app. Shotstack composites the
   FIRST track in the array on TOP ("the first track in the array appears
   above the tracks that follow it, while the last forms the bottom
   layer"), whereas this app — like ffmpeg's overlay chain — treats later /
   higher-zIndex items as being on top. Every track list built here is
   therefore emitted top-first, which is the reverse of the ffmpeg
   compositing order in render.py. Getting this backwards silently buries
   the captions under the video, so it is asserted in the tests.

2. Shotstack renders in the cloud and can only fetch assets over public
   HTTPS. Local files are uploaded via the Ingest API first (see
   shotstack.py) and the resulting hosted URLs are passed in here as
   `asset_urls`; this module never touches the network itself, which is
   what makes it fully testable offline.

Captions are emitted as `html` assets rather than `title` assets on
purpose: the browser preview (VideoPreview.jsx) is itself HTML/CSS, so an
HTML asset reproduces per-word styling — including the AI Stress Text
Highlighter's per-word colours, background, stroke and font — far more
faithfully than a plain title asset or ffmpeg's drawtext could.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from .models import Timeline, TimelineItem

# Font URLs are NOT hardcoded here. Shotstack fetches every entry in
# timeline.fonts itself and fails the entire render if even one URL 404s
# ("One or more assets could not be found"), and Google's hosted font paths
# are version-hashed, so any URL baked into source goes stale. The caller
# resolves them at render time via shotstack.resolve_font_urls and passes
# them in; anything unresolved is simply omitted, which costs the exact
# typeface but never the export.
_DEFAULT_FONT = "Inter"


class ConversionResult:
    """The Shotstack edit plus everything the caller should tell the user.

    `warnings` matters as much as `edit`: several constructs this editor
    supports have no exact Shotstack equivalent, and it is far better to
    say so up front than to hand back a video that silently differs from
    the preview.
    """

    def __init__(self, edit: dict, warnings: List[str], asset_paths: List[str]):
        self.edit = edit
        self.warnings = warnings
        self.asset_paths = asset_paths


def _esc(text: str) -> str:
    return (
        (text or "")
        .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _visible(items: List[TimelineItem]) -> List[TimelineItem]:
    """Drop items the editor is hiding, and anything with no real duration.

    `hidden` is how the AI Subtitles toggle switches captions off without
    deleting them, so honouring it here is what keeps a Shotstack export
    matching what the preview actually shows."""
    return [it for it in items if not getattr(it, "hidden", False) and (it.duration or 0) > 0]


def _track_items(timeline: Timeline, track_type: str) -> List[TimelineItem]:
    for t in timeline.tracks:
        if t.type == track_type:
            return _visible(t.items)
    return []


def _caption_html(item: TimelineItem, width: int, height: int) -> Tuple[str, str]:
    """Build the HTML+CSS for one caption line, mirroring VideoPreview.jsx.

    Word-level spans are used so the stress highlighter's per-word styling
    survives into the export — the same reason render.py emits one drawtext
    per word.
    """
    words = (item.text or "").split(" ")
    stress = set(item.stressWordIndices or [])
    base_family = item.fontFamily or _DEFAULT_FONT
    stress_family = item.stressFontFamily or base_family

    spans = []
    for idx, word in enumerate(words):
        if not word:
            continue
        if idx in stress:
            bg = item.stressBackgroundColor
            style = [
                f"color:{item.stressColor or '#0F172A'}",
                f"font-family:'{stress_family}',sans-serif",
                f"font-weight:{item.stressFontWeight or 900}",
                f"font-style:{item.stressFontStyle or 'normal'}",
                f"font-size:{item.stressFontSize or item.fontSize or 64}px",
                f"padding:{(item.stressPadding or 12) // 2}px {item.stressPadding or 12}px",
                f"border-radius:{item.stressCornerRadius if item.stressCornerRadius is not None else 10}px",
            ]
            if bg:
                style.append(f"background-color:{bg}")
            if item.stressStrokeEnabled:
                w = item.stressStrokeWidth or 2
                style.append(f"-webkit-text-stroke:{w}px {item.stressStrokeColor or '#000000'}")
                style.append("paint-order:stroke fill")
        else:
            style = [
                f"color:{item.color or '#FFFFFF'}",
                f"font-family:'{base_family}',sans-serif",
                f"font-weight:{item.fontWeight or 600}",
                f"font-size:{item.fontSize or 64}px",
            ]
            if item.strokeWidth and item.strokeColor:
                style.append(f"-webkit-text-stroke:{item.strokeWidth}px {item.strokeColor}")
                style.append("paint-order:stroke fill")
        spans.append(f"<span style=\"{';'.join(style)}\">{_esc(word)}</span>")

    text_transform = "uppercase" if (item.case or "none") == "upper" else "none"
    align = item.textAlign or "center"
    # Same vertical anchors render.py's _caption_y_expr uses, so a Shotstack
    # export lands captions where the preview and the FFmpeg export do.
    position = item.position or "bottom"
    if position == "top":
        v = f"top:{int(height * 0.08)}px;"
    elif position == "center":
        v = "top:50%;transform:translateY(-50%);"
    else:
        v = f"bottom:{int(height * 0.14)}px;"

    box_bg = f"background-color:{item.backgroundColor};padding:12px 24px;border-radius:12px;" if item.backgroundColor else ""
    html = (
        f'<div class="wrap"><div class="line">{"".join(spans)}</div></div>'
    )
    css = (
        f".wrap{{position:absolute;left:0;right:0;{v}display:flex;justify-content:center;"
        f"padding:0 {int(width * 0.06)}px;box-sizing:border-box;}}"
        f".line{{display:flex;flex-wrap:wrap;gap:{max(6, (item.fontSize or 64) // 6)}px;"
        f"align-items:center;justify-content:{'flex-start' if align == 'left' else 'flex-end' if align == 'right' else 'center'};"
        f"text-align:{align};text-transform:{text_transform};line-height:1.15;{box_bg}}}"
    )
    return html, css


def _cta_html(item: TimelineItem, width: int, height: int) -> Tuple[str, str]:
    position = item.position or "top"
    if position == "top":
        v = f"top:{int(height * 0.08)}px;"
    elif position == "center":
        v = "top:50%;transform:translateY(-50%);"
    else:
        v = f"bottom:{int(height * 0.14)}px;"
    html = f'<div class="wrap"><div class="cta">{_esc(item.text or "")}</div></div>'
    css = (
        f".wrap{{position:absolute;left:0;right:0;{v}display:flex;justify-content:center;}}"
        f".cta{{background-color:{item.backgroundColor or '#7C3AED'};color:{item.color or '#FFFFFF'};"
        f"font-family:'{item.fontFamily or _DEFAULT_FONT}',sans-serif;font-size:{item.fontSize or 42}px;"
        f"font-weight:700;padding:18px 34px;border-radius:16px;}}"
    )
    return html, css


# Our reveal animations -> Shotstack clip transitions. Shotstack's set is a
# fixed vocabulary, so the directional slides map cleanly and the rest fall
# back to the nearest equivalent.
_TRANSITION_IN = {
    "fade_in": "fade",
    "slide_down": "slideDown",
    "slide_up": "slideUp",
    "slide_left": "slideLeft",
    "slide_right": "slideRight",
    "zoom_in": "zoom",
    "pop": "zoom",
    "bounce_in": "zoom",
    "wipe_down": "wipeUp",
    "none": None,
}


def _broll_clip(item: TimelineItem, src: str, is_image: bool, warnings: List[str]) -> dict:
    layout = item.layout or "full"
    asset: Dict[str, Any] = {"type": "image" if is_image else "video", "src": src}
    if not is_image:
        asset["volume"] = 0
        if (item.sourceStart or 0) > 0:
            asset["trim"] = round(item.sourceStart, 3)

    clip: Dict[str, Any] = {
        "asset": asset,
        "start": round(item.start, 3),
        "length": round(item.duration, 3),
        "fit": "cover",
        "opacity": item.opacity if item.opacity is not None else 1,
    }

    if layout in ("split_top", "split_bottom"):
        # Shotstack scales uniformly, so a full-width/half-height panel is
        # approximated by a half-scale clip anchored to the correct half.
        # This is the one place the Shotstack export cannot match the FFmpeg
        # renderer exactly, so it is reported rather than left to surprise.
        clip["scale"] = 0.5
        clip["position"] = "top" if layout == "split_top" else "bottom"
        warnings.append(
            f"B-roll '{item.id}' uses the {layout} split layout. Shotstack scales clips "
            "uniformly, so it is placed as a half-size panel anchored to that half rather "
            "than the full-width half-height panel the preview shows."
        )

    anim = item.revealAnimation or "none"
    transition = _TRANSITION_IN.get(anim)
    if transition:
        clip["transition"] = {"in": transition}
    if anim in ("pop", "bounce_in", "wipe_down"):
        warnings.append(
            f"B-roll '{item.id}' uses the '{anim}' reveal, which has no exact Shotstack "
            f"equivalent; the closest transition ('{transition}') is used instead."
        )
    return clip


def validate(timeline: Timeline, assets: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    """Check the timeline is renderable BEFORE anything is uploaded or sent.

    Returns (errors, warnings). Errors block the export; catching them here
    keeps a doomed job from spending an ingest upload and a Shotstack render
    credit only to fail with a schema message about a field the user never
    typed.
    """
    errors: List[str] = []
    warnings: List[str] = []

    project = timeline.project
    if not project.width or not project.height:
        errors.append("Project has no output size (width/height).")
    if project.width and project.height and (project.width % 2 or project.height % 2):
        errors.append(
            f"Output size {project.width}x{project.height} has an odd dimension; "
            "H.264 requires even width and height."
        )
    if not project.fps or project.fps <= 0:
        errors.append("Project has no frame rate.")
    elif project.fps not in (12, 15, 24, 25, 30, 48, 50, 60):
        warnings.append(
            f"{project.fps}fps is not one of Shotstack's supported frame rates; "
            "it will be rounded to the nearest supported value."
        )

    video_items = _track_items(timeline, "video")
    if not video_items:
        errors.append("Timeline has no video clip to export.")

    total = 0.0
    for track in timeline.tracks:
        for item in _visible(track.items):
            if item.start is None or item.start < 0:
                errors.append(f"Item '{item.id}' has a negative start time.")
            if (item.duration or 0) <= 0:
                continue
            total = max(total, (item.start or 0) + item.duration)
            needs_asset = item.type in ("video", "image", "broll", "audio", "sfx", "speaker")
            if needs_asset and item.assetId and item.assetId not in assets:
                errors.append(
                    f"{item.type} item '{item.id}' points at asset '{item.assetId}', "
                    "which is not in this project's asset list."
                )
            if item.type == "caption" and not (item.text or "").strip():
                warnings.append(f"Caption '{item.id}' has no text and will be skipped.")

    if total <= 0:
        errors.append("Timeline is empty — nothing to render.")
    if total > 3600:
        errors.append(f"Timeline is {total:.0f}s long, beyond Shotstack's per-render limit.")

    # Constructs Shotstack can't reproduce exactly. These are surfaced by the
    # /export/preflight endpoint so the export panel can show them BEFORE a
    # render is spent, not only in the finished job record.
    for item in _track_items(timeline, "broll"):
        layout = item.layout or "full"
        if layout in ("split_top", "split_bottom"):
            warnings.append(
                f"B-roll '{item.id}' uses the {layout} split layout. Shotstack scales clips "
                "uniformly, so it is placed as a half-size panel anchored to that half rather "
                "than the full-width half-height panel the preview shows."
            )
        if (item.revealAnimation or "none") in ("pop", "bounce_in", "wipe_down"):
            warnings.append(
                f"B-roll '{item.id}' uses the '{item.revealAnimation}' reveal, which has no exact "
                "Shotstack equivalent; the closest available transition is used instead."
            )

    for item in _track_items(timeline, "overlay"):
        if item.type == "speaker":
            warnings.append(
                f"Speaker bubble '{item.id}' is skipped: Shotstack has no circular "
                "picture-in-picture mask. Use the FFmpeg engine to keep it."
            )
    for item in _track_items(timeline, "zoom"):
        if item.transform and (item.transform.scale or 1) > 1:
            warnings.append(
                f"Zoom '{item.id}' is applied as a fixed {item.transform.scale:.2f}x scale for its "
                "duration; Shotstack cannot reproduce the FFmpeg renderer's animated punch-in."
            )
            break

    return errors, warnings


def build_edit(
    timeline: Timeline,
    assets: Dict[str, Any],
    asset_urls: Dict[str, str],
    callback: Optional[str] = None,
    font_urls: Optional[Dict[str, str]] = None,
) -> ConversionResult:
    """Project the timeline onto a Shotstack edit.

    `asset_urls` maps assetId -> a public URL Shotstack can fetch (produced
    by shotstack.upload_asset). Keeping the network out of this function is
    what lets the whole conversion be tested offline.
    """
    warnings: List[str] = []
    project = timeline.project
    W, H = project.width, project.height

    def url_for(item: TimelineItem) -> Optional[str]:
        if item.assetId and item.assetId in asset_urls:
            return asset_urls[item.assetId]
        return None

    def kind_of(item: TimelineItem) -> str:
        asset = assets.get(item.assetId) if item.assetId else None
        kind = getattr(asset, "kind", None) if asset is not None else None
        if kind is None and isinstance(asset, dict):
            kind = asset.get("kind")
        return kind or "video"

    used_paths: List[str] = []
    used_families = {_DEFAULT_FONT}

    # ---- main video (bottom-most visual layer) ----
    video_clips = []
    for item in _track_items(timeline, "video"):
        src = url_for(item)
        if not src:
            continue
        asset: Dict[str, Any] = {"type": "video", "src": src, "volume": item.volume if item.volume is not None else 1}
        if (item.sourceStart or 0) > 0:
            asset["trim"] = round(item.sourceStart, 3)
        video_clips.append({
            "asset": asset,
            "start": round(item.start, 3),
            "length": round(item.duration, 3),
            "fit": "cover",
        })

    # ---- zoom: a scaled copy of the main video over the base ----
    zoom_clips = []
    main = (_track_items(timeline, "video") or [None])[0]
    if main is not None:
        main_src = url_for(main)
        for item in _track_items(timeline, "zoom"):
            scale = (item.transform.scale if item.transform else None) or 1.25
            if not main_src or scale <= 1:
                continue
            zoom_clips.append({
                "asset": {
                    "type": "video",
                    "src": main_src,
                    "volume": 0,
                    "trim": round((main.sourceStart or 0) + max(0.0, item.start - main.start), 3),
                },
                "start": round(item.start, 3),
                "length": round(item.duration, 3),
                "fit": "cover",
                "scale": round(scale, 3),
            })

    # ---- b-roll and generic overlays ----
    broll_clips = []
    for item in _track_items(timeline, "broll") + [
        it for it in _track_items(timeline, "overlay") if it.type != "speaker"
    ]:
        src = url_for(item)
        if not src:
            # A keyword-only b-roll suggestion with no footage attached is
            # exactly the "blank layer" case — skip it rather than emitting a
            # clip Shotstack would reject for a missing src.
            if item.type == "broll":
                warnings.append(
                    f"B-roll '{item.id}'"
                    + (f" (keyword '{item.keyword}')" if item.keyword else "")
                    + " has no footage attached and was skipped."
                )
            continue
        broll_clips.append(_broll_clip(item, src, kind_of(item) == "image", warnings))

    # ---- captions and CTA as HTML assets ----
    caption_clips = []
    for item in _track_items(timeline, "caption"):
        if not (item.text or "").strip():
            continue
        html, css = _caption_html(item, W, H)
        used_families.add(item.fontFamily or _DEFAULT_FONT)
        if item.stressWordIndices:
            used_families.add(item.stressFontFamily or item.fontFamily or _DEFAULT_FONT)
        clip: Dict[str, Any] = {
            "asset": {"type": "html", "html": html, "css": css, "width": W, "height": H, "background": "transparent"},
            "start": round(item.start, 3),
            "length": round(item.duration, 3),
            "position": "center",
        }
        if (item.animation or "fade") != "none":
            clip["transition"] = {"in": "fade", "out": "fade"}
        caption_clips.append(clip)

    cta_clips = []
    for item in _track_items(timeline, "cta"):
        if not (item.text or "").strip():
            continue
        html, css = _cta_html(item, W, H)
        used_families.add(item.fontFamily or _DEFAULT_FONT)
        cta_clips.append({
            "asset": {"type": "html", "html": html, "css": css, "width": W, "height": H, "background": "transparent"},
            "start": round(item.start, 3),
            "length": round(item.duration, 3),
            "position": "center",
            "transition": {"in": "fade", "out": "fade"},
        })

    # ---- audio ----
    audio_clips = []
    for item in _track_items(timeline, "audio") + _track_items(timeline, "sfx"):
        src = url_for(item)
        if not src:
            continue
        asset: Dict[str, Any] = {"type": "audio", "src": src, "volume": item.volume if item.volume is not None else 1}
        if (item.sourceStart or 0) > 0:
            asset["trim"] = round(item.sourceStart, 3)
        audio_clips.append({
            "asset": asset,
            "start": round(item.start, 3),
            "length": round(item.duration, 3),
        })

    # Shotstack composites the FIRST track on TOP, so this list is the exact
    # reverse of render.py's ffmpeg overlay order (base -> zoom -> broll ->
    # captions -> cta). Audio carries no z-order, so it goes last.
    ordered = [
        ("cta", cta_clips),
        ("caption", caption_clips),
        ("broll", broll_clips),
        ("zoom", zoom_clips),
        ("video", video_clips),
        ("audio", audio_clips),
    ]
    tracks = [{"clips": clips} for _name, clips in ordered if clips]

    font_urls = font_urls or {}
    fonts = [{"src": font_urls[f]} for f in sorted(used_families) if font_urls.get(f)]
    missing_fonts = sorted(f for f in used_families if not font_urls.get(f))
    if missing_fonts:
        warnings.append(
            "Could not resolve a hosted font file for: " + ", ".join(missing_fonts)
            + ". Shotstack will substitute a default sans-serif for those captions; "
            "everything else about them is unchanged."
        )

    timeline_json: Dict[str, Any] = {"background": "#000000", "tracks": tracks}
    if fonts:
        timeline_json["fonts"] = fonts

    edit: Dict[str, Any] = {
        "timeline": timeline_json,
        "output": {
            "format": "mp4",
            # Explicit size preserves the editor's exact pixel dimensions and
            # therefore its aspect ratio, instead of snapping to a preset.
            "size": {"width": W, "height": H},
            "fps": _nearest_fps(project.fps or 30),
        },
    }
    if callback:
        edit["callback"] = callback

    return ConversionResult(edit, warnings, used_paths)


def _nearest_fps(fps: float) -> int:
    supported = [12, 15, 24, 25, 30, 48, 50, 60]
    return min(supported, key=lambda s: abs(s - fps))


def collect_asset_ids(timeline: Timeline) -> List[str]:
    """Every assetId the Shotstack edit will actually reference — i.e. only
    what needs uploading. Hidden items and keyword-only b-roll are excluded
    so nothing is uploaded for a layer that will not be rendered."""
    ids: List[str] = []
    for track in timeline.tracks:
        if track.type == "zoom":
            continue
        for item in _visible(track.items):
            if item.type == "speaker":
                continue
            if item.assetId and item.assetId not in ids:
                ids.append(item.assetId)
    return ids


def collect_font_families(timeline: Timeline) -> List[str]:
    """Font families the generated HTML will reference, so the caller knows
    exactly which ones to resolve before building the edit."""
    families = {_DEFAULT_FONT}
    for item in _track_items(timeline, "caption"):
        if not (item.text or "").strip():
            continue
        families.add(item.fontFamily or _DEFAULT_FONT)
        if item.stressWordIndices:
            families.add(item.stressFontFamily or item.fontFamily or _DEFAULT_FONT)
    for item in _track_items(timeline, "cta"):
        if (item.text or "").strip():
            families.add(item.fontFamily or _DEFAULT_FONT)
    return sorted(families)
