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
from pydantic import BaseModel

from .. import db
from ..caption_templates import generate_captions_from_style
from ..templates import list_templates, get_template

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

    db.put_project(project_id, project)
    return project
