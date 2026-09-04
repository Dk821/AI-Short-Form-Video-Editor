"""
Runtime configuration for API keys and model choices.

WHY THIS EXISTS
---------------
In the dev checkout every key lives in backend/.env, read once at import
time. A distributed desktop build cannot work that way: baking keys into
the installer hands them to everyone who downloads it, and .env sits inside
a read-only Program Files directory where the user could not edit it
anyway.

So the packaged app reads keys from a per-user file the user owns:

    %LOCALAPPDATA%\\AI Video Editor\\settings.json

Resolution order (last one wins):

    1. backend/.env          — dev only, unchanged from before
    2. the real process environment
    3. settings.json         — what the in-app Settings screen writes

The environment-variable NAMES are exactly the ones the app already uses
(GROQ_API_KEY, GEMINI_MODEL, ...), and every consumer still reads
os.environ, so nothing downstream had to change.

Keys never reach the frontend: GET /api/settings returns only whether each
key is set plus a masked tail, never the value.
"""
from __future__ import annotations

import json
import os
from typing import Dict

from . import paths

# Secret values — masked on the way out, never echoed back in full.
SECRET_KEYS = (
    "GROQ_API_KEY",
    "GEMINI_API_KEY",
    "PEXELS_API_KEY",
)

# Non-secret configuration the settings screen can also edit.
PLAIN_KEYS = (
    "WHISPER_MODEL",
    "GEMINI_MODEL",
    "FFMPEG_BINARY",
    "FFPROBE_BINARY",
)

ALL_KEYS = SECRET_KEYS + PLAIN_KEYS


def _read_file() -> Dict[str, str]:
    try:
        raw = json.loads(paths.SETTINGS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(raw, dict):
        return {}
    return {k: str(v) for k, v in raw.items() if k in ALL_KEYS and v is not None}


def _write_file(values: Dict[str, str]) -> None:
    paths.SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = paths.SETTINGS_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(values, indent=2), encoding="utf-8")
    os.replace(tmp, paths.SETTINGS_PATH)
    try:
        os.chmod(paths.SETTINGS_PATH, 0o600)   # no-op on most Windows setups
    except OSError:
        pass


def _apply(values: Dict[str, str]) -> None:
    for key, value in values.items():
        value = (value or "").strip()
        if value:
            os.environ[key] = value
        else:
            os.environ.pop(key, None)


def load() -> None:
    """Called once, before any router or env-reading module is imported."""
    if not paths.IS_FROZEN:
        # Dev behaviour preserved exactly: backend/.env still wins over a
        # stale shell environment, as it did before this change.
        try:
            from dotenv import load_dotenv
            load_dotenv(paths.RESOURCE_ROOT / ".env", override=True)
        except Exception:
            pass
    else:
        # A .env bundled next to the exe is honoured if someone deliberately
        # ships one, but is never required.
        env_file = paths.RESOURCE_ROOT / ".env"
        if env_file.is_file():
            try:
                from dotenv import load_dotenv
                load_dotenv(env_file, override=False)
            except Exception:
                pass
    _apply(_read_file())


def refresh_env_bound_modules() -> None:
    """Re-read the modules that snapshot env vars at import time.

    pexels.py binds its key to a module constant on import (correct for a
    server process started with a fixed .env, wrong once the user can
    change a key from the Settings screen without restarting). Rebinding
    here keeps that file untouched and keeps the "restart to apply"
    footgun out of the desktop app.
    """
    try:
        from . import pexels
        pexels.PEXELS_API_KEY = os.environ.get("PEXELS_API_KEY", "")
    except Exception:
        pass
    try:
        from . import transcribe
        transcribe.GROQ_WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "whisper-large-v3-turbo")
    except Exception:
        pass
    try:
        from . import render
        # FFMPEG_BINARY / FFPROBE_BINARY are lru_cached per process.
        render._configured_ffmpeg.cache_clear()
        render._ffprobe_exe.cache_clear()
    except Exception:
        pass


def _mask(value: str) -> str:
    value = value or ""
    if len(value) <= 4:
        return "****" if value else ""
    return f"****{value[-4:]}"


def public_state() -> dict:
    """What the Settings screen renders. Secrets are described, not sent."""
    stored = _read_file()
    secrets = []
    for key in SECRET_KEYS:
        live = os.environ.get(key, "")
        secrets.append({
            "key": key,
            "configured": bool(live),
            "masked": _mask(live),
            "fromSettingsFile": key in stored,
        })
    return {
        "secrets": secrets,
        "values": {key: os.environ.get(key, "") for key in PLAIN_KEYS},
        "settingsPath": str(paths.SETTINGS_PATH),
    }


def update(patch: Dict[str, object]) -> dict:
    """Merge a partial update into settings.json and apply it live.

    An omitted key is left alone; an explicit empty string clears it. That
    distinction is what lets the UI send only the fields the user touched
    without wiping the keys whose masked placeholders it never had.
    """
    values = _read_file()
    for key, value in patch.items():
        if key not in ALL_KEYS:
            continue
        if value is None:
            continue
        text = str(value).strip()
        if text:
            values[key] = text
        else:
            values.pop(key, None)
            os.environ.pop(key, None)
    _write_file(values)
    _apply(values)
    refresh_env_bound_modules()
    return public_state()
