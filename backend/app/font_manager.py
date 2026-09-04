"""
Local font manager — resolves logical (family, weight, style) triples to
absolute paths of local .ttf/.otf files for use in FFmpeg's drawtext
fontfile= option.

WHY THIS EXISTS
---------------
FFmpeg's drawtext `font='Inter'` option resolves through fontconfig. On
Windows, fontconfig either isn't installed at all or can't locate an
installed font's config, causing FFmpeg 8.x to crash with
0xC0000005 ACCESS_VIOLATION. Switching to `fontfile=/absolute/path.ttf`
bypasses fontconfig entirely and has proven reliable across every FFmpeg
8.x build tested.

ADDING NEW FONT FAMILIES
------------------------
1. Drop the .ttf/.otf files into backend/fonts/<FamilyName>/.
2. Add the family's weight→style→relative-path entries to
   backend/fonts/registry.json (relative to backend/fonts/).
3. No code changes required — the registry is the only authoritative source.

API
---
  resolve_font(family, weight, style)  →  "/abs/path/to/file.ttf"
  escape_fontfile_path(path)           →  FFmpeg-safe path string
  validate_registry()                  →  logs warnings, never raises
"""
from __future__ import annotations

import json
import os
from typing import Optional

# Locate the bundled fonts/ directory. In the dev checkout that is
# backend/fonts/; in a PyInstaller build __file__ is not a real directory
# and the fonts are unpacked elsewhere, so paths.py resolves it.
from . import paths

_FONTS_DIR = str(paths.FONTS_DIR)
_REGISTRY_PATH = os.path.join(_FONTS_DIR, "registry.json")

# Default fallback used when every other resolution attempt fails.
_DEFAULT_FAMILY = "Inter"
_DEFAULT_WEIGHT = 400
_DEFAULT_STYLE = "normal"

# Cache the loaded registry so we only read the file once per process.
_registry: dict | None = None


def _load_registry() -> dict:
    global _registry
    if _registry is not None:
        return _registry
    if not os.path.isfile(_REGISTRY_PATH):
        print(
            f"[font_manager] WARNING: registry not found at {_REGISTRY_PATH}. "
            "All font lookups will use the hard-coded fallback."
        )
        _registry = {}
        return _registry
    try:
        with open(_REGISTRY_PATH, encoding="utf-8") as f:
            raw = json.load(f)
        # Strip the _comment key if present — it's documentation only.
        _registry = {k: v for k, v in raw.items() if not k.startswith("_")}
    except Exception as exc:
        print(f"[font_manager] ERROR loading registry: {exc}. Using fallback.")
        _registry = {}
    return _registry


def _abs(relative: str) -> str:
    """Resolve a registry-relative path to an absolute filesystem path."""
    return os.path.normpath(os.path.join(_FONTS_DIR, relative))


def _snap_weight(available_weights: list[int], requested: int) -> int:
    """Pick the closest available weight to the requested one."""
    return min(available_weights, key=lambda w: abs(w - requested))


def resolve_font(
    family: Optional[str] = None,
    weight: Optional[int] = None,
    style: Optional[str] = None,
) -> str:
    """Return the absolute path of the best-matching local font file.

    Fallback ladder (first match wins):
      1. Requested family + weight + style
      2. Requested family + nearest weight + style
      3. Requested family + nearest weight + 'normal'
      4. Default family (Inter) + weight + style (same steps above)
      5. Hard-coded Inter Regular absolute path (last resort)

    The resolved path is always logged when it differs from the request,
    so font substitutions are never silent.
    """
    return _resolve(family, weight, style)["path"]


_FALLBACK_REL = "Inter/Inter_24pt-Regular.ttf"


def _resolve(
    family: Optional[str], weight: Optional[int], style: Optional[str]
) -> dict:
    """Shared implementation behind resolve_font() and resolve_font_info().

    resolve_font() only ever needed the final path; resolve_font_info()
    (added for the canonical caption-layout API — see caption_layout.py)
    also needs to know exactly which (family, weight, style) the ladder
    actually landed on, since that snapped/fallen-back combo — not the
    originally requested one — is what the frontend must register its
    FontFace descriptor as, or a fallback here could silently disagree
    with what render.py's FFmpeg export drew.

    Returns {"path", "relPath", "family", "weight", "style"} — the last
    three describing what was ACTUALLY used, not what was requested.
    """
    registry = _load_registry()
    req_family = (family or _DEFAULT_FAMILY).strip()
    req_weight = int(weight) if weight else _DEFAULT_WEIGHT
    req_style = (style or _DEFAULT_STYLE).lower()

    def _try_family(fam: str, w: int, s: str) -> Optional[dict]:
        """Look up one (family, weight, style) combination; return the
        resolved info dict, or None if not in registry / file missing."""
        family_map: dict = registry.get(fam, {})
        if not family_map:
            return None
        weight_str = str(w)
        style_map: dict = family_map.get(weight_str, {})
        resolved_weight = w
        if not style_map:
            # Snap to nearest available weight.
            avail = [int(k) for k in family_map if k.isdigit()]
            if not avail:
                return None
            resolved_weight = _snap_weight(avail, w)
            style_map = family_map.get(str(resolved_weight), {})
        resolved_style = s if style_map.get(s) else "normal"
        rel = style_map.get(resolved_style)
        if not rel:
            return None
        path = _abs(rel)
        if os.path.isfile(path):
            return {"path": path, "relPath": rel, "family": fam, "weight": resolved_weight, "style": resolved_style}
        print(f"[font_manager] WARNING: registered font file missing: {path}")
        return None

    # Try requested family first.
    info = _try_family(req_family, req_weight, req_style)
    if info:
        return info

    if req_family != _DEFAULT_FAMILY:
        print(
            f"[font_manager] font '{req_family}' weight={req_weight} "
            f"style={req_style} not available — falling back to {_DEFAULT_FAMILY}"
        )
        info = _try_family(_DEFAULT_FAMILY, req_weight, req_style)
        if info:
            return info

    # Absolute last resort: hard-coded Inter Regular.
    fallback = _abs(_FALLBACK_REL)
    if os.path.isfile(fallback):
        print(
            f"[font_manager] WARNING: using hard-coded fallback "
            f"Inter_24pt-Regular.ttf"
        )
        return {"path": fallback, "relPath": _FALLBACK_REL, "family": _DEFAULT_FAMILY, "weight": 400, "style": "normal"}

    raise FileNotFoundError(
        f"[font_manager] CRITICAL: cannot locate any usable font file. "
        f"Ensure backend/fonts/Inter/ contains Inter_24pt-Regular.ttf. "
        f"Registry: {_REGISTRY_PATH}"
    )


def resolve_font_info(
    family: Optional[str] = None,
    weight: Optional[int] = None,
    style: Optional[str] = None,
) -> dict:
    """Like resolve_font(), but returns the full resolution result instead
    of just the path: {"path", "relPath", "family", "weight", "style"}.
    caption_layout.py uses this so the canonical layout it hands to both
    render.py and the /api/captions/layout endpoint carries the file
    FFmpeg will actually read (relPath, servable via /api/fonts/<relPath>)
    alongside the resolved family/weight/style the frontend should
    register its FontFace under — never the raw, pre-fallback request."""
    return _resolve(family, weight, style)


def escape_fontfile_path(path: str) -> str:
    """Convert an absolute font path to a string safe for FFmpeg's
    drawtext fontfile= option.

    FFmpeg's filter-argument parser treats ':' as a key=value separator
    and '\\' as an escape prefix, so a Windows path like:
        C:\\project\\backend\\fonts\\Inter\\Inter_24pt-Bold.ttf
    must become:
        C\\:/project/backend/fonts/Inter/Inter_24pt-Bold.ttf

    Steps:
      1. Normalise to forward slashes.
      2. Escape any remaining ':' as '\\:' (Windows drive letter colon).
    """
    # Forward slashes first.
    fwd = path.replace("\\", "/")
    # Escape the drive-letter colon, e.g. "C:" → "C\\:".
    escaped = fwd.replace(":", "\\:")
    return escaped


def list_registry() -> dict:
    """Read-only snapshot of the font registry (minus the `_comment` key),
    for routers/fonts.py's GET /api/font-manifest — the manifest the
    frontend's captionLayout.js fetches once at startup so it can register
    a FontFace for every (family, weight, style) this exact same
    registry.json maps to a file for, and run the SAME fallback ladder
    resolve_font() below runs, on the same data. One JSON file, two
    languages reading it, instead of a hand-duplicated family list in the
    frontend that could silently drift from what FFmpeg actually has."""
    registry = _load_registry()
    return {k: v for k, v in registry.items() if not k.startswith("_")}


def validate_registry() -> None:
    """Log a warning for every registered font whose file is absent on
    disk. Called at startup (from app/main.py) so the operator sees
    missing files immediately in the console rather than on the first
    export. Never raises — a missing optional font should NOT stop the
    server from starting.
    """
    registry = _load_registry()
    if not registry:
        print(
            "[font_manager] WARNING: font registry is empty or missing. "
            "All exports will use the built-in Inter fallback."
        )
        return

    missing: list[str] = []
    for family, weights in registry.items():
        for weight_str, styles in weights.items():
            for style_key, rel in styles.items():
                path = _abs(rel)
                if not os.path.isfile(path):
                    missing.append(f"  {family} w={weight_str} {style_key}: {path}")

    if missing:
        print(
            f"[font_manager] WARNING: {len(missing)} registered font file(s) "
            f"are missing on disk:\n" + "\n".join(missing[:20])
            + ("\n  ... (truncated)" if len(missing) > 20 else "")
        )
    else:
        families = list(registry.keys())
        print(
            f"[font_manager] OK — all {len(missing)} of {len(families)} "
            f"registered font families validated: {', '.join(families)}"
        )
