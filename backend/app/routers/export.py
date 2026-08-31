import os
import threading
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse

from .. import db, shotstack, shotstack_timeline
from ..models import Timeline, Asset
from ..render import render_timeline
from ..storage import render_path_for

router = APIRouter(prefix="/api", tags=["export"])

# The export panel's options — see render_timeline's `fmt`/`quality`/
# `frame_rate` handling for what each actually does differently.
EXPORT_FORMATS = {"mp4", "webm", "gif"}
EXPORT_QUALITIES = {"draft", "standard", "high"}
_MEDIA_TYPES = {"mp4": "video/mp4", "webm": "video/webm", "gif": "image/gif"}

# Which renderer runs a job. "ffmpeg" is the default and is completely
# unchanged; "shotstack" renders in the cloud instead. Both write the same
# job record shape, so the frontend polls one endpoint either way.
EXPORT_ENGINES = {"ffmpeg", "shotstack"}


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


def _fail(job_id: str, message: str, stage: str = "render", detail=None):
    job = db.get_job(job_id) or {"id": job_id}
    job["status"] = "failed"
    job["error"] = message
    job["errorStage"] = stage
    if detail is not None:
        job["errorDetail"] = str(detail)[:2000]
    db.put_job(job_id, job)


def _run_shotstack(job_id: str, project_id: str):
    """Validate -> upload assets -> submit -> track, updating the same job
    record shape the FFmpeg path uses so the frontend needs no special case.

    Every stage sets `progress` and a human-readable `stage`, because a
    cloud render has meaningful phases (uploading vs queued vs rendering)
    that a local ffmpeg run does not.
    """
    def progress(pct: int, stage: str):
        job = db.get_job(job_id)
        if not job:
            return
        job["progress"] = pct
        job["stage"] = stage
        job["status"] = "processing"
        db.put_job(job_id, job)

    try:
        shotstack.require_configured()
        progress(2, "Preparing timeline")

        project = db.get_project(project_id)
        timeline = Timeline(**project["timeline"])
        assets = {a["id"]: Asset(**a) for a in project["assets"]}

        # Validate BEFORE spending an upload or a render credit.
        errors, warnings = shotstack_timeline.validate(timeline, assets)
        if errors:
            _fail(
                job_id,
                "This timeline can't be sent to Shotstack:\n- " + "\n- ".join(errors),
                stage="validation",
            )
            return
        if warnings:
            job = db.get_job(job_id)
            job["warnings"] = warnings
            db.put_job(job_id, job)

        # Shotstack fetches assets over public HTTPS, so local files have to
        # be ingested first. Cached per file, so re-exports skip this.
        asset_ids = shotstack_timeline.collect_asset_ids(timeline)
        asset_urls = {}
        for i, asset_id in enumerate(asset_ids):
            asset = assets.get(asset_id)
            if not asset:
                continue
            progress(5 + int(35 * (i / max(1, len(asset_ids)))),
                     f"Uploading media {i + 1} of {len(asset_ids)}")
            asset_urls[asset_id] = shotstack.upload_asset(asset.url)

        # Resolve caption fonts to real, current URLs. Shotstack fetches
        # every font itself and one bad URL fails the whole render, so this
        # is deliberately non-fatal: unresolved families are dropped and the
        # render proceeds with a substituted typeface.
        progress(42, "Resolving fonts")
        font_urls, missing_fonts = {}, []
        try:
            font_urls, missing_fonts = shotstack.resolve_font_urls(
                shotstack_timeline.collect_font_families(timeline)
            )
        except Exception as e:
            missing_fonts = shotstack_timeline.collect_font_families(timeline)
            print(f"[shotstack] font resolution failed ({e}); rendering with default fonts")

        progress(45, "Submitting to Shotstack")
        callback = None
        if shotstack.SHOTSTACK_CALLBACK_BASE:
            callback = f"{shotstack.SHOTSTACK_CALLBACK_BASE}/api/shotstack/webhook"
        result = shotstack_timeline.build_edit(
            timeline, assets, asset_urls, callback=callback, font_urls=font_urls
        )

        render_id = shotstack.submit_render(result.edit)
        job = db.get_job(job_id)
        job["renderId"] = render_id
        job["stage"] = "Queued at Shotstack"
        job["progress"] = 50
        if result.warnings:
            job["warnings"] = list(dict.fromkeys((job.get("warnings") or []) + result.warnings))
        db.put_job(job_id, job)

        # Poll even when a webhook is registered: the webhook is an
        # optimisation, and a callback that never arrives (no public URL,
        # firewall, tunnel dropped) must not leave the job stuck forever.
        _poll_shotstack(job_id, render_id)

    except shotstack.ShotstackError as e:
        _fail(job_id, e.message, stage=e.stage, detail=e.detail)
    except Exception as e:
        _fail(job_id, f"Shotstack export failed: {e}", stage="render")


_PROGRESS_BY_STATUS = {
    "queued": (55, "Queued at Shotstack"),
    "fetching": (62, "Shotstack is fetching your media"),
    "rendering": (78, "Rendering"),
    "saving": (94, "Saving the finished video"),
}


def _poll_shotstack(job_id: str, render_id: str, attempts: int = 450, delay: float = 4.0):
    import time

    for _ in range(attempts):
        job = db.get_job(job_id)
        if not job or job.get("status") in ("done", "failed"):
            return  # a webhook already finished it
        try:
            info = shotstack.get_render_status(render_id)
        except shotstack.ShotstackError as e:
            _fail(job_id, e.message, stage=e.stage, detail=e.detail)
            return

        status = info["status"]
        if status == "done":
            _complete(job_id, info.get("url"), info.get("poster"), info.get("thumbnail"))
            return
        if status == "failed":
            _fail(
                job_id,
                "Shotstack could not render this video: " + (info.get("error") or "no reason given"),
                stage="render", detail=info.get("raw"),
            )
            return
        pct, stage = _PROGRESS_BY_STATUS.get(status, (60, f"Shotstack: {status}"))
        job = db.get_job(job_id)
        if job:
            job["progress"], job["stage"], job["status"] = pct, stage, "processing"
            db.put_job(job_id, job)
        time.sleep(delay)

    _fail(job_id, "Timed out waiting for Shotstack to finish this render.", stage="render")


def _complete(job_id: str, url: Optional[str], poster=None, thumbnail=None):
    job = db.get_job(job_id)
    if not job:
        return
    if not url:
        _fail(job_id, "Shotstack reported the render as done but returned no video URL.", stage="render")
        return
    job["status"] = "done"
    job["progress"] = 100
    job["stage"] = "Completed"
    # Shotstack hosts the MP4 itself, so this is an absolute URL rather than
    # the /api/download/... path the FFmpeg engine produces. The frontend
    # treats both the same way — it just follows outputUrl.
    job["outputUrl"] = url
    job["hosted"] = True
    if poster:
        job["poster"] = poster
    if thumbnail:
        job["thumbnail"] = thumbnail
    db.put_job(job_id, job)


@router.post("/projects/{project_id}/export")
def start_export(
    project_id: str,
    background_tasks: BackgroundTasks,
    format: str = "mp4",
    quality: str = "standard",
    frameRate: Optional[int] = None,
    engine: str = "ffmpeg",
):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if engine not in EXPORT_ENGINES:
        raise HTTPException(400, f"Unsupported export engine '{engine}'. Choose one of: {', '.join(sorted(EXPORT_ENGINES))}")
    if format not in EXPORT_FORMATS:
        raise HTTPException(400, f"Unsupported export format '{format}'. Choose one of: {', '.join(sorted(EXPORT_FORMATS))}")
    if quality not in EXPORT_QUALITIES:
        raise HTTPException(400, f"Unsupported export quality '{quality}'. Choose one of: {', '.join(sorted(EXPORT_QUALITIES))}")
    if frameRate is not None and not (1 <= frameRate <= 120):
        raise HTTPException(400, "frameRate must be between 1 and 120")

    if engine == "shotstack":
        if not shotstack.is_configured():
            raise HTTPException(
                400,
                "SHOTSTACK_API_KEY is not set in backend/.env, so the Shotstack engine is "
                "unavailable. Add the key and restart the backend, or export with FFmpeg.",
            )
        if format != "mp4":
            raise HTTPException(400, "The Shotstack engine renders MP4 only. Use the FFmpeg engine for WebM or GIF.")

    job_id = uuid.uuid4().hex
    job = {"id": job_id, "projectId": project_id, "status": "queued", "format": format,
           "quality": quality, "frameRate": frameRate, "engine": engine,
           "progress": 0, "outputUrl": None, "error": None}
    db.put_job(job_id, job)

    # NOTE: this runs in-process. The doc's production design (Redis +
    # Celery/dedicated render workers) is the drop-in replacement — swap
    # this call for `render_task.delay(job_id, project_id)` and nothing
    # else in the API layer needs to change, because the job record
    # shape (status/progress/outputUrl) is already queue-shaped.
    background_tasks.add_task(
        _run_shotstack if engine == "shotstack" else _run_render, job_id, project_id
    )
    return job


@router.get("/export/engines")
def list_engines():
    """What the export panel can offer. FFmpeg is always available; the
    Shotstack option is only enabled once a key is configured."""
    return {
        "engines": [
            {"id": "ffmpeg", "label": "FFmpeg (local)", "available": True,
             "formats": sorted(EXPORT_FORMATS),
             "description": "Renders on this machine. Supports every format and effect."},
            {"id": "shotstack", "label": "Shotstack (cloud)", "available": shotstack.is_configured(),
             "formats": ["mp4"],
             "description": "Renders in the cloud. MP4 only; media is uploaded to Shotstack first."
                            if shotstack.is_configured() else
                            "Set SHOTSTACK_API_KEY in backend/.env to enable cloud rendering."},
        ],
        "default": "ffmpeg",
    }


@router.post("/projects/{project_id}/export/preflight")
def export_preflight(project_id: str):
    """Run the Shotstack validation without submitting anything.

    Lets the UI warn about unsupported constructs (split layouts, speaker
    bubbles, animated zooms) before the user spends a render."""
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    timeline = Timeline(**project["timeline"])
    assets = {a["id"]: Asset(**a) for a in project["assets"]}
    errors, warnings = shotstack_timeline.validate(timeline, assets)
    return {"ok": not errors, "errors": errors, "warnings": warnings,
            "configured": shotstack.is_configured()}


@router.post("/shotstack/webhook")
async def shotstack_webhook(request: Request):
    """Shotstack POSTs here when a render finishes, if SHOTSTACK_CALLBACK_BASE
    is set to a publicly reachable URL.

    Must answer fast (Shotstack times out at ~10s) and must never trust the
    payload blindly: the render id is matched against a job this server
    actually started, and the authoritative status is what the poller and
    this handler agree on — a spoofed callback can at worst mark a render
    the server already knows about."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(400, "Webhook body was not JSON")

    render_id = payload.get("id")
    status = (payload.get("status") or "").lower()
    if not render_id:
        raise HTTPException(400, "Webhook payload had no render id")

    job_id = None
    for candidate in db.list_jobs():
        if candidate.get("renderId") == render_id:
            job_id = candidate["id"]
            break
    if not job_id:
        # Unknown render (or a job from a previous run) — acknowledge so
        # Shotstack stops retrying, but change nothing.
        return {"received": True, "matched": False}

    if status == "done":
        _complete(job_id, payload.get("url"))
    elif status == "failed":
        _fail(job_id, "Shotstack could not render this video: "
              + (payload.get("error") or "no reason given"), stage="render", detail=payload)
    return {"received": True, "matched": True}


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
