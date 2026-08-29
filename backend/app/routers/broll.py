"""
B-roll Library (manual browse-and-attach, distinct from auto-edit's
automatic Pexels fetch in ai_edit.py/pexels.py).

The panel has three source tabs (see BrollPicker.jsx):
  1. Image Search — GET /api/broll/search?media=image, then attach by
     downloadUrl (Pexels photo).
  2. Video Search — GET /api/broll/search?media=video (default), then
     attach by downloadUrl (Pexels video).
  3. Upload Local — POST /api/projects/{id}/upload (routers/upload.py,
     already generic across video/image/audio) up front, then attach by
     assetId — no second download, the file is already local.

Attach is always the same second step regardless of source:
  POST /api/projects/{id}/broll/attach — for Image/Video Search, downloads
  ONLY the clip/photo the user actually clicked; for Upload Local, reuses
  the already-uploaded asset as-is. Either way it places one broll
  TimelineItem on the timeline's broll track at a given start/duration,
  and returns {asset, item, timeline} in one response so the frontend can
  sync its local `assets` state in the same round trip — never a
  fire-and-forget where the timeline references an asset the frontend
  never heard about (see auto_edit.py's `assets` response field, fixed for
  the same "blank b-roll layer" reason).

Template decides HOW: when the project has an active template, the
template's BrollStyle supplies the default layout, scale, revealAnimation,
and revealDuration — so "Add B-roll" in the sidebar always uses the
template's visual language. The body can override any individual field.
"""
from __future__ import annotations

import uuid
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, model_validator

from .. import db
from ..pexels import (
    PEXELS_API_KEY,
    download_broll_asset,
    download_broll_image_asset,
    search_broll,
    search_broll_images,
    trending_broll,
    trending_broll_images,
)
from ..templates import get_template

router = APIRouter(prefix="/api", tags=["broll"])


@router.get("/broll/search")
def broll_search(query: str | None = None, media: Literal["video", "image"] = "video", page: int = 1, per_page: int = 12):
    if not PEXELS_API_KEY:
        raise HTTPException(
            400,
            "PEXELS_API_KEY is not set. Get a free key at https://www.pexels.com/api/ "
            "and set it as an environment variable to enable the B-roll library.",
        )
    has_query = bool(query and query.strip())
    if media == "image":
        results, total = (
            search_broll_images(query.strip(), page=page, per_page=per_page)
            if has_query else trending_broll_images(page=page, per_page=per_page)
        )
    else:
        results, total = (
            search_broll(query.strip(), page=page, per_page=per_page)
            if has_query else trending_broll(page=page, per_page=per_page)
        )
    total_pages = max(1, -(-total // per_page)) if total else (2 if len(results) == per_page else 1)
    return {"query": query, "media": media, "page": page, "totalResults": total, "totalPages": total_pages, "results": results}


class AttachBrollBody(BaseModel):
    # Exactly one of these two identifies the media to place:
    #   - downloadUrl: a Pexels video/photo link picked from Image/Video
    #     Search — downloaded now, for the first time.
    #   - assetId: an asset the project already has (e.g. just uploaded via
    #     Upload Local, or reused from an earlier attach) — placed as-is,
    #     no download.
    downloadUrl: Optional[str] = None
    assetId: Optional[str] = None
    # Only consulted when downloadUrl is used — which Pexels endpoint the
    # link came from, so we call the matching downloader.
    mediaType: Literal["video", "image"] = "video"
    start: float
    duration: float
    label: str = "broll"
    # Optional explicit overrides — when None, the active template's BrollStyle
    # values are used so the template decides HOW.
    scale: Optional[float] = None
    x: float = 40
    y: float = 40
    layout: Optional[Literal["full", "split_top", "split_bottom"]] = None
    revealAnimation: Optional[Literal["none", "slide_down", "slide_up", "slide_left", "slide_right", "fade_in", "zoom_in", "pop", "wipe_down", "bounce_in"]] = None
    revealDuration: Optional[float] = None
    # Dynamic overlay duration system (see backend/app/overlays/): lets a
    # future "trim/loop this clip" UI request a source window narrower
    # than the whole downloaded clip, and choose loop/hold behavior, when
    # `duration` (the timeline length) exceeds it. None/omitted for both
    # keeps today's behavior exactly as-is (whole clip, auto trim/loop).
    sourceDuration: Optional[float] = None
    loop: Optional[bool] = None

    @model_validator(mode="after")
    def _one_source(self):
        if not self.downloadUrl and not self.assetId:
            raise ValueError("Provide either downloadUrl or assetId")
        return self


@router.post("/projects/{project_id}/broll/attach")
def attach_broll(project_id: str, body: AttachBrollBody):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # Resolve active template — provides HOW defaults for broll items.
    template_id = project.get("templateId")
    template = get_template(template_id) if template_id else None
    broll_cfg = template.broll if template else None

    # Body values take explicit priority; fall back to template config,
    # then to safe schema defaults.
    layout = body.layout or (getattr(broll_cfg, "layout", None) or "full")
    reveal_anim = body.revealAnimation or (getattr(broll_cfg, "revealAnimation", None) or "none")
    reveal_dur = body.revealDuration if body.revealDuration is not None else (getattr(broll_cfg, "revealDuration", None) or 0.5)
    scale = body.scale if body.scale is not None else (getattr(broll_cfg, "defaultScale", None) or 0.55)

    is_new_asset = False
    if body.assetId:
        # Upload Local (or re-attaching a previously-downloaded asset) —
        # the file is already on disk and already in project["assets"];
        # nothing to download.
        asset = next((a for a in project["assets"] if a["id"] == body.assetId), None)
        if not asset:
            raise HTTPException(404, "Asset not found on this project")
    else:
        downloader = download_broll_image_asset if body.mediaType == "image" else download_broll_asset
        asset = downloader(body.downloadUrl, body.label)
        if not asset:
            raise HTTPException(502, "Could not download the selected media. Try another one.")
        project["assets"].append(asset)
        is_new_asset = True

    item = {
        "id": f"broll_{uuid.uuid4().hex[:8]}",
        "type": "broll",
        "assetId": asset["id"],
        "start": body.start,
        "duration": body.duration,
        "sourceStart": 0,
        "sourceDuration": body.sourceDuration,
        "loop": body.loop,
        "transform": {"x": body.x, "y": body.y, "scale": scale, "rotation": 0},
        "opacity": 1,
        "zIndex": 10,
        "layout": layout,
        "revealAnimation": reveal_anim,
        "revealDuration": reveal_dur,
    }
    # Find-or-create rather than an unguarded next() with no default — every
    # project has a "broll" track from creation (see routers/projects.py),
    # but this stays correct even if that ever stops being guaranteed,
    # instead of a bare next() raising StopIteration (an unhandled 500)
    # the moment it isn't. Same pattern as routers/sfx.py's attach endpoint.
    broll_track = next((t for t in project["timeline"]["tracks"] if t["type"] == "broll"), None)
    if broll_track is None:
        broll_track = {"id": "track_broll", "type": "broll", "items": []}
        project["timeline"]["tracks"].append(broll_track)
    broll_track["items"].append(item)

    db.put_project(project_id, project)
    # `isNewAsset` tells the frontend whether it still needs to merge
    # `asset` into its local assets array (an already-known assetId path
    # means it's there already — see attachBrollResult in editorStore.js).
    return {"asset": asset, "item": item, "timeline": project["timeline"], "isNewAsset": is_new_asset}
