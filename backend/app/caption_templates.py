"""
Caption templates (Milestone 2, step 2).

Turns the flat word list from transcribe.py into one caption
TimelineItem per word or phrase — no manual placement. Each preset is a
style bundle (font size, color, highlight color, position) matching the
doc's "reusable caption/video templates" (section 0, item 4).
"""
from __future__ import annotations

import uuid
from typing import List, TypedDict


class CaptionTemplate(TypedDict):
    name: str
    description: str
    fontSize: int
    color: str
    highlightColor: str
    position: str
    defaultWordsPerCaption: int


CAPTION_TEMPLATES: dict[str, CaptionTemplate] = {
    "clean_bottom": {
        "name": "Clean Bottom",
        "description": "Simple white phrases, bottom-safe area. Good default for talking-head clips.",
        "fontSize": 60,
        "color": "#FFFFFF",
        "highlightColor": "#5EEAD4",
        "position": "bottom",
        "defaultWordsPerCaption": 4,
    },
    "bold_karaoke": {
        "name": "Bold Karaoke",
        "description": "Large centered phrases, one beat at a time.",
        "fontSize": 84,
        "color": "#FFFFFF",
        "highlightColor": "#FBBF24",
        "position": "center",
        "defaultWordsPerCaption": 3,
    },
    "minimal_top": {
        "name": "Minimal Top",
        "description": "Small, quiet captions that stay out of the way at the top of the frame.",
        "fontSize": 44,
        "color": "#E5E7EB",
        "highlightColor": "#5EEAD4",
        "position": "top",
        "defaultWordsPerCaption": 5,
    },
    "punch_yellow": {
        "name": "Punch Yellow",
        "description": "High-impact single-word yellow captions, Hormozi-style.",
        "fontSize": 96,
        "color": "#FDE047",
        "highlightColor": "#FFFFFF",
        "position": "center",
        "defaultWordsPerCaption": 1,
    },
}


def generate_caption_items(words: List[dict], template_id: str, words_per_caption: int | None = None) -> List[dict]:
    """Legacy path (the original 4 flat presets). Still used by
    /api/caption-templates for backward compatibility with clients that
    predate the full Template System."""
    if template_id not in CAPTION_TEMPLATES:
        raise ValueError(f"Unknown caption template '{template_id}'")
    style = CAPTION_TEMPLATES[template_id]
    return _group_words_into_captions(
        words,
        group_size=max(1, words_per_caption or style["defaultWordsPerCaption"]),
        fontFamily="Inter",
        fontWeight=600,
        fontSize=style["fontSize"],
        color=style["color"],
        highlightColor=style["highlightColor"],
        strokeColor=None,
        strokeWidth=0,
        backgroundColor=None,
        position=style["position"],
        case="none",
        animation="fade",
    )


def generate_captions_from_style(words: List[dict], caption_style, words_per_caption: int | None = None) -> List[dict]:
    """Template System path. `caption_style` is a
    templates.schema.CaptionConfig (or any object/dict with the same
    fields) — this is what routers/templates.py calls when applying a
    full VideoTemplate."""
    get = (lambda k: caption_style.get(k)) if isinstance(caption_style, dict) else (lambda k: getattr(caption_style, k))

    animation = get("animation")
    # "word_by_word" is a grouping choice as much as a visual style — one
    # caption item per word — unless the template author explicitly
    # overrides wordsPerCaption.
    default_group = 1 if animation == "word_by_word" else get("wordsPerCaption")

    return _group_words_into_captions(
        words,
        group_size=max(1, words_per_caption or default_group),
        fontFamily=get("fontFamily"),
        fontWeight=get("fontWeight"),
        fontSize=get("fontSize"),
        color=get("color"),
        highlightColor=get("highlightColor"),
        strokeColor=get("strokeColor"),
        strokeWidth=get("strokeWidth"),
        backgroundColor=get("backgroundColor"),
        position=get("position"),
        textAlign=get("alignment"),
        case=get("case"),
        animation=animation,
    )


def _group_words_into_captions(
    words: List[dict],
    *,
    group_size: int,
    fontFamily: str,
    fontWeight: int,
    fontSize: int,
    color: str,
    highlightColor: str,
    strokeColor: str | None,
    strokeWidth: int,
    backgroundColor: str | None,
    position: str,
    case: str,
    animation: str,
    textAlign: str = "center",
) -> List[dict]:
    items: List[dict] = []
    for i in range(0, len(words), group_size):
        group = [w for w in words[i : i + group_size] if w.get("word")]
        if not group:
            continue
        start = group[0]["start"]
        end = group[-1]["end"]
        text = " ".join(w["word"] for w in group).strip()
        if not text:
            continue
        if case == "upper":
            text = text.upper()
        items.append(
            {
                "id": f"cap_{uuid.uuid4().hex[:8]}",
                "type": "caption",
                "assetId": None,
                "start": round(start, 3),
                "duration": round(max(end - start, 0.15), 3),
                "sourceStart": 0,
                "transform": {"x": 0, "y": 0, "scale": 1, "rotation": 0},
                "opacity": 1,
                "zIndex": 100,
                "text": text,
                "fontFamily": fontFamily,
                "fontWeight": fontWeight,
                "fontSize": fontSize,
                "color": color,
                "highlightColor": highlightColor,
                "strokeColor": strokeColor,
                "strokeWidth": strokeWidth,
                "backgroundColor": backgroundColor,
                "position": position,
                "textAlign": textAlign,
                "case": case,
                "animation": animation,
            }
        )
    return items
