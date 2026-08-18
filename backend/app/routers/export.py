import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

from .. import db
from ..models import Timeline, Asset
from ..render import render_timeline
from ..storage import render_path_for

router = APIRouter(prefix="/api", tags=["export"])


def _run_render(job_id: str, project_id: str):
    job = db.get_job(job_id)
    job["status"] = "processing"
    db.put_job(job_id, job)

    try:
        project = db.get_project(project_id)
        timeline = Timeline(**project["timeline"])
        assets = {a["id"]: Asset(**a) for a in project["assets"]}
        output_filename = f"{job_id}.mp4"
        output_path = render_path_for(output_filename)

        render_timeline(timeline, assets, output_path)

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
def start_export(project_id: str, background_tasks: BackgroundTasks):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    job_id = uuid.uuid4().hex
    job = {"id": job_id, "projectId": project_id, "status": "queued", "progress": 0,
           "outputUrl": None, "error": None}
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
    return FileResponse(path, media_type="video/mp4", filename=filename)
