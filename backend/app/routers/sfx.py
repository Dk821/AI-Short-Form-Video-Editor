"""
SFX Library — bundled placeholder sound effects (see app/sfx/library/
README.txt), attached to the timeline's "sfx" track.

Unlike the B-roll Library (routers/broll.py), there's no search/download
step: the whole catalog is already bundled with the app, so this is a
single browse-and-attach endpoint pair:
  1. GET  /api/sfx                         — the catalog, for the picker grid.
  2. POST /api/projects/{id}/sfx/attach    — place a chosen sfx on the
     timeline at a given start (duration defaults to the clip's own
     natural length, same "don't ask the user to guess" default as a
     b-roll clip's own footage length).

Catalog items never become project Assets (nothing was uploaded or
downloaded) — the placed TimelineItem carries `sourceUrl` pointing at the
catalog entry's served URL, same pattern as a template's bundled overlay
video (see routers/templates.py's _apply_overlay_video). render.py
resolves that URL back to the real file on disk via sfx.resolve_sfx_path
before ever handing a path to ffmpeg.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db
from ..sfx import list_sfx, get_sfx

router = APIRouter(prefix="/api", tags=["sfx"])


@router.get("/sfx")
def sfx_catalog():
    return {"results": [e.to_dict() for e in list_sfx()]}


class AttachSfxBody(BaseModel):
    sfxId: str
    start: float
    duration: Optional[float] = None  # None -> the clip's own natural length
    volume: float = 1.0


@router.post("/projects/{project_id}/sfx/attach")
def attach_sfx(project_id: str, body: AttachSfxBody):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    entry = get_sfx(body.sfxId)
    if not entry:
        raise HTTPException(404, f"Unknown sfx '{body.sfxId}'")

    item = {
        "id": f"sfx_{uuid.uuid4().hex[:8]}",
        "type": "sfx",
        "assetId": None,
        "sourceUrl": entry.url,
        "start": body.start,
        "duration": body.duration if body.duration is not None else entry.duration,
        "sourceStart": 0,
        "volume": body.volume,
        "zIndex": 0,
    }
    sfx_track = next((t for t in project["timeline"]["tracks"] if t["type"] == "sfx"), None)
    if sfx_track is None:
        sfx_track = {"id": "track_sfx", "type": "sfx", "items": []}
        project["timeline"]["tracks"].append(sfx_track)
    sfx_track["items"].append(item)

    db.put_project(project_id, project)
    return {"item": item, "timeline": project["timeline"]}
