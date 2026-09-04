# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for the AI Video Editor backend.

    pyinstaller backend/build.spec --noconfirm

Produces  backend/dist/video-editor-backend/video-editor-backend.exe
plus its Python runtime, libraries and bundled resources.

WHY --onedir AND NOT --onefile
------------------------------
--onefile unpacks the entire bundle into a fresh temp directory on every
launch. With the font family, template overlays and SFX library in here
that is tens of megabytes of disk churn before the first frame renders,
it makes antivirus scan the whole payload on each start, and it leaves
orphaned temp directories when the process is killed. A directory build
starts instantly and is what electron-builder wants to copy into
resources/ anyway.

WHAT HAS TO BE LISTED BY HAND
-----------------------------
PyInstaller follows imports; it cannot see files opened at runtime, and it
cannot see uvicorn's protocol/loop implementations because those are
resolved by string name. Both are enumerated below. Anything the app reads
from disk at runtime that is NOT in `datas` will be missing from the build
and will fail only when that specific feature is used.
"""
import os

from PyInstaller.utils.hooks import collect_submodules

BACKEND_DIR = os.path.abspath(SPECPATH)


def _res(relative):
    return os.path.join(BACKEND_DIR, relative)


# ---------------------------------------------------------------------------
# Runtime resources. (source_on_disk, destination_inside_bundle)
# Destinations mirror the dev layout so app/paths.py resolves them
# identically whether it is running frozen or from the checkout.
# ---------------------------------------------------------------------------
datas = [
    # Template JSON + their thumbnails and overlay preview videos.
    (_res('app/templates/library'), 'app/templates/library'),
    # Bundled sound-effects catalog.
    (_res('app/sfx/library'), 'app/sfx/library'),
    # Inter family + registry.json, used for every drawtext caption. Without
    # these the renderer falls back to fontconfig, which is exactly the
    # crash font_manager.py exists to avoid.
    (_res('fonts'), 'fonts'),
    # Seed database copied to the user's data directory on first launch.
    (_res('app/db.default.json'), 'app'),
]

# ---------------------------------------------------------------------------
# Pillow's own font-metrics module (PIL.ImageFont, via app/caption_layout.py)
# needs its bundled FreeType data files at import time on some builds; the
# pyinstaller-hooks-contrib PIL hook normally handles this, but it is
# collected explicitly below (same reasoning as uvicorn/app) so a hook
# version mismatch never silently drops it — see collect_data_files call.
try:
    from PyInstaller.utils.hooks import collect_data_files as _collect_data_files
    datas += _collect_data_files('PIL')
except Exception:
    pass

# ---------------------------------------------------------------------------
# Imports PyInstaller's static analysis cannot see.
# ---------------------------------------------------------------------------
hiddenimports = []

# uvicorn picks its event loop, HTTP parser and websocket implementation by
# importing a module name it builds as a string at runtime.
hiddenimports += collect_submodules('uvicorn')
# Our own package: routers are included via app.main, but collecting the
# package guarantees a new router file is never silently left out.
hiddenimports += collect_submodules('app')
# Pillow's C extension modules — PIL.ImageFont's real-font-metrics path
# (backend/app/caption_layout.py) is new with the caption typography fix;
# PyInstaller's static analysis can miss these compiled-extension imports.
hiddenimports += collect_submodules('PIL')

hiddenimports += [
    'anyio._backends._asyncio',
    'h11',
    'httptools',
    'websockets',
    'websockets.legacy',
    'wsproto',
    'dotenv',
    'multipart',
    'email.mime.multipart',
    'email.mime.text',
    'encodings.idna',
]

# Optional second ffmpeg build (render._fallback_ffmpeg). Included only if
# the developer chose to install it; never a hard requirement.
try:
    import imageio_ffmpeg  # noqa: F401
    hiddenimports.append('imageio_ffmpeg')
except Exception:
    pass

# Nothing here draws a GUI, does science, or runs a test suite. Excluding
# these keeps the build to a sane size and avoids PyInstaller pulling in a
# Tk runtime that Windows users would then have to install.
excludes = [
    'tkinter', 'matplotlib', 'numpy.testing', 'pytest', 'IPython',
    'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'notebook', 'jupyter',
    'setuptools._distutils', 'lib2to3',
]

block_cipher = None

a = Analysis(
    [_res('run_server.py')],
    pathex=[BACKEND_DIR],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='video-editor-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,          # UPX-packed Python DLLs are a reliable way to get
                        # flagged by Windows Defender. Not worth the MBs.
    console=False,      # No console window behind the Electron UI. All
                        # output goes to logs/backend.log (see run_server.py)
                        # and to the pipe Electron reads.
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='video-editor-backend',
)
