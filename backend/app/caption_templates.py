"""
Caption templates & Canonical Speech Segmentation.

Core principle:
ONE CANONICAL TIMELINE
→ Word View
→ Caption View
→ Scene View
→ Timeline Tracks
→ B-roll / Zoom / Overlay
→ Preview + FFmpeg Export

Every timestamp originates from the exact word-level transcript from Whisper.
- Scene start = first word.start
- Scene end = last word.end
- Captions are grouped WITHIN each scene boundary and NEVER cross sentences or pauses.
- Real silence gaps are preserved exactly as Whisper recorded them.
"""
from __future__ import annotations

import uuid
from typing import List, TypedDict, Optional


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


def segment_words_into_scenes(words: List[dict]) -> List[dict]:
    """Segment flat word transcript into natural sentence/speech scenes.
    
    A scene boundary occurs when:
    1. Terminal punctuation: '.', '!', '?' at the end of a word.
    2. Silence pause: gap >= 0.45s between current word end and next word start.
    3. Max words limit: 14 words max per scene.
    
    Every scene:
    - start = first word.start
    - end = last word.end
    - words = list of words in this scene
    """
    if not words:
        return []

    scenes: List[dict] = []
    current_words: List[dict] = []

    for i, w in enumerate(words):
        if not w.get("word"):
            continue
        current_words.append(w)

        word_str = str(w.get("word", "")).strip()
        ends_sentence = any(word_str.endswith(p) for p in [".", "!", "?", "...", "…"])

        has_silence_after = False
        if i < len(words) - 1:
            next_start = float(words[i + 1].get("start", 0))
            cur_end = float(w.get("end", 0))
            if next_start - cur_end >= 0.45:
                has_silence_after = True

        is_too_long = len(current_words) >= 14

        if ends_sentence or has_silence_after or is_too_long or i == len(words) - 1:
            if current_words:
                scenes.append({
                    "id": f"scene_{len(scenes)}",
                    "start": round(float(current_words[0]["start"]), 3),
                    "end": round(float(current_words[-1]["end"]), 3),
                    "text": " ".join(str(item.get("word", "")).strip() for item in current_words).strip(),
                    "words": current_words,
                })
                current_words = []

    return scenes


def generate_caption_items(words: List[dict], template_id: str, words_per_caption: int | None = None) -> List[dict]:
    """Legacy path (the original 4 flat presets)."""
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
    """Template System path. Called when applying a full VideoTemplate."""
    get = (lambda k: caption_style.get(k)) if isinstance(caption_style, dict) else (lambda k: getattr(caption_style, k))

    animation = get("animation")
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
    scenes = segment_words_into_scenes(words)

    for scene in scenes:
        scene_words = [w for w in scene["words"] if w.get("word")]
        if not scene_words:
            continue

        for i in range(0, len(scene_words), group_size):
            group = scene_words[i : i + group_size]
            if not group:
                continue

            start = round(float(group[0]["start"]), 3)
            end = round(float(group[-1]["end"]), 3)
            duration = round(max(end - start, 0.1), 3)

            raw_text = " ".join(str(w["word"]).strip() for w in group).strip()
            if not raw_text:
                continue
            text = raw_text.upper() if case == "upper" else raw_text

            # Attach canonical word objects with individual timestamps
            word_list = [
                {
                    "word": (str(w["word"]).upper() if case == "upper" else str(w["word"])).strip(),
                    "start": round(float(w["start"]), 3),
                    "end": round(float(w["end"]), 3),
                    "probability": w.get("probability"),
                }
                for w in group
            ]

            items.append(
                {
                    "id": f"cap_{uuid.uuid4().hex[:8]}",
                    "type": "caption",
                    "assetId": None,
                    "start": start,
                    "duration": duration,
                    "sourceStart": 0,
                    "transform": {"x": 0, "y": 0, "scale": 1, "rotation": 0},
                    "opacity": 1,
                    "zIndex": 100,
                    "text": text,
                    "words": word_list,
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
