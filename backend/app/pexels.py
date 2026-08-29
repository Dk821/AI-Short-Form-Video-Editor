"""
Pexels stock-video AND stock-photo integration (Milestone 3, B-roll;
extended for the manual B-roll Library panel's Image Search / Video
Search tabs).

Three ways this gets used now:
  1. Auto-edit (ai_edit.py) — a keyword is suggested, we search + download
     the single best VIDEO match automatically. See `fetch_broll_asset`.
  2. The B-roll Library panel (routers/broll.py), Video Search tab — the
     user types a query, browses real thumbnails, and picks one. That's
     `search_broll`/`trending_broll` (search only, no download) +
     `download_broll_asset` (download only the one the user clicked).
  3. The same panel's Image Search tab — the photo equivalents:
     `search_broll_images`/`trending_broll_images` +
     `download_broll_image_asset`.

Everything here is best-effort: a missing key, a failed search, or a bad
download returns None/[] and the caller degrades gracefully rather than
failing the whole request.
"""
from __future__ import annotations

import os
import re
from typing import Optional

import requests

from .render import probe_dimensions, probe_duration
from .storage import save_stream

PEXELS_SEARCH_URL = "https://api.pexels.com/videos/search"
PEXELS_POPULAR_URL = "https://api.pexels.com/videos/popular"
PEXELS_PHOTO_SEARCH_URL = "https://api.pexels.com/v1/search"
PEXELS_PHOTO_CURATED_URL = "https://api.pexels.com/v1/curated"
PEXELS_API_KEY = os.environ.get("PEXELS_API_KEY", "")
PEXELS_MAX_VIDEO_HEIGHT = 1920  # cap: the renderer overlays broll at half width, so 1080p is plenty


def _pick_best_mp4(video: dict) -> Optional[dict]:
    """Pick the highest-res portrait direct-MP4 link for one Pexels video,
    plus a smaller one for a cheap in-browser preview thumbnail/loop."""
    best: dict = {}
    smallest: dict = {}
    for f in video.get("video_files", []):
        if f.get("file_type") != "video/mp4":
            continue
        fw, fh = f.get("width") or 0, f.get("height") or 0
        link = f.get("link")
        if fw <= 0 or fh <= 0 or not link or fw > fh:  # portrait only
            continue
        if fh > PEXELS_MAX_VIDEO_HEIGHT:
            continue
        if not best or fh > best["height"]:
            best = {"link": link, "height": fh, "width": fw}
        if not smallest or fh < smallest["height"]:
            smallest = {"link": link, "height": fh, "width": fw}
    if not best:
        return None
    return {"download": best["link"], "preview": smallest.get("link", best["link"]),
            "width": best["width"], "height": best["height"]}


def _slugify(keyword: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", keyword.lower()).strip("-")
    return slug or "broll"


def _video_card(v: dict) -> Optional[dict]:
    files = _pick_best_mp4(v)
    if not files:
        return None
    return {
        "id": f"pexels_video_{v['id']}",
        "kind": "video",
        "thumbnail": v.get("image"),
        "previewUrl": files["preview"],
        "downloadUrl": files["download"],
        "duration": v.get("duration"),
        "width": files["width"],
        "height": files["height"],
        "source": "pexels",
    }


def search_broll(query: str, page: int = 1, per_page: int = 12) -> tuple[list[dict], int]:
    """Search-only (no download) — powers the Library panel's Video Search
    tab. Returns (cards, total_results) so the UI can paginate."""
    if not PEXELS_API_KEY:
        return [], 0
    try:
        resp = requests.get(
            PEXELS_SEARCH_URL,
            params={"query": query, "orientation": "portrait", "per_page": per_page, "page": page},
            headers={"Authorization": PEXELS_API_KEY},
            timeout=20,
        )
        resp.raise_for_status()
        body = resp.json()
        videos = body.get("videos", [])
        total = body.get("total_results", len(videos))
    except Exception:
        return [], 0

    cards = [c for v in videos if (c := _video_card(v))]
    return cards, total


def trending_broll(per_page: int = 12, page: int = 1) -> tuple[list[dict], int]:
    """Pexels' 'popular' feed — powers the Video Search tab's default
    (empty-query) results."""
    if not PEXELS_API_KEY:
        return [], 0
    try:
        resp = requests.get(
            PEXELS_POPULAR_URL,
            params={"per_page": per_page, "page": page},
            headers={"Authorization": PEXELS_API_KEY},
            timeout=20,
        )
        resp.raise_for_status()
        body = resp.json()
        videos = body.get("videos", [])
        total = body.get("total_results", len(videos))
    except Exception:
        return [], 0

    cards = [c for v in videos if (c := _video_card(v))]
    return cards, total


def download_broll_asset(download_url: str, label: str = "broll") -> Optional[dict]:
    """Download a specific clip the user picked in the Library panel and
    return an asset dict shaped like the upload router's response."""
    try:
        dl = requests.get(download_url, stream=True, timeout=90)
        dl.raise_for_status()
    except Exception:
        return None

    asset_id, stored_filename, dest = save_stream(dl.raw, ".mp4")
    return {
        "id": asset_id,
        "kind": "video",
        "filename": f"{_slugify(label)}-pexels.mp4",
        "url": dest,
        "servedPath": f"/api/uploads/{stored_filename}",
        "duration": probe_duration(dest),
        "width": probe_dimensions(dest)[0],
        "height": probe_dimensions(dest)[1],
    }


def fetch_broll_asset(keyword: str) -> Optional[dict]:
    """Auto-edit path: search + download the single best VIDEO match for
    `keyword` in one call. Returns None on any failure."""
    results, _total = search_broll(keyword, per_page=5)
    if not results:
        return None
    return download_broll_asset(results[0]["downloadUrl"], keyword)


# ---------------------------------------------------------------------
# Photos (Image Search tab) — same shape/contract as the video functions
# above, against Pexels' separate Photos API.
# ---------------------------------------------------------------------

def _pick_best_photo(photo: dict) -> Optional[dict]:
    """Pick a full-res download link and a small preview link for one
    Pexels photo. Unlike video_files, Pexels photo `src` variants are
    pre-sized named crops rather than a list to scan — `original` is the
    true full-resolution source, `medium` a cheap preview thumbnail."""
    src = photo.get("src") or {}
    original = src.get("original") or src.get("large2x") or src.get("large")
    if not original:
        return None
    preview = src.get("medium") or src.get("small") or original
    return {
        "download": original,
        "preview": preview,
        "width": photo.get("width") or 0,
        "height": photo.get("height") or 0,
    }


def _photo_card(p: dict) -> Optional[dict]:
    files = _pick_best_photo(p)
    if not files:
        return None
    return {
        "id": f"pexels_photo_{p['id']}",
        "kind": "image",
        "thumbnail": files["preview"],
        "previewUrl": files["preview"],
        "downloadUrl": files["download"],
        "duration": None,
        "width": files["width"],
        "height": files["height"],
        "source": "pexels",
    }


def search_broll_images(query: str, page: int = 1, per_page: int = 12) -> tuple[list[dict], int]:
    """Search-only (no download) — powers the Library panel's Image
    Search tab. Returns (cards, total_results)."""
    if not PEXELS_API_KEY:
        return [], 0
    try:
        resp = requests.get(
            PEXELS_PHOTO_SEARCH_URL,
            params={"query": query, "orientation": "portrait", "per_page": per_page, "page": page},
            headers={"Authorization": PEXELS_API_KEY},
            timeout=20,
        )
        resp.raise_for_status()
        body = resp.json()
        photos = body.get("photos", [])
        total = body.get("total_results", len(photos))
    except Exception:
        return [], 0

    cards = [c for p in photos if (c := _photo_card(p))]
    return cards, total


def trending_broll_images(per_page: int = 12, page: int = 1) -> tuple[list[dict], int]:
    """Pexels' 'curated' photo feed — powers the Image Search tab's
    default (empty-query) results."""
    if not PEXELS_API_KEY:
        return [], 0
    try:
        resp = requests.get(
            PEXELS_PHOTO_CURATED_URL,
            params={"per_page": per_page, "page": page},
            headers={"Authorization": PEXELS_API_KEY},
            timeout=20,
        )
        resp.raise_for_status()
        body = resp.json()
        photos = body.get("photos", [])
        total = body.get("total_results", len(photos))
    except Exception:
        return [], 0

    cards = [c for p in photos if (c := _photo_card(p))]
    return cards, total


def download_broll_image_asset(download_url: str, label: str = "broll") -> Optional[dict]:
    """Download a specific photo the user picked in the Image Search tab
    and return an asset dict shaped like the upload router's response
    (kind='image' — no `duration`, matching what upload.py returns for an
    uploaded still image)."""
    try:
        dl = requests.get(download_url, stream=True, timeout=60)
        dl.raise_for_status()
    except Exception:
        return None

    # Pexels photo download URLs are plain https links to the real file
    # (e.g. .../photos/123/pexels-photo-123.jpeg), so the URL's own
    # extension is trustworthy — fall back to .jpg on anything unexpected
    # rather than guessing from Content-Type, which Pexels doesn't always
    # set precisely for these direct-file links.
    ext_match = re.search(r"\.(jpe?g|png|webp)(?:\?|$)", download_url, re.IGNORECASE)
    ext = f".{ext_match.group(1).lower()}" if ext_match else ".jpg"

    asset_id, stored_filename, dest = save_stream(dl.raw, ext)
    width, height = probe_dimensions(dest)
    return {
        "id": asset_id,
        "kind": "image",
        "filename": f"{_slugify(label)}-pexels{ext}",
        "url": dest,
        "servedPath": f"/api/uploads/{stored_filename}",
        "duration": None,
        "width": width,
        "height": height,
    }
