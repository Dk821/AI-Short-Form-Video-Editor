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
    start: float                            # seconds, position on the timeline
    duration: float                         # seconds, length on the timeline
    sourceStart: float = 0                  # seconds, in-point inside the source asset (trim)
    transform: Transform = Field(default_factory=Transform)
    opacity: float = 1
    blendMode: Optional[str] = "normal"      # "normal", "screen", "multiply", "overlay"
    zIndex: int = 0

    # caption-only fields
    text: Optional[str] = None
    fontFamily: Optional[str] = "Inter"
    fontWeight: Optional[int] = 600
    fontSize: Optional[int] = 64
    color: Optional[str] = "#FFFFFF"
    highlightColor: Optional[str] = "#22D3EE"
    strokeColor: Optional[str] = None
    strokeWidth: Optional[int] = 0
    backgroundColor: Optional[str] = None
    position: Optional[Literal["top", "center", "bottom"]] = "bottom"
    case: Optional[Literal["none", "upper"]] = "none"
    animation: Optional[Literal["none", "fade", "pop", "karaoke", "slide_up", "bounce", "word_by_word"]] = "fade"

    # audio/sfx-only
    volume: Optional[float] = 1.0

    # broll-suggestion-only (AI auto-edit, milestone 3): a keyword awaiting a
    # real asset. assetId stays None until the user (or a future Pexels
    # integration) attaches actual footage.
    keyword: Optional[str] = None


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
    createdAt: Optional[str] = None


class ExportJob(BaseModel):
    id: str
    projectId: str
    status: Literal["queued", "processing", "done", "failed"] = "queued"
    progress: float = 0
    outputUrl: Optional[str] = None
    error: Optional[str] = None
