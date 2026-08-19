"""
Template System (Template System, step 2).

Endpoints:
  GET  /api/templates                    -> full VideoTemplate list (for the picker grid)
  GET  /api/templates/{template_id}      -> one template
  POST /api/projects/{id}/apply-template -> apply a template to a project:
      - sets the project's aspect ratio (ProjectMeta width/height)
      - regenerates captions from the style bundle IF a transcript exists
      - stores broll style prefs on the project for later broll placement
      - remembers templateId on the project so the editor can show "Applied: X"

Applying a template never touches uploaded assets or destroys existing
broll/audio/zoom items — it only replaces the caption track and project
dimensions, matching the editor flow's "Choose Template" step, which
comes before manual "Edit Captions/B-roll".
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import db
from ..caption_templates import generate_captions_from_style
from ..templates import list_templates, get_template, reload_templates
from ..templates.registry import THUMBNAILS_DIR, OVERLAYS_DIR

router = APIRouter(prefix="/api", tags=["templates"])


@router.get("/templates")
def get_templates(category: str | None = None):
    templates = list_templates()
    if category:
        templates = [t for t in templates if t.category.lower() == category.lower()]
    return [t.model_dump() for t in templates]


@router.get("/templates/{template_id}")
def get_one_template(template_id: str):
    template = get_template(template_id)
    if not template:
        raise HTTPException(404, f"Unknown template '{template_id}'")
    return template.model_dump()


@router.get("/templates/thumbnails/{filename}")
def get_template_thumbnail(filename: str):
    """Serves images from templates/library/thumbnails/ — what a
    template's `thumbnail` field points at. Drop a matching image file
    there when adding a new template; no code change needed."""
    path = THUMBNAILS_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Thumbnail not found")
    return FileResponse(path)


@router.get("/templates/overlays/{filename}")
def get_template_overlay(filename: str):
    """Serves videos from templates/library/overlays/ — what
    OverlayConfig.videoUrl points at (light leaks, film grain, glitch
    textures, etc. bundled with a template). render.py reads the same
    file straight off disk via registry.resolve_overlay_path — this
    route is what the browser/preview uses."""
    path = OVERLAYS_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Overlay video not found")
    return FileResponse(path)


@router.post("/templates/reload")
def reload_template_library():
    """Re-scans templates/library/*.json without restarting the API —
    the last step of 'drop a JSON file in the folder, it appears in the
    library' for a server that's already running."""
    templates = reload_templates()
    return {"count": len(templates), "templates": [t.id for t in templates]}


class ApplyTemplateBody(BaseModel):
    templateId: str
    regenerateCaptions: bool = True


@router.post("/projects/{project_id}/apply-template")
def apply_template(project_id: str, body: ApplyTemplateBody):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    template = get_template(body.templateId)
    if not template:
        raise HTTPException(404, f"Unknown template '{body.templateId}'")

    width, height = template.dimensions()
    project["timeline"]["project"]["width"] = width
    project["timeline"]["project"]["height"] = height
    project["templateId"] = template.id

    transcript = project.get("transcript")
    if body.regenerateCaptions and transcript and transcript.get("words"):
        items = generate_captions_from_style(transcript["words"], template.caption)
        caption_track = next(t for t in project["timeline"]["tracks"] if t["type"] == "caption")
        caption_track["items"] = items

    # B-roll style prefs are stored (not force-applied to existing items) so
    # the frontend's "Add B-roll" flow can default new items to the
    # template's scale/position without overwriting footage the user
    # already placed.
    project["brollStyle"] = template.broll.model_dump()

    _apply_overlay_video(project, template)

    db.put_project(project_id, project)
    return project


def _find_or_create_track(project: dict, track_type: str) -> dict:
    for t in project["timeline"]["tracks"]:
        if t["type"] == track_type:
            return t
    track = {"id": f"track_{track_type}", "type": track_type, "items": []}
    project["timeline"]["tracks"].append(track)
    return track


def _apply_overlay_video(project: dict, template) -> None:
    """Reflects template.overlay (enabled/blendMode/opacity/videoUrl) onto
    the timeline as a single full-duration item on an 'overlay' track.
    Without this step, overlay config just sits in the template JSON and
    render.py has nothing to composite — see render.py's
    _apply_overlay_video for the ffmpeg side of this same feature."""
    overlay_track = _find_or_create_track(project, "overlay")

    if not (template.overlay.enabled and template.overlayVideoUrl):
        overlay_track["items"] = [it for it in overlay_track["items"] if it.get("templateId") != template.id]
        return

    duration = project["timeline"]["project"].get("duration") or 0
    overlay_track["items"] = [
        {
            "id": f"overlay_{template.id}",
            "type": "overlay",
            "assetId": None,
            "sourceUrl": template.overlayVideoUrl,
            "start": 0,
            "duration": duration,
            "sourceStart": 0,
            "transform": {"x": 0, "y": 0, "scale": 1, "rotation": 0},
            "opacity": template.overlay.opacity,
            "zIndex": 200,
            "blendMode": template.overlay.blendMode,
            "templateId": template.id,
        }
    ]
