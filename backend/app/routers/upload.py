import mimetypes

from fastapi import APIRouter, HTTPException, UploadFile

from .. import db
from ..storage import save_upload
from ..render import probe_duration, probe_dimensions

router = APIRouter(prefix="/api/projects", tags=["upload"])


def _kind_for(content_type: str | None, filename: str) -> str:
    ct = content_type or mimetypes.guess_type(filename)[0] or ""
    if ct.startswith("video"):
        return "video"
    if ct.startswith("image"):
        return "image"
    if ct.startswith("audio"):
        return "audio"
    raise HTTPException(400, f"Unsupported file type: {ct or filename}")


@router.post("/{project_id}/upload")
async def upload_asset(project_id: str, file: UploadFile):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    kind = _kind_for(file.content_type, file.filename)
    asset_id, stored_filename, path = save_upload(file.file, file.filename)

    duration = None
    width = height = None
    if kind in ("video", "audio"):
        duration = probe_duration(path)
    if kind in ("video", "image"):
        width, height = probe_dimensions(path)

    asset = {
        "id": asset_id,
        "kind": kind,
        "filename": file.filename,
        "url": path,  # absolute local path, used by the ffmpeg renderer
        "servedPath": f"/api/uploads/{stored_filename}",  # used by the browser preview
        "duration": duration,
        "width": width,
        "height": height,
    }
    project["assets"].append(asset)
    db.put_project(project_id, project)
    return asset
