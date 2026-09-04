"""
FastAPI application entry point.

Two things changed here for the desktop build, both additive:

  * Configuration is loaded through settings.py before any router is
    imported, so modules that snapshot env vars at import time (pexels)
    see the user's keys. In a dev checkout this still means
    backend/.env; in the packaged app it also means the per-user
    settings.json the Settings screen writes.
  * When a built frontend is present it is served from this same server.
    That is what keeps every relative '/api/...' URL in the React app —
    including <video src="/api/uploads/x.mp4"> — working unchanged inside
    Electron, with no origin juggling and no CORS surface.
"""
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import paths, settings as app_settings

# Must happen before the routers are imported: pexels.py binds its API
# key to a module constant at import time.
paths.ensure_dirs()
paths.seed_database()
app_settings.load()

from .routers import (  # noqa: E402  (import order is deliberate, see above)
    projects, upload, export, transcription, captions, auto_edit, templates,
    broll, sfx, media, settings as settings_router, fonts as fonts_router,
)
from .storage import UPLOADS_DIR
from . import font_manager

# Static asset directories for template previews. Resolved through paths.py
# because in a PyInstaller build __file__ is not a real directory.
TEMPLATES_LIB_DIR = paths.TEMPLATES_LIB_DIR
SFX_LIB_DIR = paths.SFX_LIB_DIR
FONTS_DIR = paths.FONTS_DIR

# Surfaces any registered-but-missing font file in the startup log instead
# of on the first export that happens to use it — see font_manager.py.
font_manager.validate_registry()

APP_VERSION = "1.0.0"

app = FastAPI(title="AI Short-Form Video Editor API", version=APP_VERSION)

# The desktop app is served from this same origin, so cross-origin requests
# only ever come from the Vite dev server. Listing those explicitly beats a
# blanket "*" now that the backend can hold the user's API keys.
_DEV_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:4173", "http://127.0.0.1:4173",
]
_extra = [o.strip() for o in (os.environ.get("AIVE_EXTRA_ORIGINS") or "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEV_ORIGINS + _extra,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(upload.router)
app.include_router(export.router)
app.include_router(transcription.router)  # Milestone 2: Groq-hosted Whisper transcription
app.include_router(captions.router)       # Milestone 2: caption templates + generation
app.include_router(auto_edit.router)      # Milestone 3: Gemini auto-edit
app.include_router(templates.router)      # Template System: reusable video templates
app.include_router(broll.router)          # B-roll Library: manual search + attach
app.include_router(sfx.router)            # SFX Library: bundled placeholder sounds, browse + attach
app.include_router(settings_router.router)  # Desktop build: per-user API keys
app.include_router(fonts_router.router)     # Caption typography parity: font manifest

# Local-dev stand-in for a CDN in front of S3/R2 (see storage.py).
# Registered as a router rather than a StaticFiles mount because the pinned
# Starlette ignores Range requests, which makes seeking a large source video
# in the preview re-download the whole file. See routers/media.py.
app.include_router(media.router)
# Kept as a fallback for anything the route above does not match (e.g. a
# nested path). check_dir=False everywhere below: a missing bundled
# directory should 404 a preview, never stop the whole backend starting.
app.mount("/api/uploads", StaticFiles(directory=UPLOADS_DIR, check_dir=False), name="uploads")

# Template static assets (thumbnails + overlay preview videos).
# These are bundled with the source tree, not user-uploaded content.
app.mount(
    "/api/templates/thumbnails",
    StaticFiles(directory=str(TEMPLATES_LIB_DIR / "thumbnails"), check_dir=False),
    name="template_thumbnails",
)
app.mount(
    "/api/templates/overlays",
    StaticFiles(directory=str(TEMPLATES_LIB_DIR / "overlays"), check_dir=False),
    name="template_overlays",
)

# Bundled SFX audio files (see app/sfx/library/README.txt) — same
# "static asset shipped with the source tree" contract as the template
# overlays above.
app.mount(
    "/api/sfx/library",
    StaticFiles(directory=str(SFX_LIB_DIR), check_dir=False),
    name="sfx_library",
)

# The actual font files (Montserrat/Montserrat-700.ttf etc.) — served so
# the browser can load the IDENTICAL bytes FFmpeg's fontfile= reads from
# disk, via a plain @font-face url(). See routers/fonts.py's manifest and
# frontend/src/lib/captionLayout.js's font loader. Same "bundled with the
# source tree" contract as the template/SFX mounts above.
app.mount(
    "/api/fonts",
    StaticFiles(directory=str(FONTS_DIR), check_dir=False),
    name="fonts",
)


@app.get("/api/health")
def health():
    """Polled by the Electron shell until it answers, before the window is
    shown. Keep it cheap and keep `status` first — the desktop shell only
    checks for a 200."""
    return {"status": "ok", "version": APP_VERSION, "frozen": paths.IS_FROZEN}


@app.get("/api/system/paths")
def system_paths():
    """Where this process thinks everything lives. The single most useful
    thing to read when a packaged build misbehaves."""
    return paths.describe()


# ---------------------------------------------------------------------------
# Serve the built React app (packaged desktop build, or a local `npm run
# build`). Registered last so every /api route above wins the match.
# ---------------------------------------------------------------------------
_FRONTEND_DIST = paths.frontend_dist_dir()

if _FRONTEND_DIST is not None:
    _DIST_ROOT = _FRONTEND_DIST.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        """Static file if one exists, otherwise index.html so react-router
        can handle deep links like /editor/<id> on a hard reload."""
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        if full_path:
            candidate = (_DIST_ROOT / full_path).resolve()
            # Containment check: full_path comes straight off the URL.
            if candidate.is_file() and _DIST_ROOT in candidate.parents:
                return FileResponse(candidate)
        return FileResponse(_DIST_ROOT / "index.html")


def _startup_banner() -> None:
    info = paths.describe()
    print("[startup] AI Video Editor backend", APP_VERSION)
    for key in ("frozen", "resourceRoot", "userDataDir", "dbPath", "uploadsDir",
                "rendersDir", "frontendDist", "ffmpeg", "ffprobe"):
        print(f"[startup]   {key} = {info[key]}")
    if not Path(info["ffmpeg"]).is_file() and info["ffmpeg"] == "ffmpeg":
        print("[startup]   WARNING: no bundled ffmpeg found and none on PATH")


_startup_banner()
