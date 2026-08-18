import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db
from ..models import Project, Timeline, ProjectMeta
from ..templates import get_template

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("")
def create_project(
    name: str = "Untitled project",
    width: int = 1080,
    height: int = 1920,
    fps: int = 30,
    templateId: str | None = None,
):
    project_id = uuid.uuid4().hex

    template = get_template(templateId) if templateId else None
    if templateId and not template:
        raise HTTPException(404, f"Unknown template '{templateId}'")
    if template:
        width, height = template.dimensions()

    project = Project(
        id=project_id,
        name=name,
        templateId=template.id if template else None,
        createdAt=datetime.now(timezone.utc).isoformat(),
        timeline=Timeline(
            project=ProjectMeta(id=project_id, width=width, height=height, fps=fps, duration=0),
            tracks=[
                {"id": "track_video", "type": "video", "items": []},
                {"id": "track_broll", "type": "broll", "items": []},
                {"id": "track_caption", "type": "caption", "items": []},
                {"id": "track_audio", "type": "audio", "items": []},
                {"id": "track_sfx", "type": "sfx", "items": []},
                {"id": "track_zoom", "type": "zoom", "items": []},
            ],
        ),
        assets=[],
    )
    db.put_project(project_id, project.model_dump())
    return project


@router.get("")
def list_projects():
    projects = db.list_projects()
    return sorted(projects, key=lambda p: p.get("createdAt") or "", reverse=True)


@router.get("/{project_id}")
def get_project(project_id: str):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


class RenameBody(BaseModel):
    name: str


@router.patch("/{project_id}")
def rename_project(project_id: str, body: RenameBody):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    project["name"] = body.name.strip() or project["name"]
    db.put_project(project_id, project)
    return project


@router.delete("/{project_id}")
def delete_project(project_id: str):
    if not db.get_project(project_id):
        raise HTTPException(404, "Project not found")
    db.delete_project(project_id)
    return {"deleted": True}


@router.put("/{project_id}/timeline")
def save_timeline(project_id: str, timeline: Timeline):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    project["timeline"] = timeline.model_dump()
    db.put_project(project_id, project)
    return project
