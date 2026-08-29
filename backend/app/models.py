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
    type: Literal["video", "image", "broll", "caption", "audio", "sfx", "zoom", "overlay", "speaker", "cta"]
    assetId: Optional[str] = None          # points at an uploaded asset (video/image/audio)
    sourceUrl: Optional[str] = None        # template-bundled asset not in project.assets (e.g. an overlay video shipped with a template)
    blendMode: Optional[Literal["normal", "screen", "multiply", "overlay", "add"]] = None  # overlay-track items only
    templateId: Optional[str] = None       # overlay-track items only — which template added this, so re-applying a different template can clean up the old one
    start: float                            # seconds, position on the timeline
    duration: float                         # seconds, length ON THE TIMELINE — independent of
                                             # the physical source file's own length. A 10s
                                             # overlay.mp4 can be placed for 3s (trimmed) or 15s
                                             # (looped) without ever touching the source file.
                                             # See backend/app/overlays/resolver.py.
    sourceStart: float = 0                  # seconds, in-point inside the source asset (trim)
    sourceDuration: Optional[float] = None  # seconds of source to consume from sourceStart
                                             # onward, before trim/loop/hold kicks in. None
                                             # (default, and what every pre-existing item has)
                                             # means "use the source's whole remaining length" —
                                             # this is what keeps old projects rendering exactly
                                             # as before. broll/overlay items only.
    loop: Optional[bool] = None             # broll/overlay items only. None = auto (loop only
                                             # if the timeline duration needs more than the
                                             # source has); True = force loop; False = never
                                             # loop — hold the last frame instead once the
                                             # source runs out. See overlays/resolver.py.
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
    revealAnimation: Optional[Literal["none", "slide_down", "slide_up", "slide_left", "slide_right", "fade_in", "zoom_in", "pop", "wipe_down", "bounce_in"]] = "none"
    revealDuration: Optional[float] = 0.5

    # speaker-only (picture-in-picture bubble of the main video, placed on
    # the "overlay" track — reuses assetId (= main video's own asset id) and
    # the dynamic-overlay-duration fields above (sourceStart/sourceDuration/
    # loop) plus transform.x/y/scale for corner positioning). `shape` also
    # doubles for the PiP bubble's own frame shape (circle/rounded).
    shape: Optional[Literal["circle", "rounded"]] = "circle"

    # cta-only (a pill-shaped call-to-action overlay; lives on its own "cta"
    # track). Reuses the caption-ish fields above (text/color/backgroundColor/
    # position/fontSize) plus this icon name.
    ctaIcon: Optional[str] = None

    # Set to "auto_edit" on every zoom/broll/overlay item template_engine.py's
    # apply_edit_decisions creates from an AI auto-edit pass (see
    # routers/auto_edit.py) — never set on a manually-placed item (a scene's
    # Zoom toggle, an attached B-roll clip). This is the only thing telling
    # the two apart, since both share the exact same "<type>_<8 hex>" id
    # pattern — see Sidebar.jsx's AI Auto Zooms/B-rolls boost cards, which
    # use it to remove only what THEY added when the feature is turned back
    # off, instead of wiping out anything the user placed by hand.
    source: Optional[Literal["auto_edit"]] = None

    # When true, the renderer and the live preview both skip this item
    # entirely — used to disable/enable content WITHOUT deleting it (so
    # turning it back on instantly restores exactly what was there, no
    # re-generation needed). Currently used for the "AI Subtitles &
    # Captions" boost toggle (Sidebar.jsx sets this on every caption item
    # at once) and the per-line "Hide subtitle" eye button (sets it on a
    # single caption item). None/False = visible (the default — every
    # pre-existing item behaves exactly as before this field existed).
    hidden: Optional[bool] = None

    # "AI Stress Text Highlighter" (caption-only). `stressWordIndices` is
    # per-item — indices into `text.split(' ')` for THIS line, computed by
    # stress_words.detect_stress_word_indices() and cleared (set back to
    # None) when the feature is turned off. The style fields below are
    # global by convention rather than per-line: Sidebar.jsx writes the
    # same value onto every caption item at once (see updateAllCaptions —
    # the exact pattern already used for the base caption style: color,
    # fontFamily, etc.), so any one item's stress* fields represent the
    # single shared highlight style. A None style field means "use the
    # matching base caption field instead" (e.g. stressColor falls back to
    # color) — see render.py's caption loop and VideoPreview.jsx.
    stressWordIndices: Optional[List[int]] = None
    stressColor: Optional[str] = None
    stressBackgroundColor: Optional[str] = None   # None = no background/pill
    stressStrokeEnabled: Optional[bool] = None
    stressStrokeColor: Optional[str] = None
    stressStrokeWidth: Optional[int] = None
    stressFontFamily: Optional[str] = None
    stressFontSize: Optional[int] = None
    stressFontWeight: Optional[int] = None
    stressFontStyle: Optional[Literal["normal", "italic"]] = None
    stressPadding: Optional[int] = None
    stressCornerRadius: Optional[int] = None       # live-preview only — ffmpeg's
                                                    # drawtext box has no rounded-
                                                    # corner option, see render.py
    stressAnimation: Optional[Literal["none", "pop", "pulse", "underline", "glow"]] = None
    # ^ live-preview only (CSS keyframes) — export renders the highlight
    # statically. Animating an ffmpeg drawtext box per detected word is a
    # much larger filtergraph undertaking than this feature's scope; this
    # is a deliberate, documented gap rather than a silent one.


class Track(BaseModel):
    id: str
    type: Literal["video", "broll", "caption", "audio", "sfx", "overlay", "zoom", "cta"]
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
    format: Literal["mp4", "webm", "gif"] = "mp4"
    quality: Literal["draft", "standard", "high"] = "standard"
    frameRate: Optional[int] = None  # None = use the project's own fps
    progress: float = 0
    outputUrl: Optional[str] = None
    error: Optional[str] = None