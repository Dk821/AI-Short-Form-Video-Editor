"""
Font manifest — read-only endpoint the frontend's caption typography
engine (frontend/src/lib/captionLayout.js) fetches once at startup.

Why this needs to exist at all: font_manager.py's registry.json is what
render.py's FFmpeg export resolves fonts against. Before this endpoint the
frontend had no way to know what that registry actually contains, so
VideoPreview.jsx's caption rendering could only guess at which families/
weights had real files versus which would silently fall back to Inter on
export — one of the root causes of the Preview/Export typography mismatch
this router exists to close. Exposing the SAME registry.json the backend
already reads means both sides run identically shaped font resolution
against identical data, instead of the frontend keeping its own
hand-written (and driftable) copy of the family list.

The actual font FILES are served alongside this, via the `/api/fonts`
StaticFiles mount registered in main.py (see that file) — so a path this
manifest returns (e.g. "Montserrat/Montserrat-700.ttf") is fetchable at
`/api/fonts/Montserrat/Montserrat-700.ttf`, the exact same file
font_manager.resolve_font() hands FFmpeg via fontfile=.
"""
from fastapi import APIRouter

from ..font_manager import list_registry

router = APIRouter(tags=["fonts"])


@router.get("/api/font-manifest")
def font_manifest():
    """{family: {weight_str: {"normal": relPath, "italic"?: relPath}}} —
    relPath is relative to the `/api/fonts/` static mount, so the frontend
    can turn any entry directly into a fetchable URL with no extra
    lookup."""
    return list_registry()
