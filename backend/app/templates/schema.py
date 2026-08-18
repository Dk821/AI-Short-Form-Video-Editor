"""
Video template schema (Template System, step 1).

A "template" is the configurable bundle the product brief asks for:
caption style + fonts + colors + animations + positioning + B-roll
behavior + aspect ratio. Everything downstream (caption generation,
render.py, the frontend template picker/preview) reads from these
typed dataclasses instead of ad-hoc dicts, so adding template #9 never
means touching editor logic — only registry.py.

This intentionally extends (not replaces) caption_templates.py's
CAPTION_TEMPLATES: those four presets become the caption half of the
first four entries in TEMPLATES below, so nothing that already depends
on /api/caption-templates breaks.
"""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field

CaptionAnimation = Literal["none", "fade", "pop", "karaoke", "slide_up", "bounce", "word_by_word"]
CaptionCase = Literal["none", "upper"]
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
    case: CaptionCase = "none"
    animation: CaptionAnimation = "fade"
    wordsPerCaption: int = 4
    letterSpacing: float = 0


class BrollStyle(BaseModel):
    frequency: BrollFrequency = "medium"
    defaultScale: float = 0.55
    position: Literal["top-right", "center", "full", "full-screen", "bottom-left"] = "center"
    transitionMs: int = 250


class OverlayStyle(BaseModel):
    enabled: bool = True
    blendMode: Literal["normal", "screen", "multiply", "overlay"] = "screen"
    opacity: float = 1.0
    videoUrl: Optional[str] = None
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
    thumbnailUrl: Optional[str] = None   # e.g. "/api/templates/thumbnails/viral.jpg"
    overlayVideoUrl: Optional[str] = None  # e.g. "/api/templates/overlays/viral.mp4"
    caption: CaptionStyle
    broll: BrollStyle
    overlay: OverlayStyle = Field(default_factory=OverlayStyle)

    def dimensions(self) -> tuple[int, int]:
        return ASPECT_RATIOS[self.aspectRatio]


