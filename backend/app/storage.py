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

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(BASE_DIR, "app", "uploads")
RENDERS_DIR = os.path.join(BASE_DIR, "app", "renders")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(RENDERS_DIR, exist_ok=True)


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
    return os.path.join(UPLOADS_DIR, filename)


def render_path_for(filename: str) -> str:
    return os.path.join(RENDERS_DIR, filename)
