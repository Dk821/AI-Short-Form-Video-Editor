"""
Local-disk storage.

The architecture doc specifies Local disk for dev, Cloudflare R2 / S3 for
prod, with the same upload/serve contract either way. This module is the
swappable point: replace the two functions below with S3-backed versions
(e.g. boto3 presigned URLs) to move to production storage without touching
any router or render code.
"""
import os
import shutil
import uuid

from . import paths

# Where these live is decided by paths.py, not by this file's location on
# disk: in a packaged Windows build the code sits in a read-only install
# directory and the media has to go under %LOCALAPPDATA% instead. A plain
# dev run still resolves to backend/app/uploads and backend/app/renders.
UPLOADS_DIR = str(paths.UPLOADS_DIR)
RENDERS_DIR = str(paths.RENDERS_DIR)

paths.ensure_dirs()


def _safe_join(directory: str, filename: str) -> str:
    """Join a caller-supplied filename onto one of our storage directories,
    refusing anything that would escape it.

    Filenames reach these helpers from URLs (/api/download/{filename}) and
    from stored records, so '..\\..\\Windows\\System32\\...' has to be
    impossible rather than merely unlikely."""
    name = os.path.basename(str(filename or ""))
    if not name or name in (".", ".."):
        raise ValueError("Invalid filename")
    target = os.path.normpath(os.path.join(directory, name))
    if os.path.commonpath([os.path.abspath(directory), os.path.abspath(target)]) != os.path.abspath(directory):
        raise ValueError("Invalid filename")
    return target


def save_upload(file_obj, original_filename: str) -> tuple[str, str, str]:
    """Save an uploaded file, return (asset_id, stored_filename, absolute_path)."""
    ext = os.path.splitext(original_filename)[1]
    asset_id = uuid.uuid4().hex
    stored_filename = f"{asset_id}{ext}"
    dest = os.path.join(UPLOADS_DIR, stored_filename)
    with open(dest, "wb") as out:
        shutil.copyfileobj(file_obj, out)
    return asset_id, stored_filename, dest


def save_stream(stream, ext: str) -> tuple[str, str, str]:
    """Save a downloaded byte stream (e.g. a Pexels stock clip), return
    (asset_id, stored_filename, absolute_path). Same contract as save_upload."""
    asset_id = uuid.uuid4().hex
    stored_filename = f"{asset_id}{ext}"
    dest = os.path.join(UPLOADS_DIR, stored_filename)
    with open(dest, "wb") as out:
        shutil.copyfileobj(stream, out)
    return asset_id, stored_filename, dest


def asset_path_for(filename: str) -> str:
    return _safe_join(UPLOADS_DIR, filename)


def render_path_for(filename: str) -> str:
    return _safe_join(RENDERS_DIR, filename)


def cover_path_for(project_id: str) -> tuple[str, str]:
    """Absolute path to write a project's cover JPEG to, plus the
    browser-servable URL. Lives in UPLOADS_DIR (already mounted at
    /api/uploads) rather than RENDERS_DIR so it's directly usable as an
    <img src>, not just downloadable — same contract as an asset's
    servedPath. One file per project (fixed name, overwritten on every
    save), so re-picking a cover never leaves the old one behind."""
    filename = f"cover_{project_id}.jpg"
    return os.path.join(UPLOADS_DIR, filename), f"/api/uploads/{filename}"
