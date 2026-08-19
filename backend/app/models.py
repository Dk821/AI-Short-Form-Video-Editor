"""
Timeline data model.

This mirrors section 6 ("Timeline Model") of the architecture doc:
Timeline JSON is the single source of truth consumed by both the
browser preview and the server renderer.
"""
from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class Transform(BaseModel):
    x: float = 0
    y: float = 0
    scale: float = 1
    rotation: float = 0


class TimelineItem(BaseModel):
    id: str
    type: Literal["video", "image", "broll", "caption", "audio", "sfx", "zoom", "overlay"]
    assetId: Optional[str] = None          # points at an uploaded asset (video/image/audio)
    sourceUrl: Optional[str] = None        # template-bundled asset not in project.assets (e.g. an overlay video shipped with a template)
    blendMode: Optional[Literal["normal", "screen", "multiply", "overlay", "add"]] = None  # overlay-track items only
    templateId: Optional[str] = None       # overlay-track items only — which template added this, so re-applying a different template can clean up the old one
    start: float                            # seconds, position on the timeline
    duration: float                         # seconds, length on the timeline
    sourceStart: float = 0                  # seconds, in-point inside the source asset (trim)
    transform: Transform = Field(default_factory=Transform)
    opacity: float = 1
    zIndex: int = 0

    # caption-only fields
    text: Optional[str] = None
    words: Optional[List[dict]] = None
    fontFamily: Optional[str] = "Inter"
    fontWeight: Optional[int] = 600
    fontSize: Optional[int] = 64
    color: Optional[str] = "#FFFFFF"
    highlightColor: Optional[str] = "#22D3EE"
    strokeColor: Optional[str] = None
    strokeWidth: Optional[int] = 0
    backgroundColor: Optional[str] = None
    position: Optional[Literal["top", "center", "bottom"]] = "bottom"
    textAlign: Optional[Literal["left", "center", "right"]] = "center"
    case: Optional[Literal["none", "upper"]] = "none"
    animation: Optional[Literal["none", "fade", "pop", "bounce", "karaoke", "word_by_word", "slide_up"]] = "fade"

    # audio/sfx-only
    volume: Optional[float] = 1.0

    # broll-suggestion-only (AI auto-edit, milestone 3): a keyword awaiting a
    # real asset. assetId stays None until the user (or a future Pexels
    # integration) attaches actual footage.
    keyword: Optional[str] = None

    # split-screen layout & reveal animation fields
    layout: Optional[Literal["full", "split_top", "split_bottom"]] = "full"
    revealAnimation: Optional[Literal["none", "slide_down", "slide_up", "slide_left", "slide_right", "fade_in", "zoom_in", "wipe_down", "bounce_in"]] = "none"
    revealDuration: Optional[float] = 0.5


class Track(BaseModel):
    id: str
    type: Literal["video", "broll", "caption", "audio", "sfx", "overlay", "zoom"]
    items: List[TimelineItem] = Field(default_factory=list)


class ProjectMeta(BaseModel):
    id: str
    width: int = 1080
    height: int = 1920
    fps: int = 30
    duration: float = 0


class Timeline(BaseModel):
    project: ProjectMeta
    tracks: List[Track] = Field(default_factory=list)


class Asset(BaseModel):
    id: str
    kind: Literal["video", "image", "audio"]
    filename: str
    url: str
    servedPath: Optional[str] = None
    duration: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None


class TranscriptWord(BaseModel):
    word: str
    start: float
    end: float
    probability: Optional[float] = None


class Transcript(BaseModel):
    assetId: str
    words: List[TranscriptWord] = Field(default_factory=list)


class Project(BaseModel):
    id: str
    name: str = "Untitled project"
    timeline: Timeline
    assets: List[Asset] = Field(default_factory=list)
    transcript: Optional[Transcript] = None
    templateId: Optional[str] = None
    brollStyle: Optional[dict] = None
    zoomStyle: Optional[dict] = None
    createdAt: Optional[str] = None
    coverImage: Optional[str] = None       # browser-servable URL of the saved cover frame (see routers/projects.py set_cover)


class ExportJob(BaseModel):
    id: str
    projectId: str
    status: Literal["queued", "processing", "done", "failed"] = "queued"
    progress: float = 0
    outputUrl: Optional[str] = None
    error: Optional[str] = None