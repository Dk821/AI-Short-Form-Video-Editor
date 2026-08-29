from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db
from ..caption_templates import CAPTION_TEMPLATES, generate_caption_items
from ..stress_words import detect_stress_word_indices

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


class StressHighlightBody(BaseModel):
    enabled: bool
    maxWordsPerLine: Optional[int] = None


@router.post("/projects/{project_id}/captions/stress-highlight")
def set_stress_highlight(project_id: str, body: StressHighlightBody):
    """Turns "AI Stress Text Highlighter" on/off. On: runs
    detect_stress_word_indices() over every current caption line and
    stores the result on that line's item. Off: clears it on every line —
    the style fields (stressColor, stressFontFamily, ...) are left exactly
    as they are either way, since those are edited independently via the
    normal PUT /timeline save (Sidebar.jsx's StressHighlightModal calls
    updateAllCaptions, the same bulk-write path the base caption style
    already uses), so turning this back on needs no re-configuration."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    caption_track = next((t for t in project["timeline"]["tracks"] if t["type"] == "caption"), None)
    if not caption_track:
        raise HTTPException(400, "No captions yet — generate captions first")

    max_words = body.maxWordsPerLine or 2
    for item in caption_track["items"]:
        if body.enabled:
            item["stressWordIndices"] = detect_stress_word_indices(item.get("text") or "", max_words)
        else:
            item["stressWordIndices"] = None

    db.put_project(project_id, project)
    return project["timeline"]
