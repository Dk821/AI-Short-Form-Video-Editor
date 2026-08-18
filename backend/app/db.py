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

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "app", "db.json")

_lock = threading.Lock()


def _load() -> Dict[str, Any]:
    if not os.path.exists(DB_PATH):
        return {"projects": {}, "jobs": {}}
    with open(DB_PATH, "r") as f:
        return json.load(f)


def _save(data: Dict[str, Any]) -> None:
    with open(DB_PATH, "w") as f:
        json.dump(data, f, indent=2)


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


def delete_project(project_id: str) -> None:
    with _lock:
        data = _load()
        data["projects"].pop(project_id, None)
        _save(data)
