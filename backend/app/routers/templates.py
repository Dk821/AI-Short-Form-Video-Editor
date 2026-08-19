"""
Template System (Template System, step 2).

Endpoints:
  GET  /api/templates                       -> full VideoTemplate list (for the picker grid)
  GET  /api/templates/{template_id}         -> one template
  POST /api/projects/{id}/apply-template    -> apply a template to a project:
      - sets the project's aspect ratio (ProjectMeta width/height)
      - regenerates captions from the style bundle IF a transcript exists
      - stores broll style prefs AND zoom style prefs on the project for
        later broll placement / zoom defaults
      - remembers templateId on the project so the editor can show "Applied: X"
  GET  /api/projects/{id}/template-config   -> returns the full VideoTemplate for
      the project's active templateId (frontend reads this to drive UI defaults)

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

    # Zoom style prefs — same pattern as brollStyle. The frontend reads
    # this to initialise the zoom UI and the auto-edit engine uses it to
    # clamp zoom scale to the template's min/max range.
    project["zoomStyle"] = template.zoom.model_dump()

    _apply_overlay_video(project, template)

    db.put_project(project_id, project)
    return project


@router.get("/projects/{project_id}/template-config")
def get_project_template_config(project_id: str):
    """Return the full VideoTemplate for the project's active templateId.
    The frontend calls this to drive UI defaults (caption form values,
    broll picker defaults, zoom panel state) without having to parse the
    entire template list on every render."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    template_id = project.get("templateId")
    if not template_id:
        return None  # 200 + null body — no template applied yet
    template = get_template(template_id)
    if not template:
        return None
    return template.model_dump()


def _find_or_create_track(project: dict, track_type: str) -> dict:
    for t in project["timeline"]["tracks"]:
        if t["type"] == track_type:
            return t
    track = {"id": f"track_{track_type}", "type": track_type, "items": []}
    project["timeline"]["tracks"].append(track)
    return track


def _overlay_burst_windows(duration: float, burst_duration: float = 2.5) -> list[tuple[float, float]]:
    """Where the ambient overlay (light leaks/grain/glitch) should actually
    play: a couple of short 2-3s bursts rather than the whole clip. Running
    it continuously for the full duration is what a "screen" blend overlay
    reads as a distracting filter stuck over everything instead of a
    flourish; real edits use it sparingly.

    - <= 10s of video: one burst, roughly a third of the way in.
    - > 10s: two bursts, spread across the first and second half so they
      don't cluster together.

    Burst windows are clamped to fit inside `duration` and never overlap.
    """
    if duration <= 0:
        return []
    burst_duration = round(min(burst_duration, duration), 2)
    fractions = [0.4] if duration <= 10 else [0.22, 0.68]

    windows: list[tuple[float, float]] = []
    for frac in fractions:
        start = frac * duration - burst_duration / 2
        start = max(0.0, min(start, duration - burst_duration))
        windows.append((round(start, 2), burst_duration))
    return windows


def _apply_overlay_video(project: dict, template) -> None:
    """Reflects template.overlay (enabled/blendMode/opacity/videoUrl) onto
    the timeline as a handful of short-burst items (see
    _overlay_burst_windows) on an 'overlay' track, instead of one item
    spanning the whole video. Without this step, overlay config just sits
    in the template JSON and there's nothing to composite — render.py's
    generic broll/overlay filter-graph loop already scopes each item to its
    own start/duration via `enable='between(t,...)'`, so giving it several
    short items here is all that's needed for both preview and export to
    show it only during those windows."""
    overlay_track = _find_or_create_track(project, "overlay")

    if not (template.overlay.enabled and template.overlayVideoUrl):
        overlay_track["items"] = [it for it in overlay_track["items"] if it.get("templateId") != template.id]
        return

    duration = project["timeline"]["project"].get("duration") or 0
    windows = _overlay_burst_windows(duration)
    overlay_track["items"] = [
        {
            "id": f"overlay_{template.id}_{i}",
            "type": "overlay",
            "assetId": None,
            "sourceUrl": template.overlayVideoUrl,
            "start": start,
            "duration": burst_dur,
            "sourceStart": 0,
            "transform": {"x": 0, "y": 0, "scale": 1, "rotation": 0},
            "opacity": template.overlay.opacity,
            "zIndex": 200,
            "blendMode": template.overlay.blendMode,
            "templateId": template.id,
        }
        for i, (start, burst_dur) in enumerate(windows)
    ]
