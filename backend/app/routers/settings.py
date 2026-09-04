"""
Per-user configuration for the desktop build.

The dev checkout keeps its keys in backend/.env. An installed Windows app
cannot: the install directory is read-only, and shipping keys inside the
installer would hand them to every person who downloads it. So the desktop
build reads them from a settings.json in the user's own data directory,
written by the Settings screen through these two endpoints.

Values are write-only from the browser's point of view. GET reports whether
each key is configured and the last four characters, never the key itself.

AI auto-edit uses Google Gemini exclusively (GEMINI_API_KEY / GEMINI_MODEL).
"""
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import paths, settings as app_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsPatch(BaseModel):
    """Only the fields the user actually edited are sent.

    Omitted key -> left as-is (which is what lets the UI show a masked
    placeholder it can't read back). Explicit empty string -> cleared.
    """
    values: Dict[str, Optional[str]] = {}


@router.get("")
def read_settings():
    state = app_settings.public_state()
    state["dataDir"] = str(paths.USER_DATA_DIR)
    return state


@router.put("")
def write_settings(patch: SettingsPatch):
    unknown = [k for k in patch.values if k not in app_settings.ALL_KEYS]
    if unknown:
        raise HTTPException(400, f"Unknown setting(s): {', '.join(sorted(unknown))}")
    try:
        state = app_settings.update(patch.values)
    except OSError as exc:
        raise HTTPException(
            500,
            f"Could not write settings to {paths.SETTINGS_PATH}: {exc}",
        )
    state["dataDir"] = str(paths.USER_DATA_DIR)
    return state
