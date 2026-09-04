"""
Central path resolution for both the dev checkout and the packaged app.

This module answers three questions, and is the only place in the app that
is allowed to answer them:

  1. Where do READ-ONLY bundled resources live?  (template JSON + overlays
     + thumbnails, the SFX library, fonts, the seed database, the built
     frontend)                                          -> RESOURCE_ROOT
  2. Where does WRITABLE user data live?  (db.json, uploads, renders,
     covers, cache, logs, settings.json)                -> USER_DATA_DIR
  3. Which ffmpeg / ffprobe binary should run?  -> ffmpeg_path/ffprobe_path

WHY THIS EXISTS
---------------
Everything here used to be `Path(__file__).parent / ...`, which is correct
for `uvicorn app.main:app` run from backend/ and wrong for a packaged
Windows app in three separate ways:

  * Under PyInstaller `__file__` is a synthetic path inside the frozen
    archive, not a directory that exists on disk. Bundled data files live
    under `sys._MEIPASS` instead.
  * The install directory (Program Files) is read-only, so uploads,
    renders and db.json cannot live next to the code any more.
  * `os.getcwd()` is wherever the shortcut happened to be launched from —
    the desktop, C:\\Windows\\system32, anywhere — so it can never be used
    to find a resource.

LAYOUTS THIS HAS TO WORK UNDER
------------------------------
  dev      <repo>/backend/app/paths.py, resources beside it, data in-repo
  frozen   <install>/resources/backend/video-editor-backend.exe, bundled
           data under _MEIPASS, user data under %LOCALAPPDATA%

DEV BEHAVIOUR IS DELIBERATELY UNCHANGED: a plain `uvicorn app.main:app`
with no AIVE_DATA_DIR set keeps using backend/app/uploads, backend/app/
renders and backend/app/db.json exactly as before, so the existing
development workflow and any existing local projects keep working.
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

APP_NAME = "AI Video Editor"

# PyInstaller sets sys.frozen; a normal interpreter does not.
IS_FROZEN = bool(getattr(sys, "frozen", False))


def _env_path(name: str) -> Path | None:
    """An env var holding a path, tolerant of the quotes Windows users and
    .env files habitually wrap paths in."""
    raw = (os.environ.get(name) or "").strip().strip('"').strip("'")
    return Path(raw) if raw else None


# --------------------------------------------------------------------------
# 1. Read-only bundled resources
# --------------------------------------------------------------------------

def _resource_root() -> Path:
    """Directory that contains `app/` and `fonts/` — i.e. what `backend/`
    is in the dev checkout, and what PyInstaller unpacks its data files
    into when frozen."""
    if IS_FROZEN:
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass)
        return Path(sys.executable).resolve().parent
    # <repo>/backend/app/paths.py -> <repo>/backend
    return Path(__file__).resolve().parent.parent


RESOURCE_ROOT = _resource_root()

TEMPLATES_LIB_DIR = RESOURCE_ROOT / "app" / "templates" / "library"
TEMPLATE_THUMBNAILS_DIR = TEMPLATES_LIB_DIR / "thumbnails"
TEMPLATE_OVERLAYS_DIR = TEMPLATES_LIB_DIR / "overlays"
SFX_LIB_DIR = RESOURCE_ROOT / "app" / "sfx" / "library"
FONTS_DIR = RESOURCE_ROOT / "fonts"
SEED_DB_PATH = RESOURCE_ROOT / "app" / "db.default.json"


def frontend_dist_dir() -> Path | None:
    """The built React app, so FastAPI can serve it on the same origin as
    /api (which is what lets every relative '/api/...' URL in the frontend
    — including <video src="/api/uploads/x.mp4"> — keep working unchanged
    inside Electron).

    Electron passes AIVE_FRONTEND_DIST explicitly; the other candidates
    make `video-editor-backend.exe` self-serving when tested on its own,
    and make `uvicorn app.main:app` serve a dev `npm run build` output.
    """
    exe_dir = Path(sys.executable).resolve().parent
    candidates = [
        _env_path("AIVE_FRONTEND_DIST"),
        RESOURCE_ROOT / "frontend_dist",
        exe_dir / "frontend_dist",
        exe_dir.parent / "frontend",          # <install>/resources/frontend
        RESOURCE_ROOT.parent / "frontend" / "dist",   # dev checkout
    ]
    for c in candidates:
        if c and (c / "index.html").is_file():
            return c
    return None


# --------------------------------------------------------------------------
# 2. Writable user data
# --------------------------------------------------------------------------

def _default_user_data_dir() -> Path:
    if sys.platform == "win32":
        # LOCALAPPDATA, not APPDATA: this holds multi-GB source video and
        # renders, which must never end up in a roaming profile.
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
        return Path(base or Path.home()) / APP_NAME
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME
    base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(base) / "ai-video-editor"


# True only for a plain developer run of uvicorn with no explicit data dir.
LEGACY_DEV_LAYOUT = (not IS_FROZEN) and _env_path("AIVE_DATA_DIR") is None

if LEGACY_DEV_LAYOUT:
    USER_DATA_DIR = RESOURCE_ROOT                 # backend/
    DATA_DIR = RESOURCE_ROOT / "app"
    SETTINGS_PATH = RESOURCE_ROOT / "settings.json"
    LOGS_DIR = RESOURCE_ROOT / "logs"
else:
    USER_DATA_DIR = _env_path("AIVE_DATA_DIR") or _default_user_data_dir()
    DATA_DIR = USER_DATA_DIR / "data"
    SETTINGS_PATH = USER_DATA_DIR / "settings.json"
    LOGS_DIR = USER_DATA_DIR / "logs"

UPLOADS_DIR = DATA_DIR / "uploads"
RENDERS_DIR = DATA_DIR / "renders"
CACHE_DIR = DATA_DIR / "cache"
DB_PATH = DATA_DIR / "db.json"


def ensure_dirs() -> None:
    """Create every writable directory. Safe to call repeatedly."""
    for d in (DATA_DIR, UPLOADS_DIR, RENDERS_DIR, CACHE_DIR, LOGS_DIR):
        d.mkdir(parents=True, exist_ok=True)


def seed_database() -> None:
    """First-run only: put a database in place if the user has none.

    Never overwrites an existing db.json — an installed-over-the-top
    upgrade must keep the user's projects. Falls back to writing an empty
    structure if no seed file was bundled.
    """
    if DB_PATH.exists():
        return
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if SEED_DB_PATH.is_file():
        shutil.copyfile(SEED_DB_PATH, DB_PATH)
    else:
        DB_PATH.write_text('{"projects": {}, "jobs": {}}', encoding="utf-8")


# --------------------------------------------------------------------------
# 3. ffmpeg / ffprobe
# --------------------------------------------------------------------------

def _ffmpeg_search_dirs() -> list[Path]:
    """Directories that may hold a bundled ffmpeg/ffprobe pair, most
    specific first. The packaged layout is
    <install>/resources/backend/video-editor-backend.exe next to
    <install>/resources/ffmpeg/, hence the exe_dir.parent entry."""
    dirs: list[Path] = []
    env_dir = _env_path("AIVE_FFMPEG_DIR")
    if env_dir:
        dirs.append(env_dir)
    exe_dir = Path(sys.executable).resolve().parent
    dirs += [
        exe_dir / "ffmpeg",
        exe_dir.parent / "ffmpeg",
        exe_dir.parent.parent / "ffmpeg",
        RESOURCE_ROOT / "ffmpeg",
        RESOURCE_ROOT.parent / "resources" / "ffmpeg",   # dev checkout
    ]
    return dirs


def _exe_name(stem: str) -> str:
    return f"{stem}.exe" if os.name == "nt" else stem


def _locate(stem: str) -> str | None:
    """An explicit *_BINARY override wins; then any bundled copy; then
    whatever is on PATH (which is how a dev machine has always found it).
    Returns None if nothing but PATH is available."""
    override = _env_path(f"{stem.upper()}_BINARY")
    if override and override.is_file():
        return str(override)
    name = _exe_name(stem)
    for d in _ffmpeg_search_dirs():
        candidate = d / name
        try:
            if candidate.is_file():
                return str(candidate)
        except OSError:
            continue
    return shutil.which(stem)


def ffmpeg_path() -> str:
    """Absolute path to the ffmpeg to use, or the bare name 'ffmpeg' as a
    last resort so the failure surfaces as a normal ffmpeg error."""
    return _locate("ffmpeg") or "ffmpeg"


def ffprobe_path() -> str:
    found = _locate("ffprobe")
    if found:
        return found
    # An ffprobe sitting next to a resolved ffmpeg beats PATH: the two must
    # come from the same build or their capabilities can disagree.
    ffmpeg = ffmpeg_path()
    if os.path.isfile(ffmpeg):
        sibling = Path(ffmpeg).with_name(_exe_name("ffprobe"))
        if sibling.is_file():
            return str(sibling)
    return "ffprobe"


def describe() -> dict:
    """Everything a startup log line or a bug report needs to explain where
    this process thinks its files are."""
    return {
        "frozen": IS_FROZEN,
        "resourceRoot": str(RESOURCE_ROOT),
        "userDataDir": str(USER_DATA_DIR),
        "dataDir": str(DATA_DIR),
        "dbPath": str(DB_PATH),
        "uploadsDir": str(UPLOADS_DIR),
        "rendersDir": str(RENDERS_DIR),
        "logsDir": str(LOGS_DIR),
        "settingsPath": str(SETTINGS_PATH),
        "fontsDir": str(FONTS_DIR),
        "frontendDist": str(frontend_dist_dir() or ""),
        "ffmpeg": ffmpeg_path(),
        "ffprobe": ffprobe_path(),
    }
