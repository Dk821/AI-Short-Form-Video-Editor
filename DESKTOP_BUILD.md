# AI Video Editor — Windows Desktop Build

How the existing React + FastAPI app is packaged into a Windows installer
(`AI Video Editor Setup 1.0.0.exe`) that runs with no separately-installed
Node, Python, or FFmpeg. This file is the reference for building, testing,
and troubleshooting that installer. Nothing about the app's features,
timeline model, or API changed — only how it starts up and where it reads
and writes files.

## 1. Runtime architecture

```
AI Video Editor.exe  (NSIS-installed shortcut)
        |
        v
    Electron (electron/main.js)
        |
        +-- finds a free localhost port
        +-- spawns  resources/backend/video-editor-backend.exe --port <N>
        |         |
        |         v
        |   FastAPI (uvicorn), serving:
        |     - /api/*                     -> existing routers, unchanged
        |     - /  and every other path    -> resources/frontend (React build)
        |         |
        |         v
        |   resources/ffmpeg/ffmpeg.exe + ffprobe.exe
        |         |
        |         v
        |   %LOCALAPPDATA%\AI Video Editor\data\  (uploads, renders, db.json)
        |
        +-- polls GET /api/health until it answers (never a fixed sleep)
        +-- loads http://127.0.0.1:<N>/ once healthy
        +-- kills the backend process tree on quit
```

Because the backend serves the built frontend itself, the page origin *is*
the backend on every launch — so the frontend's existing relative `/api/...`
calls work unchanged; nothing needed hardcoding to `localhost:8000`.

User data (projects, uploads, renders, settings, logs) lives entirely under
`%LOCALAPPDATA%\AI Video Editor\`, never inside the install directory, so an
upgrade install never touches or deletes a user's projects.

## 2. What changed and why

### Modified files

| File | Change |
|---|---|
| `backend/app/main.py` | Loads `settings.py` before routers import; serves the built frontend when present (SPA fallback); tightened CORS (named origins + localhost regex, no more `*`); mounts `/api/uploads` through the new range-aware router; adds `/api/system/paths` for diagnostics. |
| `backend/app/storage.py` | Uploads/renders directories now resolved via `paths.py` instead of `Path(__file__)`; added `_safe_join` so a filename from a URL can never escape its storage directory. |
| `backend/app/db.py` | `db.json` path resolved via `paths.py`; writes are now atomic (write-then-rename) and explicit UTF-8, so a crash mid-save can't corrupt or lose the project database. |
| `backend/app/font_manager.py` | Fonts directory resolved via `paths.py` instead of `Path(__file__)`, so caption rendering keeps working when frozen. |
| `backend/app/render.py` | `_configured_ffmpeg()` / `_ffprobe_exe()` fall back to `paths.ffmpeg_path()` / `paths.ffprobe_path()` (which know about the bundled `resources/ffmpeg`) instead of the bare `PATH` lookup. Nothing about the filter graphs, presets, or export logic changed. |
| `backend/requirements.txt` | Added `python-dotenv` (was imported by `main.py` but never declared — a clean checkout couldn't install it). |
| `frontend/src/services/api.js` | `BASE` now reads `import.meta.env.VITE_API_URL \|\| '/api'`; added `getSettings`/`updateSettings`; `downloadUrl`/`assetUrl` re-anchor server-relative paths when `BASE` is absolute. No endpoint, method, or existing function signature changed. |
| `frontend/src/pages/Dashboard.jsx` | The existing "API & Integrations" sidebar item now opens the new Settings modal (previously inert). |
| `.gitignore` | Ignores the new build outputs (`backend/dist`, `backend/build`, `release/`, downloaded ffmpeg binaries) and the per-user `backend/settings.json` / `backend/logs/` a local dev run now creates. |

### New files

| File | Purpose |
|---|---|
| `backend/app/paths.py` | The single source of truth for every path: bundled resources, `%LOCALAPPDATA%\AI Video Editor\`, and ffmpeg/ffprobe resolution. Dev-mode behavior is unchanged (still reads/writes `backend/app/...` when run as `uvicorn app.main:app` with no `AIVE_DATA_DIR` set). |
| `backend/app/settings.py` | Per-user API keys/model settings, stored in `settings.json` in the user's data directory instead of a baked-in `.env`. |
| `backend/app/routers/settings.py` | `GET`/`PUT /api/settings` — backs the new Settings screen. Keys are write-only from the API (masked on read). |
| `backend/app/routers/media.py` | Range-aware `/api/uploads/{filename}`. The FastAPI/Starlette version this app pins does not implement HTTP range requests in `StaticFiles`, so scrubbing a large video in the preview used to re-download the whole file on every seek; this fixes that for the desktop build (and for dev too). |
| `backend/app/db.default.json` | Seed database copied to the user's data directory on first run only; never overwrites an existing one. |
| `backend/run_server.py` | The PyInstaller entry point: parses `--host`/`--port`, redirects stdout/stderr to `logs/backend.log` (a frozen, windowed exe has no console), then runs uvicorn. |
| `backend/build.spec` | PyInstaller spec (`--onedir`) bundling templates, SFX, fonts, and the seed database, plus the hidden imports `uvicorn`'s dynamic loader needs. |
| `backend/requirements-build.txt` | Adds `pyinstaller` on top of `requirements.txt`, kept separate so a normal dev setup doesn't need it. |
| `frontend/src/components/dashboard/SettingsModal.jsx` | The API-key/model settings screen, wired to the endpoints above. |
| `electron/main.js` | The desktop shell: picks a free port, spawns the backend, polls `/api/health`, shows a splash screen, loads the app, and tears the backend down cleanly (including on a crash). |
| `electron/preload.js` | Minimal `contextBridge` surface (`window.desktop`) — no `fs`/`child_process`/`shell` exposed to the page. |
| `scripts/dev-electron.js` | Launches Electron against the Vite dev server for `npm run dev`. |
| `scripts/fetch-ffmpeg.ps1` | Populates `resources/ffmpeg/` from PATH or a fresh download, and verifies the build has the filters (`drawtext`, `geq`, `alphamerge`, `overlay`) the renderer requires. |
| `build/icon.ico`, `build/icon.png` | App icon (generated placeholder — swap the `.ico` for your own art any time, no other config changes needed). |
| `package.json` (repo root) | New — didn't exist before. Orchestrates the frontend build, PyInstaller build, and `electron-builder`. |
| `resources/ffmpeg/README.txt` | Placeholder; the actual `.exe`s are fetched by the script above and are not committed. |

Nothing was removed: every router, the timeline model, the render filter
graphs, B-roll, SFX, templates, and every existing API function
are untouched. (Shotstack cloud export has since been removed from the
project entirely — this app is local-FFmpeg-export only now.)

## 3. Prerequisites (Windows machine that builds the installer)

- Node.js 20+ and npm
- Python 3.12 (matching the existing `backend/venv`) on PATH
- PowerShell (built into Windows)
- Internet access for `npm install`, `pip install`, and (once, unless you
  already have FFmpeg) the FFmpeg download

## 4. Installation — from a clean checkout

```powershell
cd AI-Video-Editor

# Root tooling (Electron, electron-builder, concurrently)
npm install

# Frontend
npm run frontend:install

# Backend — reuse the existing venv, or create a fresh one
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt -r requirements-build.txt
cd ..
```

## 5. Development workflow (unchanged in spirit — nothing destroyed)

Two ways to run it while developing, exactly as before plus one addition:

```powershell
# A) React dev server + FastAPI dev server only (original workflow)
cd backend; venv\Scripts\activate; uvicorn app.main:app --reload --port 8000
# in a second terminal:
cd frontend; npm run dev

# B) The same two, plus an Electron window pointed at them
npm run dev
```

`npm run dev` runs the backend, Vite, and Electron together (via
`concurrently`); Electron waits for `/api/health` on port 8000 and then
loads `http://localhost:5173`, so hot reload keeps working.

## 6. Production build — step by step

```powershell
# 1. Get ffmpeg.exe + ffprobe.exe into resources\ffmpeg\
#    (uses PATH if you have ffmpeg installed, otherwise downloads a full
#    build and verifies it has drawtext/geq/alphamerge/overlay)
npm run fetch:ffmpeg

# 2. Build the React production bundle -> frontend/dist
npm run frontend:build

# 3. Freeze the backend with PyInstaller -> backend/dist/video-editor-backend/
venv\Scripts\activate    # from backend/, or use the venv's absolute path
cd ..
npm run build:backend

# 4. Sanity-check the frozen backend BEFORE involving Electron at all
backend\dist\video-editor-backend\video-editor-backend.exe --port 8123
# in another terminal / browser:
curl http://127.0.0.1:8123/api/health
# expect: {"status":"ok","version":"1.0.0","frozen":true}
# then Ctrl+C the exe.

# 5. Smoke-test the whole app in Electron without building an installer yet
npm run electron
#   (loads http://127.0.0.1:<port>/ using the just-built dist + backend.exe)

# 6. Build the installer
npm run dist
```

Steps 1-2 can run in either order and only need re-running when FFmpeg or
the frontend changes. `npm run dist` re-runs 2 and 3 for you (`build:app`)
before invoking `electron-builder`.

### Output

```
release\AI Video Editor Setup 1.0.0.exe
```

`electron-builder` also leaves an unpacked copy under `release\win-unpacked\`
useful for a quick launch without installing.

## 7. What the installer does

- Installs to a user-chosen directory (defaults to
  `%LOCALAPPDATA%\Programs\AI Video Editor`, no admin required, but elevation
  is allowed if the user picks Program Files instead)
- Creates a Desktop shortcut and a Start Menu shortcut named "AI Video Editor"
- On first launch, seeds an empty project database into
  `%LOCALAPPDATA%\AI Video Editor\data\db.json`
- On uninstall, removes the installed binaries and shortcuts but leaves
  `%LOCALAPPDATA%\AI Video Editor\` (projects, media, settings) in place —
  a user's work is never deleted by an uninstall

## 8. API keys — the desktop Settings screen

The dev checkout's `backend/.env` values are **not** compiled into the
installer (an installer is something you might hand to someone else, and
baking your keys in would hand them your Groq/OpenRouter/Gemini/Pexels
quota too). Instead:

- Open the app -> sidebar -> **API & Integrations**
- Paste keys for Groq (transcription), OpenRouter or Gemini (auto-edit),
  and Pexels (B-roll)
- Saved to `%LOCALAPPDATA%\AI Video Editor\settings.json`, applied
  immediately — no restart needed
- `GET /api/settings` never returns a real key, only whether one is set
  and its last four characters

If you specifically want *your* current `backend/.env` values preinstalled
as defaults for a personal build, drop a `.env` file next to
`video-editor-backend.exe` (i.e. in `resources\backend\`) before running
`npm run dist` — `settings.load()` reads it as a non-overriding default.
Don't distribute that build to anyone else.

## 9. Verification performed this session

Everything below was exercised against the modified backend, running the
real renderer (not mocked), before handing this over:

- Health check, and `/api/system/paths` reporting the resolved data/ffmpeg
  paths
- Project create / rename / delete
- Upload with a filename containing spaces, parentheses, and a leading
  capital (`with audio (1).mp4`) — verifies `_safe_join` and the multipart
  handling
- `ffprobe`-derived duration/dimensions on upload
- Timeline save with a video item + a caption item
- Cover-image capture (real `drawtext` composite via `capture_frame`)
- **Full FFmpeg export**: MP4, standard quality, with a caption burned in —
  verified the output with `ffprobe` (h264 1080x1920 video + aac audio,
  correct duration)
- Download endpoint for the rendered file
- SFX catalog fetch + attach
- Template list + apply
- Settings `GET`/`PUT` round-trip (including that an omitted field is left
  alone and an explicit empty string clears it)
- Path-traversal attempts against both `/api/uploads/...` and the SPA
  static-file route (`..%2f..%2f...`) — both correctly refused
- Range requests against `/api/uploads/...` (full file, a byte range, a
  suffix range, and an out-of-range request) — this is a **real bug fix**:
  the pinned Starlette version silently ignores `Range` headers in
  `StaticFiles`, which made scrubbing a large source video in the preview
  re-download the entire file on every seek. `routers/media.py` fixes this
  for both the desktop build and normal `npm run dev`.
- A full bundled esbuild compile of the entire frontend (every import
  reachable from `main.jsx`, including the new Settings modal) — 0 errors

What was **not** run in this session, and needs a pass on your machine:
building `video-editor-backend.exe` with PyInstaller-for-Windows, the NSIS
installer itself, and anything that calls out to Groq/OpenRouter/Gemini/
Pexels (those need real API keys and this session's own sandbox
has no route to those hosts). Section 10 is exactly that pass.

## 10. Testing the installer (do this on a clean-ish Windows machine)

1. Run the installer, accept or change the install directory, finish.
2. Launch from the Desktop shortcut (not from a terminal) — confirms it
   works from Explorer with an arbitrary working directory.
3. Splash screen -> editor opens. If it times out, see Troubleshooting.
4. **API & Integrations** -> enter your real keys -> Save.
5. Dashboard -> **Blank Project** -> upload a video (try one over 200 MB if
   you have one handy).
6. Open the project -> confirm the preview plays and scrubbing is smooth
   (this is the Range-request fix — before it, scrubbing a large file would
   stutter badly).
7. Transcribe -> generate captions -> confirm word-level timing looks right.
8. Auto Edit -> a template -> confirm zooms/B-roll get applied.
9. B-roll panel -> search Pexels -> attach a clip.
10. SFX panel -> attach a sound -> confirm it shows on the timeline.
11. Timeline -> drag/resize/trim a couple of items across different tracks.
12. Cover image -> scrub -> capture -> confirm the dashboard thumbnail updates.
13. Export -> MP4 standard -> confirm it finishes and plays back correctly.
    Repeat for WebM and GIF, and for a couple of the other quality/FPS
    combinations.
14. Close the app from the taskbar/X button -> open Task Manager -> confirm
    `video-editor-backend.exe` is gone (no orphaned process).
16. Reopen the app -> confirm the project from step 5 is still there (tests
    that user data survives a restart, and would survive a reinstall/upgrade
    since it lives outside the install directory).
17. Uninstall via *Settings -> Apps* -> confirm `%LOCALAPPDATA%\AI Video
    Editor\` (and your projects) are still on disk afterward.

## 11. Known limitations

- **First launch after install** takes a few seconds longer than
  subsequent ones (Windows Defender / SmartScreen scanning the freshly
  extracted backend). This is normal for any unsigned Python-frozen exe;
  code-signing the installer removes it but is out of scope here (needs a
  purchased certificate).
- **The installer is unsigned.** Windows SmartScreen will show an "unknown
  publisher" prompt on first run (`More info -> Run anyway`). Fixable only
  with a code-signing certificate.
- The desktop build's Settings screen changes a key with no restart needed
  for Groq/OpenRouter/Gemini/Pexels; an `FFMPEG_BINARY` /
  `FFPROBE_BINARY` override typed there also applies immediately (the
  `lru_cache` in `render.py` is cleared on save).
- Antivirus software occasionally flags freshly-built PyInstaller
  executables as suspicious (a known false-positive class, not specific to
  this app). If that happens on your target machine, submitting the exe to
  the AV vendor as a false positive is the standard fix.

## 12. Troubleshooting

Every startup problem writes to:

```
%LOCALAPPDATA%\AI Video Editor\logs\electron.log
%LOCALAPPDATA%\AI Video Editor\logs\backend.log
```

| Symptom | Likely cause | Fix |
|---|---|---|
| "The backend executable is missing" dialog | `npm run build:backend` wasn't run, or `electron-builder`'s `extraResources` didn't find `backend/dist/video-editor-backend/` | Run `npm run build:backend` again and confirm the folder exists before `npm run dist` |
| "The video engine took too long to start" | Antivirus scanning the new exe on first run; or `%LOCALAPPDATA%` on a slow/network drive | Check `backend.log` — if it's still loading, just retry; if it never appears, see next row |
| `backend.log` shows "could not bind ... address already in use" | Extremely unlikely (Electron asks the OS for a free port), but possible if something else grabbed it in the same instant | Relaunch the app |
| Exports fail with "No such filter: 'drawtext'" | The bundled FFmpeg wasn't built with `libharfbuzz` | Re-run `npm run fetch:ffmpeg -- -Force`, or point `-From` at a known-good full build; the script's filter check should have already caught this |
| Exports fail with a Windows NTSTATUS code (e.g. `0xC0000005`) | FFmpeg crashed on this machine's build/hardware, not a graph bug | The renderer already retries single-threaded, then (if `imageio_ffmpeg` is installed in the venv used to build) with a second FFmpeg build. Install `pip install imageio-ffmpeg` before building the backend to enable that fallback |
| Preview scrubbing is slow/stutters on a large file | You're running an old build without the Range-request fix | Rebuild — `routers/media.py` (see section 2) is what fixes this |
| Settings don't seem to take effect | Confirm you clicked Save in the modal; check `%LOCALAPPDATA%\AI Video Editor\settings.json` was actually written | If the file can't be written (locked, permissions), the Settings screen surfaces the error inline |
| A second window/instance won't open | By design — `requestSingleInstanceLock()` focuses the existing window instead of starting a second backend against the same database |

## 13. Versioning

Version lives in one place: `package.json`'s `"version"` field, which
`electron-builder` uses for both the installer filename and the
uninstall entry. Bump it (`1.0.1`, `1.0.2`, ...) before each `npm run dist`.
