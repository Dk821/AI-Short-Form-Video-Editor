from fastapi import APIRouter, HTTPException

from .. import db
from ..ai_edit import call_auto_edit, validate_decisions
from ..models import Timeline
from ..pexels import fetch_broll_asset
from ..template_engine import apply_edit_decisions
from ..templates import get_template

router = APIRouter(prefix="/api/projects", tags=["auto-edit"])


@router.post("/{project_id}/auto-edit")
def auto_edit(project_id: str):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    transcript = project.get("transcript")
    words = transcript.get("words") if transcript else None
    if not words:
        raise HTTPException(400, "No transcript yet — call /transcribe first")

    timeline = Timeline(**project["timeline"])
    duration = timeline.project.duration or words[-1]["end"]

    try:
        raw = call_auto_edit(words, duration)
    except RuntimeError as e:
        raise HTTPException(400, str(e))  # missing API key
    except Exception as e:
        raise HTTPException(502, f"AI auto-edit call failed: {e}")

    try:
        decisions = validate_decisions(raw, duration)
    except ValueError as e:
        raise HTTPException(502, f"AI auto-edit returned an unusable response: {e}")

    # Milestone 3 B-roll: resolve each suggested keyword to real footage.
    # Best-effort — a missing PEXELS_API_KEY, empty search, or failed
    # download leaves the item as a keyword-only suggestion (the renderer
    # skips those), so a Pexels hiccup never fails the whole auto-edit.
    broll_assets: dict[str, str] = {}
    for m in decisions.moments:
        if m.type != "broll_suggestion" or not (m.keyword and m.keyword.strip()):
            continue
        if m.keyword in broll_assets:
            continue
        asset = fetch_broll_asset(m.keyword)
        if asset:
            broll_assets[m.keyword] = asset["id"]
            project["assets"].append(asset)

    # Pass the active template so the engine can apply the correct
    # broll layout/scale/reveal and zoom scale range (template decides HOW).
    template_id = project.get("templateId")
    template = get_template(template_id) if template_id else None

    timeline = apply_edit_decisions(
        timeline, decisions, broll_assets=broll_assets, template=template
    )
    project["timeline"] = timeline.model_dump()
    db.put_project(project_id, project)

    return {
        "decisions": decisions.model_dump(),
        "timeline": project["timeline"],
        "brollDownloaded": len(broll_assets),
    }
