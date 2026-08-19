"""
B-roll Library (manual browse-and-attach, distinct from auto-edit's
automatic Pexels fetch in ai_edit.py/pexels.py).

Two-step, matching the frontend's Library panel:
  1. GET  /api/broll/search  — browse/search, no download, cheap and fast.
  2. POST /api/projects/{id}/broll/attach — download ONLY the clip the
     user actually clicked, then place it on the timeline's broll track
     at a given start/duration.

Template decides HOW: when the project has an active template, the
template's BrollStyle supplies the default layout, scale, revealAnimation,
and revealDuration — so "Add B-roll" in the sidebar always uses the
template's visual language. The body can override any individual field.
"""
from __future__ import annotations

import uuid
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db
from ..pexels import search_broll, trending_broll, download_broll_asset, PEXELS_API_KEY
from ..templates import get_template

router = APIRouter(prefix="/api", tags=["broll"])


@router.get("/broll/search")
def broll_search(query: str | None = None, page: int = 1, per_page: int = 12):
    if not PEXELS_API_KEY:
        raise HTTPException(
            400,
            "PEXELS_API_KEY is not set. Get a free key at https://www.pexels.com/api/ "
            "and set it as an environment variable to enable the B-roll library.",
        )
    if query and query.strip():
        results = search_broll(query.strip(), page=page, per_page=per_page)
    else:
        results = trending_broll(page=page, per_page=per_page)
    return {"query": query, "results": results}


class AttachBrollBody(BaseModel):
    downloadUrl: str
    start: float
    duration: float
    label: str = "broll"
    # Optional explicit overrides — when None, the active template's BrollStyle
    # values are used so the template decides HOW.
    scale: Optional[float] = None
    x: float = 40
    y: float = 40
    layout: Optional[Literal["full", "split_top", "split_bottom"]] = None
    revealAnimation: Optional[Literal["none", "slide_down", "slide_up", "slide_left", "slide_right", "fade_in", "zoom_in", "wipe_down", "bounce_in"]] = None
    revealDuration: Optional[float] = None


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

    asset = download_broll_asset(body.downloadUrl, body.label)
    if not asset:
        raise HTTPException(502, "Could not download the selected clip. Try another one.")

    project["assets"].append(asset)

    item = {
        "id": f"broll_{uuid.uuid4().hex[:8]}",
        "type": "broll",
        "assetId": asset["id"],
        "start": body.start,
        "duration": body.duration,
        "sourceStart": 0,
        "transform": {"x": body.x, "y": body.y, "scale": scale, "rotation": 0},
        "opacity": 1,
        "zIndex": 10,
        "layout": layout,
        "revealAnimation": reveal_anim,
        "revealDuration": reveal_dur,
    }
    broll_track = next(t for t in project["timeline"]["tracks"] if t["type"] == "broll")
    broll_track["items"].append(item)

    db.put_project(project_id, project)
    return {"asset": asset, "item": item, "timeline": project["timeline"]}
