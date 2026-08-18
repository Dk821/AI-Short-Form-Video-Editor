"""
Pexels stock-video integration (Milestone 3, B-roll; extended for the
manual B-roll Library panel).

Two ways this gets used now:
  1. Auto-edit (ai_edit.py) — a keyword is suggested, we search + download
     the single best match automatically. See `fetch_broll_asset`.
  2. The B-roll Library panel (routers/broll.py) — the user types a query,
     browses real thumbnails, and picks one. That's `search_broll`
     (search only, no download) + `download_broll_asset` (download only
     the one the user clicked).

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


def search_broll(query: str, page: int = 1, per_page: int = 12) -> list[dict]:
    """Search-only (no download) — powers the B-roll Library panel's grid.
    Returns lightweight cards the frontend can render immediately."""
    if not PEXELS_API_KEY:
        return []
    try:
        resp = requests.get(
            PEXELS_SEARCH_URL,
            params={"query": query, "orientation": "portrait", "per_page": per_page, "page": page},
            headers={"Authorization": PEXELS_API_KEY},
            timeout=20,
        )
        resp.raise_for_status()
        videos = resp.json().get("videos", [])
    except Exception:
        return []

    cards = []
    for v in videos:
        files = _pick_best_mp4(v)
        if not files:
            continue
        cards.append({
            "id": str(v["id"]),
            "thumbnail": v.get("image"),
            "previewUrl": files["preview"],
            "downloadUrl": files["download"],
            "duration": v.get("duration"),
            "width": files["width"],
            "height": files["height"],
            "source": "pexels",
        })
    return cards


def trending_broll(per_page: int = 12, page: int = 1) -> list[dict]:
    """Pexels' 'popular' feed — powers the Library panel's default/'Trendy' tab."""
    if not PEXELS_API_KEY:
        return []
    try:
        resp = requests.get(
            PEXELS_POPULAR_URL,
            params={"per_page": per_page, "page": page},
            headers={"Authorization": PEXELS_API_KEY},
            timeout=20,
        )
        resp.raise_for_status()
        videos = resp.json().get("videos", [])
    except Exception:
        return []

    cards = []
    for v in videos:
        files = _pick_best_mp4(v)
        if not files:
            continue
        cards.append({
            "id": str(v["id"]),
            "thumbnail": v.get("image"),
            "previewUrl": files["preview"],
            "downloadUrl": files["download"],
            "duration": v.get("duration"),
            "width": files["width"],
            "height": files["height"],
            "source": "pexels",
        })
    return cards


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
    """Auto-edit path: search + download the single best match for
    `keyword` in one call. Returns None on any failure."""
    results = search_broll(keyword, per_page=5)
    if not results:
        return None
    return download_broll_asset(results[0]["downloadUrl"], keyword)
