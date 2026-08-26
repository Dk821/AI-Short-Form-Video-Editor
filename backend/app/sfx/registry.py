"""
The bundled SFX catalog — same "add an entry here, drop a file in
library/, nothing else changes" pattern as templates/registry.py.

Every entry's `duration` is the REAL probed length of its placeholder
file (see library/README.txt) — used as the attach endpoint's default
timeline duration and as the frontend picker's clip-length label, so
neither has to guess or re-probe on every request.
"""
from __future__ import annotations

from pathlib import Path

LIBRARY_DIR = Path(__file__).parent / "library"


class SfxEntry:
    __slots__ = ("id", "name", "category", "filename", "duration")

    def __init__(self, id: str, name: str, category: str, filename: str, duration: float):
        self.id = id
        self.name = name
        self.category = category
        self.filename = filename
        self.duration = duration

    @property
    def url(self) -> str:
        # Browser-servable URL — see main.py's StaticFiles mount at
        # /api/sfx/library. render.py never uses this directly; it goes
        # through resolve_sfx_path() below to get the real disk path.
        return f"/api/sfx/library/{self.filename}"

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "category": self.category,
            "url": self.url, "duration": self.duration,
        }


# Durations below are the real ffprobe'd length of each placeholder file —
# re-probe and update this if you replace a file with one of a different
# length (see library/README.txt).
SFX_CATALOG: list[SfxEntry] = [
    SfxEntry("pop", "Pop", "UI", "pop.mp3", 0.21),
    SfxEntry("click_tap", "Click Tap", "UI", "click_tap.mp3", 0.13),
    SfxEntry("ding_notification", "Ding", "Notification", "ding_notification.mp3", 0.73),
    SfxEntry("success_chime", "Success Chime", "Notification", "success_chime.mp3", 0.60),
    SfxEntry("drum_hit", "Drum Hit", "Impact", "drum_hit.mp3", 0.39),
    SfxEntry("impact_boom", "Impact Boom", "Impact", "impact_boom.mp3", 0.84),
    SfxEntry("whoosh_transition", "Whoosh", "Transition", "whoosh_transition.mp3", 0.63),
    SfxEntry("riser_build", "Riser", "Transition", "riser_build.mp3", 1.44),
]

_BY_ID = {e.id: e for e in SFX_CATALOG}


def list_sfx() -> list[SfxEntry]:
    return SFX_CATALOG


def get_sfx(sfx_id: str) -> SfxEntry | None:
    return _BY_ID.get(sfx_id)


def resolve_sfx_path(sfx_url_or_filename: str | None) -> Path | None:
    """Resolve a served '/api/sfx/library/xxx.mp3' URL (or a bare filename)
    to its real absolute filesystem Path — mirrors templates/registry.py's
    resolve_overlay_path exactly, for the same reason: render.py runs
    ffmpeg against real files on disk, never against this API's own
    routes."""
    if not sfx_url_or_filename:
        return None
    filename = Path(sfx_url_or_filename).name
    path = LIBRARY_DIR / filename
    return path if path.exists() else None
