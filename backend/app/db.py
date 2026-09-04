"""
Minimal persistence.

The architecture doc specifies PostgreSQL for users/projects/timeline/jobs.
For the MVP this is a single JSON file guarded by a lock, which keeps the
whole app runnable with zero infra. The only rule that matters for a clean
swap later: every read/write goes through the functions below, never
through a raw file open elsewhere in the app.
"""
import json
import os
import threading
from typing import Any, Dict

from . import paths

# The packaged app installs into a read-only directory, so the database
# lives with the rest of the user's data (see paths.py). A dev run still
# uses backend/app/db.json.
DB_PATH = str(paths.DB_PATH)

_lock = threading.Lock()


def _load() -> Dict[str, Any]:
    if not os.path.exists(DB_PATH):
        return {"projects": {}, "jobs": {}}
    with open(DB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(data: Dict[str, Any]) -> None:
    # Write-then-rename: a crash or a power cut mid-write would otherwise
    # leave a truncated db.json and lose every project. Explicit UTF-8
    # because project names can contain any character the user typed and
    # Windows' default cp1252 would raise on most of them.
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    tmp = DB_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, DB_PATH)


def get_project(project_id: str):
    with _lock:
        return _load()["projects"].get(project_id)


def put_project(project_id: str, project: dict):
    with _lock:
        data = _load()
        data["projects"][project_id] = project
        _save(data)


def list_projects():
    with _lock:
        return list(_load()["projects"].values())


def get_job(job_id: str):
    with _lock:
        return _load()["jobs"].get(job_id)


def put_job(job_id: str, job: dict):
    with _lock:
        data = _load()
        data["jobs"][job_id] = job
        _save(data)


def list_jobs():
    """All job records — the local FFmpeg export queue (see
    routers/export.py)."""
    with _lock:
        return list(_load()["jobs"].values())


def delete_project(project_id: str) -> None:
    with _lock:
        data = _load()
        data["projects"].pop(project_id, None)
        _save(data)
