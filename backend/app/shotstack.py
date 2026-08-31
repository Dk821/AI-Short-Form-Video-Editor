"""
Shotstack cloud-rendering client (alternative MP4 export engine).

This sits ALONGSIDE render.py, never replacing it: render.py stays the
default and the fallback, and nothing in the timeline model, the preview,
or the FFmpeg filter graph changes because of this file. The export
router picks an engine per job (see routers/export.py).

Why an ingest step exists
-------------------------
Shotstack renders in the cloud, so every asset it composites has to be
fetchable by Shotstack's servers over public HTTPS. This app's assets are
local files served at http://localhost:8000/api/uploads/... — unreachable
from outside the machine. So before a render is submitted, each local
asset is uploaded through Shotstack's Ingest API, which returns a hosted
URL to use in the timeline. Uploads are cached per file (keyed by content
hash) so re-exporting the same project doesn't re-upload anything.

API surface used here (all documented at https://shotstack.io/docs/api/):
  POST /edit/{env}/render          -> submit, returns response.id
  GET  /edit/{env}/render/{id}     -> status: queued|fetching|rendering|saving|done|failed
  POST /ingest/{env}/upload        -> signed PUT url + source id
  GET  /ingest/{env}/sources/{id}  -> status: queued|importing|ready|failed, plus `source` url
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
from typing import Any, Optional

import requests

# Sandbox ("stage") renders are free but watermarked and lower priority;
# "v1" is production. Keys are environment-specific — a stage key will not
# work against v1 — so the env and the key must match.
SHOTSTACK_ENV = (os.environ.get("SHOTSTACK_ENV") or "stage").strip().lower()
SHOTSTACK_API_KEY = (os.environ.get("SHOTSTACK_API_KEY") or "").strip()
# Public base URL of THIS backend, used for the render callback. Without it
# (e.g. plain localhost with no tunnel) the router falls back to polling.
SHOTSTACK_CALLBACK_BASE = (os.environ.get("SHOTSTACK_CALLBACK_BASE") or "").strip().rstrip("/")

_EDIT_BASE = "https://api.shotstack.io/edit"
_INGEST_BASE = "https://api.shotstack.io/ingest"

_TIMEOUT = 60
# asset absolute path -> hosted Shotstack URL. Process-local and purely an
# optimisation: a cold start just re-uploads.
_ingest_cache: dict[str, str] = {}
_ingest_lock = threading.Lock()


class ShotstackError(RuntimeError):
    """A Shotstack failure with a message already phrased for the user.

    `stage` says WHERE it went wrong (config / ingest / validation /
    submit / render), which is what turns "Shotstack rejected it" into
    something actionable.
    """

    def __init__(self, message: str, stage: str = "render", detail: Any = None):
        super().__init__(message)
        self.message = message
        self.stage = stage
        self.detail = detail


def is_configured() -> bool:
    return bool(SHOTSTACK_API_KEY)


def require_configured() -> None:
    if not SHOTSTACK_API_KEY:
        raise ShotstackError(
            "SHOTSTACK_API_KEY is not set. Add it to backend/.env (get a free "
            "sandbox key at https://dashboard.shotstack.io/) and restart the "
            "backend, or export with the FFmpeg engine instead.",
            stage="config",
        )


def _headers() -> dict:
    return {"x-api-key": SHOTSTACK_API_KEY, "content-type": "application/json"}


def _explain_http_error(resp: requests.Response, stage: str) -> ShotstackError:
    """Turn Shotstack's error body into one specific sentence.

    Shotstack reports schema problems as a 400 with a `data` array naming
    the exact offending field, which is far more useful to surface than
    "request failed" — a rejected asset, an out-of-range value or an
    unsupported codec all land here.
    """
    try:
        body = resp.json()
    except ValueError:
        body = {}

    detail = body.get("message") or body.get("error") or ""
    problems: list[str] = []
    data = body.get("data")
    if isinstance(data, list):
        for entry in data:
            if isinstance(entry, dict):
                field = entry.get("field") or entry.get("path") or ""
                msg = entry.get("message") or entry.get("error") or ""
                problems.append(f"{field}: {msg}".strip(": ").strip())
            elif entry:
                problems.append(str(entry))
    elif isinstance(data, dict):
        for key, value in data.items():
            problems.append(f"{key}: {value}")

    if resp.status_code in (401, 403):
        msg = (
            "Shotstack rejected the API key (HTTP %d). Check SHOTSTACK_API_KEY in "
            "backend/.env, and that it matches SHOTSTACK_ENV=%s — sandbox and "
            "production keys are different." % (resp.status_code, SHOTSTACK_ENV)
        )
    elif resp.status_code == 429:
        msg = "Shotstack rate-limited this account (HTTP 429). Wait a moment and retry."
    elif problems:
        msg = "Shotstack rejected the timeline: " + "; ".join(problems[:6])
    elif detail:
        msg = f"Shotstack rejected the request (HTTP {resp.status_code}): {detail}"
    else:
        msg = f"Shotstack request failed with HTTP {resp.status_code}: {resp.text[:400]}"
    return ShotstackError(msg, stage=stage, detail=body or resp.text[:1000])


def _post(url: str, payload: dict, stage: str) -> dict:
    try:
        resp = requests.post(url, headers=_headers(), data=json.dumps(payload), timeout=_TIMEOUT)
    except requests.RequestException as e:
        raise ShotstackError(f"Could not reach Shotstack ({e.__class__.__name__}): {e}", stage=stage)
    if resp.status_code >= 400:
        raise _explain_http_error(resp, stage)
    try:
        return resp.json()
    except ValueError:
        raise ShotstackError("Shotstack returned a non-JSON response.", stage=stage, detail=resp.text[:1000])


def _get(url: str, stage: str) -> dict:
    try:
        resp = requests.get(url, headers=_headers(), timeout=_TIMEOUT)
    except requests.RequestException as e:
        raise ShotstackError(f"Could not reach Shotstack ({e.__class__.__name__}): {e}", stage=stage)
    if resp.status_code >= 400:
        raise _explain_http_error(resp, stage)
    try:
        return resp.json()
    except ValueError:
        raise ShotstackError("Shotstack returned a non-JSON response.", stage=stage, detail=resp.text[:1000])


# ---------------------------------------------------------------------
# Ingest: get local files to a URL Shotstack can actually fetch
# ---------------------------------------------------------------------

def _file_key(path: str) -> str:
    """Content hash, so an edited/replaced file re-uploads but an unchanged
    one is reused across exports."""
    h = hashlib.sha256()
    h.update(str(os.path.getsize(path)).encode())
    with open(path, "rb") as f:
        h.update(f.read(1 << 20))          # first 1 MiB
        if os.path.getsize(path) > (1 << 21):
            f.seek(-(1 << 20), os.SEEK_END)
            h.update(f.read(1 << 20))      # last 1 MiB
    return h.hexdigest()


def upload_asset(path: str, poll_ready: bool = True) -> str:
    """Upload one local file and return the public URL Shotstack hosts it at."""
    require_configured()
    if not os.path.isfile(path):
        raise ShotstackError(f"Asset file is missing on disk: {path}", stage="ingest")

    key = _file_key(path)
    with _ingest_lock:
        cached = _ingest_cache.get(key)
    if cached:
        return cached

    signed = _post(f"{_INGEST_BASE}/{SHOTSTACK_ENV}/upload", {}, stage="ingest")
    attrs = (signed.get("data") or {}).get("attributes") or {}
    put_url, source_id = attrs.get("url"), attrs.get("id")
    if not put_url or not source_id:
        raise ShotstackError(
            "Shotstack's ingest service did not return an upload URL.",
            stage="ingest", detail=signed,
        )

    try:
        with open(path, "rb") as f:
            put = requests.put(put_url, data=f, timeout=600)
    except requests.RequestException as e:
        raise ShotstackError(f"Uploading {os.path.basename(path)} to Shotstack failed: {e}", stage="ingest")
    if put.status_code >= 400:
        raise ShotstackError(
            f"Uploading {os.path.basename(path)} to Shotstack failed with HTTP {put.status_code}.",
            stage="ingest", detail=put.text[:500],
        )

    url = _wait_for_source(source_id) if poll_ready else source_id
    with _ingest_lock:
        _ingest_cache[key] = url
    return url


def _wait_for_source(source_id: str, attempts: int = 60, delay: float = 2.0) -> str:
    import time

    for _ in range(attempts):
        body = _get(f"{_INGEST_BASE}/{SHOTSTACK_ENV}/sources/{source_id}", stage="ingest")
        attrs = (body.get("data") or {}).get("attributes") or {}
        status = (attrs.get("status") or "").lower()
        if status == "ready":
            src = attrs.get("source")
            if not src:
                raise ShotstackError(
                    "Shotstack reported the upload ready but gave no URL.",
                    stage="ingest", detail=body,
                )
            return src
        if status == "failed":
            raise ShotstackError(
                f"Shotstack could not process the uploaded file: {attrs.get('error') or 'unknown reason'}",
                stage="ingest", detail=body,
            )
        time.sleep(delay)
    raise ShotstackError(
        "Timed out waiting for Shotstack to finish ingesting an asset.", stage="ingest"
    )


def clear_ingest_cache() -> None:
    with _ingest_lock:
        _ingest_cache.clear()


# ---------------------------------------------------------------------
# Fonts
# ---------------------------------------------------------------------

# Shotstack fetches every font in timeline.fonts itself, and a single
# unreachable URL fails the WHOLE render ("One or more assets could not be
# found"). So font URLs are never hardcoded: Google's own CSS API is asked
# for the current file for each family, and anything that cannot be
# resolved is simply left out (Shotstack then substitutes a default face) —
# a typography fallback, never a failed export.
_GOOGLE_CSS = "https://fonts.googleapis.com/css2"
# A deliberately ancient User-Agent. Google serves woff2 to modern browsers
# and plain TTF to old ones, and TTF is what Shotstack's renderer wants.
_LEGACY_UA = "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)"
_FONT_URL_RE = re.compile(r"src:\s*url\((https://[^)]+?\.(?:ttf|otf))\)", re.IGNORECASE)

_font_cache: dict[tuple[str, int], Optional[str]] = {}
_font_lock = threading.Lock()


def resolve_font_url(family: str, weight: int = 400) -> Optional[str]:
    """Current hosted TTF for a Google font family, or None.

    Returning None is a normal outcome (offline, unknown family, Google
    changed something) and callers must treat it as "skip this font",
    never as an error.
    """
    key = (family.strip(), int(weight or 400))
    with _font_lock:
        if key in _font_cache:
            return _font_cache[key]

    url = None
    try:
        resp = requests.get(
            _GOOGLE_CSS,
            params={"family": f"{key[0]}:wght@{key[1]}"},
            headers={"User-Agent": _LEGACY_UA},
            timeout=15,
        )
        if resp.status_code == 200:
            match = _FONT_URL_RE.search(resp.text)
            if match:
                url = match.group(1)
    except requests.RequestException:
        url = None

    with _font_lock:
        _font_cache[key] = url
    return url


def _url_is_fetchable(url: str) -> bool:
    """Cheap reachability check before a URL is handed to Shotstack.

    Shotstack fails an entire render on one unfetchable asset, so it is far
    better to spend one HEAD request here and drop a font than to lose the
    export. Treated as best-effort: a network hiccup on OUR side must not
    discard a font that is actually fine, so only a definite 4xx/5xx counts
    as unfetchable.
    """
    try:
        resp = requests.head(url, timeout=10, allow_redirects=True)
        if resp.status_code == 405:  # some CDNs reject HEAD
            resp = requests.get(url, timeout=10, stream=True)
        return resp.status_code < 400
    except requests.RequestException:
        return True  # unknown from here — let Shotstack be the judge


def resolve_font_urls(families: list[str], verify: bool = True) -> tuple[dict, list[str]]:
    """Resolve many families at once. Returns (family -> url, unresolved)."""
    resolved: dict[str, str] = {}
    missing: list[str] = []
    for family in families:
        if not family:
            continue
        url = resolve_font_url(family, 700)  # bold covers caption weights
        if url and (not verify or _url_is_fetchable(url)):
            resolved[family] = url
        else:
            missing.append(family)
    return resolved, missing


def clear_font_cache() -> None:
    with _font_lock:
        _font_cache.clear()


# ---------------------------------------------------------------------
# Edit: submit and track a render
# ---------------------------------------------------------------------

def submit_render(edit: dict) -> str:
    """POST the edit and return Shotstack's render id."""
    require_configured()
    body = _post(f"{_EDIT_BASE}/{SHOTSTACK_ENV}/render", edit, stage="submit")
    render_id = (body.get("response") or {}).get("id")
    if not render_id:
        raise ShotstackError(
            "Shotstack accepted the request but returned no render id.",
            stage="submit", detail=body,
        )
    return render_id


# Shotstack's own progression; only done/failed are terminal.
TERMINAL_STATUSES = {"done", "failed"}


def get_render_status(render_id: str) -> dict:
    """Normalised status: {status, url, error, progress, poster, thumbnail}."""
    require_configured()
    body = _get(f"{_EDIT_BASE}/{SHOTSTACK_ENV}/render/{render_id}", stage="render")
    resp = body.get("response") or {}
    status = (resp.get("status") or "unknown").lower()
    return {
        "status": status,
        "url": resp.get("url"),
        "error": resp.get("error"),
        "poster": resp.get("poster"),
        "thumbnail": resp.get("thumbnail"),
        "renderTime": resp.get("renderTime"),
        "raw": resp,
    }
