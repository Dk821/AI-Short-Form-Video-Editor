"""
Canonical caption typography & layout engine — the single source of truth
for font resolution, per-word measurement, multi-line word-wrap and
baseline placement, shared by:

  * backend/app/render.py              (FFmpeg drawtext export)
  * frontend/src/lib/captionLayout.js  (live VideoPreview canvas)

This exists because, before it, the two renderers each guessed at caption
layout independently: VideoPreview.jsx let the browser reflow text inside
a CSS box sized by an ad hoc px-per-canvas-pixel constant, while render.py
either drew one un-wrapped line (plain captions) or hand-estimated word
widths with a per-character-class heuristic (_estimate_text_width, now
removed) that had no concept of line breaks at all. Neither could ever
agree with the other. This module is the fix: ONE font resolution ladder,
ONE real-font-metric measurement function, and ONE greedy wrap + baseline
algorithm, run twice (once in Python, once in JS) but from the exact same
inputs and producing the exact same geometry.

DESIGN CANVAS
-------------
All coordinates/sizes here are canvas-space pixels — the same pixel space
as `timeline.project.width`/`height` (e.g. 1080x1920), which is exactly
the canvas FFmpeg renders onto and the space item.fontSize/stressFontSize/
etc. are already expressed in (unchanged — these fields are not touched).
VideoPreview.jsx renders an invisible div of exactly this size and scales
the WHOLE thing down with a single CSS `transform: scale()` to fit the
visible viewport, so a canvas-space pixel computed here is used completely
unmodified on the JS side too — no per-value unit conversion anywhere.

Every geometric constant below has an EXACT mirror in
frontend/src/lib/captionLayout.js. If a number changes here, change it
there too, or Preview and Export will drift apart again — that drift is
the entire bug this module exists to close.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

from PIL import ImageFont

from .font_manager import resolve_font_info

# ---------------------------------------------------------------------------
# CANONICAL CONSTANTS — mirrored exactly in frontend/src/lib/captionLayout.js
# ---------------------------------------------------------------------------

# Caption text never runs closer than this fraction of the canvas width to
# either edge. Max line width = canvas_width * (1 - 2*SIDE_MARGIN_RATIO).
SIDE_MARGIN_RATIO = 0.08

# Space between lines, as a multiple of that line's own natural text height
# (max ascent + max descent among its words) — the equivalent of CSS
# line-height. 1.0 would pack lines with zero gap; >1 adds breathing room.
LINE_HEIGHT_MULTIPLIER = 1.22

# Inter-word gap after word i, as a fraction of word i's OWN font size —
# mirrors the old Preview CSS convention (`marginRight: '0.25em'`, which
# resolves against that span's own computed font-size, not the next one's).
WORD_GAP_EM = 0.25

# Extra per-character spacing applied when item.case == 'upper' — mirrors
# the old Preview-only letterSpacing: '0.04em' CSS rule (VideoPreview.jsx).
# Baking this into the canonical measurement (rather than leaving it as a
# CSS-only afterthought) is what lets word-wrap agree between Preview and
# Export for uppercase captions: a word's MEASURED width — and therefore
# every following word's x position and every line's wrap point — now
# already accounts for it, instead of Preview silently widening words by
# 4%/char AFTER the (Canvas-based) wrap decision had already been made.
LETTER_SPACING_EM = 0.04

# boxborderw the old single-drawtext plain-caption path hardcoded for
# item.backgroundColor's whole-line pill — reused here so a caption
# with a background looks the same size as before.
WHOLE_LINE_BG_PADDING = 18

# Vertical anchors for the caption block as a whole — chosen so a single
# line of text lands almost exactly where the old single-line-only
# implementation put it (render.py's former _caption_y_expr): "top"
# anchors the block's TOP edge, "bottom" anchors the block's BOTTOM edge,
# "center" anchors the block's vertical CENTER, each as a fraction of the
# canvas height. Multi-line captions grow from these same anchors.
TOP_ANCHOR_RATIO = 0.08
BOTTOM_ANCHOR_RATIO = 0.14   # block bottom sits at H * (1 - 0.14)
CENTER_ANCHOR_RATIO = 0.60


@dataclass
class WordStyle:
    """Per-word style resolved from a TimelineItem — mirrors the fields
    render.py's old per-word drawtext builder and VideoPreview.jsx's
    per-word <span> already computed independently; centralized here so
    both renderers read the exact same decisions instead of two separate
    (and driftable) copies of this logic."""
    text: str
    is_stress: bool
    font_family: str            # resolved family (post-fallback) — the family the
                                 # frontend's synthetic per-file FontFace name is
                                 # derived from, NOT necessarily the item's requested one
    font_path: str              # resolved absolute path — the SAME file FFmpeg's fontfile= reads
    font_rel_path: str          # path relative to backend/fonts/, servable at
                                 # /api/fonts/<font_rel_path> — what the API response
                                 # sends the frontend so it never has to re-run any
                                 # fallback ladder of its own (see font_manager._resolve)
    resolved_weight: int        # weight the ladder actually landed on (post-snap)
    font_size: float            # canvas-space px
    letter_spacing_px: float    # extra px added after EACH character (0 unless
                                 # item.case == 'upper' — see LETTER_SPACING_EM)
    color: str
    background_color: Optional[str]
    padding: float
    corner_radius: float
    stroke_color: Optional[str]
    stroke_width: float
    font_style: str              # 'normal' | 'italic'


@dataclass
class PositionedWord:
    word: WordStyle
    x: float           # canvas-space, left edge of the word's glyph box
    y: float            # canvas-space, TOP of the glyph box (ffmpeg drawtext / PIL "la"-anchor
                         # convention: NOT the baseline — see baseline below)
    baseline: float      # canvas-space y of this word's LINE's shared baseline
    width: float


@dataclass
class Line:
    words: List[PositionedWord]
    left: float          # canvas-space x of this line's left edge (== its horizontal centering offset)
    top: float
    bottom: float
    baseline: float
    width: float        # total measured content width of this line


@dataclass
class CaptionLayout:
    lines: List[Line]
    block_top: float
    block_bottom: float


# ---------------------------------------------------------------------------
# Real font-metric measurement (Pillow/FreeType) — replaces the old
# per-character-class width heuristic with the font file's ACTUAL glyph
# advance widths: the same numbers FFmpeg's own libfreetype-based drawtext
# uses internally to lay glyphs out, read from the identical file
# font_manager.resolve_font() hands to fontfile=.
# ---------------------------------------------------------------------------

@lru_cache(maxsize=256)
def _load_font(font_path: str, size_px: int) -> "ImageFont.FreeTypeFont":
    return ImageFont.truetype(font_path, size_px)


def measure_text_width(
    text: str, font_path: str, font_size: float, letter_spacing_px: float = 0.0
) -> float:
    if not text:
        return 0.0
    # PIL wants an integer pixel size. Caption sizes are always whole
    # canvas pixels in practice (item.fontSize/stressFontSize are ints),
    # and sub-pixel rounding here is invisible at these font sizes.
    font = _load_font(font_path, max(1, round(font_size)))
    width = float(font.getlength(text))
    if letter_spacing_px:
        # Mirrors CSS letter-spacing: added after EVERY character in the
        # box, including the last — matching how Chrome/Preview's
        # `letterSpacing: '0.04em'` span actually measures (see
        # LETTER_SPACING_EM). Folding it in here means the wrap decision
        # below and every downstream x position already reflect it.
        width += letter_spacing_px * len(text)
    return width


def font_ascent_descent(font_path: str, font_size: float) -> Tuple[float, float]:
    font = _load_font(font_path, max(1, round(font_size)))
    ascent, descent = font.getmetrics()
    return float(ascent), float(descent)


# ---------------------------------------------------------------------------
# Word style resolution — one TimelineItem -> one WordStyle per word.
# Faithfully ports the exact fallback rules the two now-removed call sites
# (render.py's _build_stress_caption_filters and the old plain-caption
# loop) and VideoPreview.jsx's per-word <span> already implemented
# independently — no behavior change here, just one shared copy of it.
# ---------------------------------------------------------------------------

def resolve_words(item) -> List[WordStyle]:
    words_raw = (item.text or "").split(" ")
    stress_set = set(item.stressWordIndices or [])
    base_font_size = item.fontSize or 64
    stress_font_size = item.stressFontSize or base_font_size
    base_stroke_on = bool(item.strokeWidth and item.strokeColor)
    stress_stroke_on = (
        (item.stressStrokeEnabled if item.stressStrokeEnabled is not None else base_stroke_on)
        and (item.stressStrokeWidth is None or item.stressStrokeWidth > 0)
    )
    # Mirrors the old Preview CSS rule exactly: `letterSpacing: '0.04em'`
    # was set on EACH WORD'S OWN SPAN, so it resolved against THAT word's
    # own font-size — a stress word rendered bigger (stressFontSize) got
    # proportionally more letter-spacing than a base word, not a fixed
    # amount computed once from the base size. Computed per-word below
    # (after `size` is known) rather than once here, to preserve that.

    out: List[WordStyle] = []
    for wi, text in enumerate(words_raw):
        is_stress = wi in stress_set

        if is_stress:
            family = item.stressFontFamily or item.fontFamily
            weight = item.stressFontWeight or getattr(item, "fontWeight", None)
            style = item.stressFontStyle or "normal"
            size = stress_font_size
            color = item.stressColor or item.color or "#0F172A"
            bg = item.stressBackgroundColor
            padding = item.stressPadding if item.stressPadding is not None else 12
            corner_radius = item.stressCornerRadius if item.stressCornerRadius is not None else 10
            if stress_stroke_on:
                stroke_color = item.stressStrokeColor or item.strokeColor or "#000000"
                stroke_width = item.stressStrokeWidth if item.stressStrokeWidth is not None else (item.strokeWidth or 1)
                if stroke_width <= 0:
                    stroke_color, stroke_width = None, 0
            else:
                stroke_color, stroke_width = None, 0
        else:
            family = item.fontFamily
            weight = getattr(item, "fontWeight", None)
            style = "normal"
            size = base_font_size
            color = item.color or "#FFFFFF"
            # item.backgroundColor is a WHOLE-LINE pill (one
            # continuous box behind the entire line, matching the
            # pre-fix single-drawtext behavior's box=1), not a
            # per-word one — render.py/VideoPreview.jsx paint it
            # separately per Line using WHOLE_LINE_BG_PADDING, so
            # it is deliberately NOT set here. Nor is
            # item.highlightColor (the older single-first-word
            # "legacy highlight" toggle) — render.py's export never
            # read it before this fix either; it remains a
            # Preview-only decoration (see captionLayout.js's
            # resolveWordStyles).
            bg = None
            padding = WHOLE_LINE_BG_PADDING
            corner_radius = 0
            if base_stroke_on:
                stroke_color, stroke_width = item.strokeColor, item.strokeWidth
            else:
                stroke_color, stroke_width = None, 0

        letter_spacing_px = size * LETTER_SPACING_EM if item.case == "upper" else 0.0
        info = resolve_font_info(family, weight, style)
        out.append(WordStyle(
            text=text,
            is_stress=is_stress,
            font_family=info["family"],
            font_path=info["path"],
            font_rel_path=info["relPath"],
            resolved_weight=info["weight"],
            font_size=size,
            letter_spacing_px=letter_spacing_px,
            color=color,
            background_color=bg,
            padding=padding,
            corner_radius=corner_radius,
            stroke_color=stroke_color,
            stroke_width=stroke_width or 0,
            font_style=info["style"],
        ))
    return out


# ---------------------------------------------------------------------------
# Greedy multi-line word-wrap — the SAME algorithm
# frontend/src/lib/captionLayout.js runs, driven only by (a) each word's
# REAL measured width in its own resolved font/size and (b) the canonical
# max line width. Two engines that agree on every word's width therefore
# agree on every line break, by construction.
# ---------------------------------------------------------------------------

def _wrap_lines(words: List[WordStyle], max_width: float) -> List[List[Tuple[WordStyle, float]]]:
    lines: List[List[Tuple[WordStyle, float]]] = []
    current: List[Tuple[WordStyle, float]] = []
    current_width = 0.0

    for w in words:
        width = (
            measure_text_width(w.text, w.font_path, w.font_size, w.letter_spacing_px)
            if w.text else 0.0
        )
        gap = (current[-1][0].font_size * WORD_GAP_EM) if current else 0.0
        projected = current_width + gap + width
        if current and projected > max_width:
            lines.append(current)
            current = [(w, width)]
            current_width = width
        else:
            current.append((w, width))
            current_width += gap + width

    if current or not lines:
        lines.append(current)
    return lines


# ---------------------------------------------------------------------------
# Full layout: resolve words -> wrap -> position (x, baseline-aligned y).
# ---------------------------------------------------------------------------

def layout_caption(item, canvas_width: int, canvas_height: int) -> CaptionLayout:
    words = resolve_words(item)
    max_width = canvas_width * (1 - 2 * SIDE_MARGIN_RATIO)
    wrapped = _wrap_lines(words, max_width)

    # Pass 1: per-line natural metrics, from the tallest word on that line.
    line_metrics = []
    for line_words in wrapped:
        max_ascent = 0.0
        max_descent = 0.0
        for w, _width in line_words:
            a, d = font_ascent_descent(w.font_path, w.font_size)
            max_ascent = max(max_ascent, a)
            max_descent = max(max_descent, d)
        natural_height = max_ascent + max_descent
        line_height = natural_height * LINE_HEIGHT_MULTIPLIER
        line_metrics.append((max_ascent, max_descent, natural_height, line_height))

    total_height = sum(lh for *_rest, lh in line_metrics)

    position = item.position or "bottom"
    if position == "top":
        block_top = canvas_height * TOP_ANCHOR_RATIO
    elif position == "center":
        block_top = canvas_height * CENTER_ANCHOR_RATIO - total_height / 2
    else:  # bottom (default)
        block_top = canvas_height * (1 - BOTTOM_ANCHOR_RATIO) - total_height

    lines: List[Line] = []
    cursor_y = block_top
    for line_words, (max_ascent, _max_descent, natural_height, line_height) in zip(wrapped, line_metrics):
        top_pad = (line_height - natural_height) / 2
        baseline = cursor_y + top_pad + max_ascent
        line_bottom = cursor_y + line_height

        line_width = sum(width for _w, width in line_words)
        if len(line_words) > 1:
            line_width += sum(
                line_words[i][0].font_size * WORD_GAP_EM for i in range(len(line_words) - 1)
            )
        start_x = (canvas_width - line_width) / 2

        positioned: List[PositionedWord] = []
        x = start_x
        for w, width in line_words:
            ascent, _descent = font_ascent_descent(w.font_path, w.font_size)
            positioned.append(PositionedWord(
                word=w,
                x=x,
                y=baseline - ascent,
                baseline=baseline,
                width=width,
            ))
            x += width + w.font_size * WORD_GAP_EM

        lines.append(Line(
            words=positioned, left=start_x, top=cursor_y, bottom=line_bottom,
            baseline=baseline, width=line_width,
        ))
        cursor_y = line_bottom

    return CaptionLayout(lines=lines, block_top=block_top, block_bottom=cursor_y)


# ---------------------------------------------------------------------------
# JSON serialization — the wire format for POST /api/captions/layout
# (routers/captions.py), the ONLY thing VideoPreview.jsx's caption renderer
# consumes: no wrapping, no measurement, no font-fallback logic of its own
# on that side any more — just this dict, rendered at 1:1 canvas-space
# pixel coordinates. render.py never calls this: it consumes the
# CaptionLayout dataclasses above directly, in-process, so this function
# is a pure mirror of those dataclasses' fields, not a second, separately
# -maintained shape that could drift from what FFmpeg actually draws.
# ---------------------------------------------------------------------------

def serialize_layout(item, layout: CaptionLayout) -> Dict[str, Any]:
    pad = WHOLE_LINE_BG_PADDING
    lines_out = []
    for line in layout.lines:
        line_bg = None
        if item.backgroundColor:
            # Identical box math to render.py's _build_caption_filters
            # drawbox — both read the same line.left/top/width/bottom and
            # the same WHOLE_LINE_BG_PADDING constant, so the pill Preview
            # draws from this dict and the pill FFmpeg draws from the
            # dataclass directly are pixel-identical by construction.
            line_bg = {
                "color": item.backgroundColor,
                "x": line.left - pad,
                "y": line.top - pad,
                "width": line.width + 2 * pad,
                "height": (line.bottom - line.top) + 2 * pad,
            }

        words_out = []
        for pw in line.words:
            w = pw.word
            if not w.text:
                # Double-space artifact from text.split(' ') — render.py
                # skips these too (see _build_caption_filters); nothing to
                # draw, and its width/gap are already folded into the
                # positions of every word after it.
                continue
            ascent, descent = font_ascent_descent(w.font_path, w.font_size)
            words_out.append({
                "text": w.text,
                "isStress": w.is_stress,
                "x": pw.x,
                "y": pw.y,
                "baseline": pw.baseline,
                "width": pw.width,
                "ascent": ascent,
                "descent": descent,
                # fontFamily is the RESOLVED (post-fallback) family, for
                # display/debugging — fontFile is what the frontend
                # actually loads (via a synthetic per-file FontFace
                # keyed to this exact relative path), so no fallback
                # ladder of any kind needs to run client-side.
                "fontFamily": w.font_family,
                "fontFile": w.font_rel_path,
                "fontWeight": w.resolved_weight,
                "fontStyle": w.font_style,
                "fontSize": w.font_size,
                "letterSpacingPx": w.letter_spacing_px,
                "color": w.color,
                "backgroundColor": w.background_color,
                "padding": w.padding,
                "cornerRadius": w.corner_radius,
                "strokeColor": w.stroke_color,
                "strokeWidth": w.stroke_width,
            })

        lines_out.append({
            "left": line.left,
            "top": line.top,
            "bottom": line.bottom,
            "baseline": line.baseline,
            "width": line.width,
            "background": line_bg,
            "words": words_out,
        })

    return {
        "blockTop": layout.block_top,
        "blockBottom": layout.block_bottom,
        "lines": lines_out,
    }
