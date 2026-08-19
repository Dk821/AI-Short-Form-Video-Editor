"""
Video template schema (Template System, step 1).

A "template" is the configurable bundle the product brief asks for:
caption style + fonts + colors + animations + positioning + B-roll
behavior + aspect ratio. Everything downstream (caption generation,
render.py, the frontend template picker/preview) reads from these
typed dataclasses instead of ad-hoc dicts, so adding template #9 never
means touching editor logic — only registry.py + a new library/*.json.
"""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field, model_validator

CaptionAnimation = Literal["none", "fade", "pop", "karaoke", "slide_up", "bounce", "word_by_word"]
CaptionCase = Literal["none", "upper"]
CaptionAlignment = Literal["left", "center", "right"]
BrollFrequency = Literal["low", "medium", "high"]
AspectRatioId = Literal["9:16", "16:9", "1:1", "4:5"]

ASPECT_RATIOS: dict[AspectRatioId, tuple[int, int]] = {
    "9:16": (1080, 1920),
    "16:9": (1920, 1080),
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
}


class CaptionStyle(BaseModel):
    fontFamily: str = "Inter"
    fontWeight: int = 700
    fontSize: int = 64
    color: str = "#FFFFFF"
    highlightColor: str = "#22D3EE"
    strokeColor: Optional[str] = "#000000"
    strokeWidth: int = 0
    backgroundColor: Optional[str] = None  # None = no box, e.g. "#000000AA"
    position: Literal["top", "center", "bottom"] = "bottom"
    alignment: CaptionAlignment = "center"
    case: CaptionCase = "none"
    animation: CaptionAnimation = "fade"
    wordsPerCaption: int = 4
    letterSpacing: float = 0  # reserved: not yet wired into render.py's drawtext (ffmpeg has no native letter-spacing) — CSS-preview only for now

    @model_validator(mode="before")
    @classmethod
    def _normalize_animation(cls, data):
        """Canonical form is underscore (slide_up, word_by_word) — but
        hyphens have shown up in hand-written template JSON more than
        once, so normalize instead of hard-failing the whole file."""
        if isinstance(data, dict) and isinstance(data.get("animation"), str):
            data = dict(data)
            data["animation"] = data["animation"].replace("-", "_")
        return data


class BrollStyle(BaseModel):
    frequency: BrollFrequency = "medium"
    defaultScale: float = 0.55
    position: Literal["top-right", "center", "full", "full-screen", "bottom-left", "split_top", "split_bottom"] = "center"
    transitionMs: int = 250
    layout: Optional[Literal["full", "split_top", "split_bottom"]] = "full"
    revealAnimation: Optional[Literal["none", "slide_down", "slide_up"]] = "none"
    revealDuration: Optional[float] = 0.5


class OverlayStyle(BaseModel):
    enabled: bool = True
    blendMode: Literal["normal", "screen", "multiply", "overlay"] = "screen"
    opacity: float = 1.0
    hookText: Optional[str] = None
    watermarkPosition: Optional[str] = None


class VideoTemplate(BaseModel):
    id: str
    name: str
    category: Literal[
        "Viral", "Podcast", "YouTube Shorts", "Instagram Reels",
        "TikTok", "Business", "Gaming", "Education",
    ]
    description: str
    tags: List[str] = Field(default_factory=list)
    aspectRatio: AspectRatioId = "9:16"
    accentColor: str = "#5EEAD4"  # used only for the picker card UI, not rendering
    # Static preview assets (served from /api/templates/thumbnails/ and /api/templates/overlays/)
    thumbnailUrl: Optional[str] = None     # e.g. "/api/templates/thumbnails/viral.jpg"
    overlayVideoUrl: Optional[str] = None  # e.g. "/api/templates/overlays/viral.mp4" — SOLE source of truth for the overlay asset path; OverlayStyle carries how to render it (blendMode/opacity/enabled), not where it lives
    caption: CaptionStyle
    broll: BrollStyle
    overlay: OverlayStyle = Field(default_factory=OverlayStyle)

    def dimensions(self) -> tuple[int, int]:
        return ASPECT_RATIOS[self.aspectRatio]
