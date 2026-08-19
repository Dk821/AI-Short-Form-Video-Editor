"""
Video template schema — Submagic-Style Complete Video Editing Preset.

A "template" is a complete editing preset configuration:
captions + B-roll rules + overlays + punch-in zoom rules + transitions +
audio/SFX ducking + layout safe areas.

Core principle:
AI decides WHERE and WHEN.
Template decides HOW.
Timeline stores WHAT is rendered.
"""
from __future__ import annotations

from typing import List, Literal, Optional, Dict, Any
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
    shadow: Optional[str] = None           # e.g. "0px 4px 12px rgba(0,0,0,0.8)"
    position: Literal["top", "center", "bottom"] = "bottom"
    alignment: CaptionAlignment = "center"
    case: CaptionCase = "none"
    animation: CaptionAnimation = "fade"
    wordsPerCaption: int = 4
    letterSpacing: float = 0
    emphasisColor: Optional[str] = "#FBBF24"
    karaokeHighlightColor: Optional[str] = "#38BDF8"

    @model_validator(mode="before")
    @classmethod
    def _normalize_animation(cls, data):
        if isinstance(data, dict) and isinstance(data.get("animation"), str):
            data = dict(data)
            data["animation"] = data["animation"].replace("-", "_")
        return data


class BrollStyle(BaseModel):
    enabled: bool = True
    frequency: BrollFrequency = "medium"
    density: Literal["low", "medium", "high"] = "medium"
    defaultScale: float = 0.55
    position: Literal["top-right", "center", "full", "full-screen", "bottom-left", "split_top", "split_bottom"] = "center"
    width: Optional[float] = None
    height: Optional[float] = None
    borderRadius: int = 16
    shadow: Optional[str] = "0px 10px 30px rgba(0,0,0,0.5)"
    cropMode: Literal["cover", "contain"] = "cover"
    transitionMs: int = 250
    layout: Optional[Literal["full", "split_top", "split_bottom"]] = "full"
    revealAnimation: Optional[Literal["none", "slide_down", "slide_up", "slide_left", "slide_right", "fade_in", "zoom_in", "wipe_down", "bounce_in"]] = "none"
    exitAnimation: Optional[Literal["none", "fade_out", "slide_out_down", "zoom_out"]] = "none"
    revealDuration: Optional[float] = 0.5
    maxDuration: float = 5.0
    cooldown: float = 2.0


class OverlayStyle(BaseModel):
    enabled: bool = True
    asset: Optional[str] = None
    # videoUrl is an alias used by some template registry entries.
    # The authoritative path for server-side rendering is
    # VideoTemplate.overlayVideoUrl; this field is used by the frontend
    # preview when an overlay track item carries its own sourceUrl.
    videoUrl: Optional[str] = None
    blendMode: Literal["normal", "screen", "multiply", "overlay", "add"] = "screen"
    opacity: float = 1.0
    position: Literal["full", "top-right", "top-left", "bottom-right", "bottom-left"] = "full"
    size: Optional[str] = "100%"
    entrance: Optional[str] = "fade_in"
    exit: Optional[str] = "fade_out"
    hookText: Optional[str] = None
    watermarkPosition: Optional[str] = None


class ZoomStyle(BaseModel):
    enabled: bool = True
    minScale: float = 1.1
    maxScale: float = 1.5
    duration: float = 0.6
    easing: str = "ease-out"
    triggerRules: List[str] = Field(default_factory=lambda: ["emphasis", "punchline", "question"])


class TransitionStyle(BaseModel):
    enabled: bool = True
    availableTypes: List[str] = Field(default_factory=lambda: ["fade", "slide", "zoom", "wipe"])
    duration: float = 0.4
    easing: str = "ease-in-out"
    sceneChangeBehavior: str = "auto"


class AudioStyle(BaseModel):
    musicTrack: Optional[str] = None
    musicVolume: float = 0.3
    sfxVolume: float = 0.8
    ducking: bool = True
    duckingLevel: float = 0.2


class LayoutStyle(BaseModel):
    aspectRatio: AspectRatioId = "9:16"
    safeAreaTop: float = 10.0      # percentage top margin for safe zone
    safeAreaBottom: float = 12.0   # percentage bottom margin for safe zone
    speakerPosition: str = "center"
    brollPlacement: str = "auto"


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
    accentColor: str = "#5EEAD4"
    thumbnailUrl: Optional[str] = None
    overlayVideoUrl: Optional[str] = None
    caption: CaptionStyle
    broll: BrollStyle
    overlay: OverlayStyle = Field(default_factory=OverlayStyle)
    zoom: ZoomStyle = Field(default_factory=ZoomStyle)
    transition: TransitionStyle = Field(default_factory=TransitionStyle)
    audio: AudioStyle = Field(default_factory=AudioStyle)
    layout: LayoutStyle = Field(default_factory=LayoutStyle)

    def dimensions(self) -> tuple[int, int]:
        return ASPECT_RATIOS[self.aspectRatio]