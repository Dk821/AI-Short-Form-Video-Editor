from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db
from ..caption_templates import CAPTION_TEMPLATES, generate_caption_items

router = APIRouter(prefix="/api", tags=["captions"])


@router.get("/caption-templates")
def list_caption_templates():
    return [{"id": tid, **meta} for tid, meta in CAPTION_TEMPLATES.items()]


class GenerateCaptionsBody(BaseModel):
    templateId: str
    wordsPerCaption: Optional[int] = None
    replaceExisting: bool = True


@router.post("/projects/{project_id}/captions/generate")
def generate_captions(project_id: str, body: GenerateCaptionsBody):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    transcript = project.get("transcript")
    if not transcript or not transcript.get("words"):
        raise HTTPException(400, "No transcript yet — call /transcribe first")

    try:
        items = generate_caption_items(transcript["words"], body.templateId, body.wordsPerCaption)
    except ValueError as e:
        raise HTTPException(400, str(e))

    caption_track = next(t for t in project["timeline"]["tracks"] if t["type"] == "caption")
    caption_track["items"] = items if body.replaceExisting else caption_track["items"] + items

    db.put_project(project_id, project)
    return project["timeline"]
