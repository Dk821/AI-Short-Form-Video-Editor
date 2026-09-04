import os
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

from .. import db
from ..models import Timeline, Asset
from ..render import render_timeline
from ..storage import render_path_for

router = APIRouter(prefix="/api", tags=["export"])

# The export panel's options — see render_timeline's `fmt`/`quality`/
# `frame_rate` handling for what each actually does differently.
EXPORT_FORMATS = {"mp4", "webm", "gif"}
EXPORT_QUALITIES = {"draft", "standard", "high"}
_MEDIA_TYPES = {"mp4": "video/mp4", "webm": "video/webm", "gif": "image/gif"}


def _run_render(job_id: str, project_id: str):
    job = db.get_job(job_id)
    job["status"] = "processing"
    db.put_job(job_id, job)

    try:
        project = db.get_project(project_id)
        timeline = Timeline(**project["timeline"])
        assets = {a["id"]: Asset(**a) for a in project["assets"]}
        fmt = job.get("format", "mp4")
        quality = job.get("quality", "standard")
        frame_rate = job.get("frameRate")
        output_filename = f"{job_id}.{fmt}"
        output_path = render_path_for(output_filename)

        render_timeline(timeline, assets, output_path, fmt=fmt, quality=quality, frame_rate=frame_rate)

        job = db.get_job(job_id)
        job["status"] = "done"
        job["progress"] = 100
        job["outputUrl"] = f"/api/download/{output_filename}"
        db.put_job(job_id, job)
    except Exception as e:
        job = db.get_job(job_id)
        job["status"] = "failed"
        job["error"] = str(e)
        db.put_job(job_id, job)


@router.post("/projects/{project_id}/export")
def start_export(
    project_id: str,
    background_tasks: BackgroundTasks,
    format: str = "mp4",
    quality: str = "standard",
    frameRate: Optional[int] = None,
):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if format not in EXPORT_FORMATS:
        raise HTTPException(400, f"Unsupported export format '{format}'. Choose one of: {', '.join(sorted(EXPORT_FORMATS))}")
    if quality not in EXPORT_QUALITIES:
        raise HTTPException(400, f"Unsupported export quality '{quality}'. Choose one of: {', '.join(sorted(EXPORT_QUALITIES))}")
    if frameRate is not None and not (1 <= frameRate <= 120):
        raise HTTPException(400, "frameRate must be between 1 and 120")

    job_id = uuid.uuid4().hex
    job = {"id": job_id, "projectId": project_id, "status": "queued", "format": format,
           "quality": quality, "frameRate": frameRate, "engine": "ffmpeg",
           "progress": 0, "outputUrl": None, "error": None}
    db.put_job(job_id, job)

    # NOTE: this runs in-process. The doc's production design (Redis +
    # Celery/dedicated render workers) is the drop-in replacement — swap
    # this call for `render_task.delay(job_id, project_id)` and nothing
    # else in the API layer needs to change, because the job record
    # shape (status/progress/outputUrl) is already queue-shaped.
    background_tasks.add_task(_run_render, job_id, project_id)
    return job


@router.get("/renders/{job_id}")
def get_export_status(job_id: str):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/download/{filename}")
def download(filename: str):
    path = render_path_for(filename)
    ext = filename.rsplit(".", 1)[-1].lower()
    media_type = _MEDIA_TYPES.get(ext, "application/octet-stream")
    return FileResponse(path, media_type=media_type, filename=filename)
