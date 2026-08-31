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

# Locate backend/fonts/ relative to this file (app/font_manager.py →
# app/ → backend/fonts/).
_FONTS_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "fonts")
)
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
    registry = _load_registry()
    req_family = (family or _DEFAULT_FAMILY).strip()
    req_weight = int(weight) if weight else _DEFAULT_WEIGHT
    req_style  = (style or _DEFAULT_STYLE).lower()

    def _try_family(fam: str, w: int, s: str) -> Optional[str]:
        """Look up one (family, weight, style) combination; return abs path
        or None if not in registry / file missing."""
        family_map: dict = registry.get(fam, {})
        if not family_map:
            return None
        weight_str = str(w)
        style_map: dict = family_map.get(weight_str, {})
        if not style_map:
            # Snap to nearest available weight.
            avail = [int(k) for k in family_map if k.isdigit()]
            if not avail:
                return None
            nearest = _snap_weight(avail, w)
            style_map = family_map.get(str(nearest), {})
        rel = style_map.get(s) or style_map.get("normal")
        if not rel:
            return None
        path = _abs(rel)
        if os.path.isfile(path):
            return path
        print(f"[font_manager] WARNING: registered font file missing: {path}")
        return None

    # Try requested family first.
    path = _try_family(req_family, req_weight, req_style)
    if path:
        return path

    if req_family != _DEFAULT_FAMILY:
        print(
            f"[font_manager] font '{req_family}' weight={req_weight} "
            f"style={req_style} not available — falling back to {_DEFAULT_FAMILY}"
        )
        path = _try_family(_DEFAULT_FAMILY, req_weight, req_style)
        if path:
            return path

    # Absolute last resort: hard-coded Inter Regular.
    fallback = _abs(f"Inter/Inter_24pt-Regular.ttf")
    if os.path.isfile(fallback):
        print(
            f"[font_manager] WARNING: using hard-coded fallback "
            f"Inter_24pt-Regular.ttf"
        )
        return fallback

    raise FileNotFoundError(
        f"[font_manager] CRITICAL: cannot locate any usable font file. "
        f"Ensure backend/fonts/Inter/ contains Inter_24pt-Regular.ttf. "
        f"Registry: {_REGISTRY_PATH}"
    )


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
