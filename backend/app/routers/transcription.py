from fastapi import APIRouter, HTTPException

from .. import db
from ..transcribe import transcribe_words

router = APIRouter(prefix="/api/projects", tags=["transcription"])


@router.post("/{project_id}/transcribe")
def transcribe(project_id: str, assetId: str, language: str | None = None):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    asset = next((a for a in project["assets"] if a["id"] == assetId), None)
    if not asset:
        raise HTTPException(404, "Asset not found")
    if asset["kind"] not in ("video", "audio"):
        raise HTTPException(400, "Asset must be a video or audio file")

    try:
        words = transcribe_words(asset["url"], language=language)
    except RuntimeError as e:
        raise HTTPException(500, f"Transcription failed: {e}")
    except Exception as e:
        raise HTTPException(502, f"Groq transcription call failed: {e}")

    transcript = {"assetId": assetId, "words": words}
    project["transcript"] = transcript
    db.put_project(project_id, project)
    return transcript


@router.get("/{project_id}/transcript")
def get_transcript(project_id: str):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project.get("transcript")