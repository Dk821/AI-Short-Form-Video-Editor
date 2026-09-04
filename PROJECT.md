# 🎬 AI Short-Form Video Editor — Project & Architecture Guide

## 📌 Project Overview
The **AI Short-Form Video Editor** is an intelligent, full-stack video creation suite designed specifically for short-form vertical video content (TikTok, Instagram Reels, YouTube Shorts, Podcasts, and Explainer videos). It runs both as a standard **web application** (React + FastAPI) and as a **standalone Windows desktop application** (Electron + PyInstaller + bundled FFmpeg).

It features word-level speech transcription via Groq Whisper API, dynamic preset template styling, AI-driven auto-editing (hooks, camera punch-in zooms, B-roll suggestions, caption emphasis), stock media integration via Pexels, an interactive React canvas preview with live karaoke captions, a server-side FFmpeg multi-track filtergraph rendering engine with local font management, and an in-app settings manager.

> 💡 **Core Architecture Principle:**  
> *"AI decides. Timeline stores. Renderer executes. Preview and export consume the same timeline model."*

---

## 📁 Workspace Directory Structure

```
.
├── package.json                     # Desktop orchestrator (builds frontend, freezes backend, runs electron-builder)
├── package-lock.json                # Locked Node dependencies for desktop shell
├── electron/
│   ├── main.js                      # Electron main process (port allocation, backend spawning, health polling, lifecycle)
│   └── preload.js                   # Secure contextBridge exposing minimal window.desktop API
├── scripts/
│   ├── dev-electron.js              # Launcher coordinating Vite dev server and Electron
│   └── fetch-ffmpeg.ps1             # PowerShell utility to fetch, extract, and verify required FFmpeg filter binaries
├── resources/
│   └── ffmpeg/                      # Bundled FFmpeg & FFprobe executables for packaged desktop distribution
├── build/
│   ├── icon.ico                     # Windows installer and application icon
│   └── icon.png                     # Application icon PNG
│
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI entrypoint, settings initialization, CORS, routers & SPA frontend serving
│   │   ├── paths.py                 # Central path resolution (Resource root, User Data dir, FFmpeg/FFprobe locator)
│   │   ├── settings.py              # Per-user API key/model configuration manager (persisted to settings.json)
│   │   ├── models.py                # Pydantic data models (Timeline, Track, Item, Project, Asset, Transcript)
│   │   ├── db.py                    # Atomic file-based JSON DB storage helper (write-then-rename, UTF-8)
│   │   ├── db.default.json          # Default seed database deployed on first launch
│   │   ├── db.json                  # Local database store for projects & export jobs (dev mode)
│   │   ├── storage.py               # Local media asset manager with path traversal guards (_safe_join)
│   │   ├── font_manager.py          # Local TTF font resolver bypassing Windows fontconfig crashes in FFmpeg
│   │   ├── transcribe.py            # Audio extraction (FFmpeg) & Groq Whisper transcription API (word-level timestamps)
│   │   ├── caption_templates.py     # Caption generation logic & legacy preset configurations
│   │   ├── ai_edit.py               # AI Auto-edit engine — Gemini-only via Google GenAI SDK; hard validation gate
│   │   ├── template_engine.py       # Decision-to-timeline converter (EditDecisions -> TimelineItems)
│   │   ├── render.py                # FFmpeg multi-track filtergraph engine, fontfile resolution & color conversions
│   │   ├── pexels.py                # Pexels stock VIDEO + PHOTO search, preview, and auto-download manager
│   │   ├── stress_words.py          # "AI Stress Text Highlighter": deterministic offline heuristic to highlight key words
│   │   ├── sfx/                     # Bundled sound effects library registry & catalog (`sfx` track)
│   │   │   ├── registry.py          # SFX catalog listing, duration probing & URL path resolver
│   │   │   └── library/             # Bundled audio files (switches, pops, swooshes, risers)
│   │   ├── overlays/                # Video overlay filter validation & overlay plan manager
│   │   │   ├── manager.py           # Overlay manager for loading overlay definitions
│   │   │   ├── resolver.py          # Pure resolution function computing overlay start/duration/t-params for FFmpeg
│   │   │   └── validator.py         # Validation rules for overlay assets
│   │   ├── routers/
│   │   │   ├── projects.py          # Project management routes (CRUD operations & cover image capture)
│   │   │   ├── upload.py            # Asset file upload router with FFprobe metadata extraction
│   │   │   ├── media.py             # HTTP 206 Partial Content range-aware media streaming for smooth video scrubbing
│   │   │   ├── settings.py          # In-app configuration endpoints (GET/PUT /api/settings, masked keys)
│   │   │   ├── transcription.py     # Speech-to-text trigger router
│   │   │   ├── captions.py          # Caption generation router & stress-highlight toggle endpoint
│   │   │   ├── auto_edit.py         # AI auto-edit router & Pexels resolution
│   │   │   ├── templates.py         # Video template application router & static asset serving
│   │   │   ├── broll.py             # B-roll Library router (Pexels search + local asset attach)
│   │   │   ├── sfx.py               # SFX catalog browser & timeline attacher router
│   │   │   └── export.py            # Local FFmpeg render job router & download handler
│   │   └── templates/
│   │       ├── schema.py            # Typed video template Pydantic schemas (CaptionStyle, BrollStyle, OverlayStyle)
│   │       ├── registry.py          # Dynamic template loader & JSON presets parser
│   │       └── library/             # Preset JSON templates (viral, gaming, podcast, business, etc.)
│   │           ├── thumbnails/      # Template preview thumbnails (referenced by thumbnailUrl)
│   │           └── overlays/        # Bundled video overlay loops (light leaks, film grain)
│   ├── fonts/                       # Bundled offline TrueType fonts directory
│   │   ├── registry.json            # Registry mapping font families and numeric weights to .ttf files
│   │   └── Inter/                   # Inter font files (weights 100 through 900, normal and italic)
│   ├── .env                         # Development API keys & environment variables
│   ├── .gitignore                   # Backend git ignore rules
│   ├── run_server.py                # Standalone PyInstaller bootstrap (port parsing, log redirection, uvicorn run)
│   ├── build.spec                   # PyInstaller specification for one-folder standalone backend build
│   ├── requirements.txt             # Runtime Python dependencies (fastapi, uvicorn, pydantic, python-dotenv, etc.)
│   ├── requirements-build.txt       # Build-only Python dependencies (pyinstaller)
│   ├── diagnose_export.py           # Diagnostic script to run ladder of FFmpeg commands against input media
│
└── frontend/
    ├── src/
    │   ├── main.jsx                 # React entrypoint
    │   ├── App.jsx                  # Main router setup
    │   ├── index.css                # Global CSS styles & Tailwind directives
    │   ├── pages/
    │   │   ├── Dashboard.jsx        # Project dashboard, creation trigger, and API settings modal launcher
    │   │   └── EditorPage.jsx       # Interactive video editor workspace page
    │   ├── components/
    │   │   ├── dashboard/
    │   │   │   ├── CreateProjectModal.jsx # Project creation modal with template & aspect ratio selector
    │   │   │   └── SettingsModal.jsx      # In-app settings dialog for managing AI keys, models, and paths
    │   │   └── editor/
    │   │       ├── VideoPreview.jsx # Live HTML5 preview canvas — animated captions, zooms, B-roll overlays, Cover tab
    │   │       ├── Timeline.jsx     # Multi-track timeline control panel wrapper
    │   │       ├── TimelineTrack.jsx# Individual track container (video, broll, caption, audio, zoom, overlay, sfx)
    │   │       ├── TimelineItem.jsx # Draggable/resizable timeline elements
    │   │       ├── Sidebar.jsx      # Control panel tabs (Captions / Edit Scenes / Trim / SFX / CTA), visibility toggles
    │   │       ├── Toolbar.jsx      # Navigation bar (Export trigger, Undo/Redo, Save, mode switcher)
    │   │       ├── BrollPicker.jsx  # B-roll Library modal (Image Search / Video Search / Upload Local)
    │   │       ├── SfxPicker.jsx    # Bundled SFX catalog browser & attacher modal
    │   │       ├── CtaPicker.jsx    # Call-To-Action stickers & badges picker modal
    │   │       ├── ExportPanel.jsx  # Local FFmpeg export modal — MP4/WebM/GIF, Quality, FPS
    │   │       ├── TemplateLibrary.jsx # Video style template selector modal
    │   │       ├── Scenes.jsx       # Sentence-level scene view with B-roll indicator & dropdown menu
    │   │       └── animations/
    │   │           ├── index.js                  # Re-exports animation components and layout helpers
    │   │           ├── BrollAnimation.jsx        # B-roll reveal animation + hold-phase drift
    │   │           ├── SplitScreenLayout.jsx     # Main video split-screen placement & parallax drift
    │   │           ├── driftMotion.js            # Shared hold-phase drift constants/formula (mirrored in render.py)
    │   │           ├── StressHighlightModal.jsx  # AI Stress Text Highlighter style customization modal
    │   │           ├── LayoutPicker.jsx          # Layout selector component (fullscreen, split-screen, picture-in-picture)
    │   │           ├── RevealAnimationModal.jsx  # Reveal animation duration and easing configuration dialog
    │   │           ├── RevealAnimationPicker.jsx # Animation preview cards (zoom_in, slide_down, fade_in, bounce_in)
    │   │           ├── SpeakerPreview.jsx        # Speaker framing & crop preview helper
    │   │           └── useOverlaySourceSync.js   # Synchronizes preview video elements across overlays and main video
    │   ├── services/
    │   │   └── api.js               # Centralized REST client (auto-detects origin, re-anchors URLs, handles settings)
    │   └── stores/
    │       └── editorStore.js       # Zustand state store for timeline, playback, selection, and cover state
    ├── package.json                 # Frontend dependencies & scripts
    ├── tailwind.config.js           # Styling configuration & custom dark theme tokens
    └── vite.config.js               # Vite build configuration (API proxy to backend in development)
```

---

## 🛠️ Tech Stack & Architecture

### Backend
- **Framework**: FastAPI (Python 3.10+) running on Uvicorn.
- **Data Validation & Schemas**: Pydantic v2.
- **Path & Resource Resolution**: `app/paths.py` provides unified resolution across both Python dev environments and frozen PyInstaller bundles.
  - Read-only assets (templates, SFX library, fonts, seed database) resolve to `RESOURCE_ROOT`.
  - Writable data (database, uploads, renders, logs, settings) resolves to `USER_DATA_DIR` (`%LOCALAPPDATA%\AI Video Editor\` on Windows, or `backend/app/` during development).
- **Settings & Security**: `app/settings.py` manages write-only per-user configuration stored in `settings.json`, with masked secrets returned to the UI.
- **Transcription**: Groq-hosted Whisper API (`whisper-large-v3-turbo`) with word-level timestamps, mono 16kHz audio extraction via FFmpeg, and segment linear interpolation fallback.
- **AI Auto-Edit Engine**: **Google Gemini exclusively** (`gemini-3.8-flash` default) via the Google GenAI Python SDK (`google-genai`). No fallback providers. If Gemini fails, a clear Gemini-specific error is surfaced to the user.
- **Stock Media Integration**: Pexels Video API (portrait MP4 filtering, height capping <= 1920p) and Pexels Photos API (portrait image search + curated feed).
- **Range-Aware Media Streaming**: `routers/media.py` implements RFC 7233 HTTP 206 Partial Content chunked streaming (1 MiB chunks) for `/api/uploads/{filename}`, preventing browser timeline lag and multi-gigabyte re-downloads during scrubbing.
- **Local Font Management Subsystem**: `font_manager.py` resolves logical `(family, weight, style)` queries to absolute TrueType font paths via `backend/fonts/registry.json`. This bypasses Windows `fontconfig` crashes (`0xC0000005 ACCESS_VIOLATION` in FFmpeg 8.x) by supplying explicit `fontfile='...'` parameters.
- **Rendering Engine**: Server-side FFmpeg filtergraph engine (`render.py`) with strict CSS-to-FFmpeg hex color conversion (`0xRRGGBB` / `0xRRGGBB@alpha`), multi-track compositing (zooms, B-roll overlays, drawtext captions, screen blends, and mixed audio tracks via `amix`).
- **Database Storage**: Lightweight file-based JSON DB (`db.py`) utilizing atomic write-then-rename operations and UTF-8 encoding to prevent data corruption during unexpected power loss or crashes.

### Frontend
- **Framework**: React 18 with Vite.
- **State Management**: Zustand centralized store (`editorStore.js`) managing multi-track timeline states, selection, history, and playback.
- **Styling & UI**: Tailwind CSS with custom dark theme aesthetics and Lucide React icons.
- **Playback & Synchronization**: 60Hz `requestAnimationFrame` loop coordinating HTML5 video elements, overlay tracking, and live caption rendering.
- **API Client**: `frontend/src/services/api.js` automatically detects same-origin relative endpoints for both Vite dev proxies and Electron desktop environments, re-anchoring asset URLs as needed.

### Desktop & Packaging Architecture
- **Desktop Shell**: Electron 33+ (`electron/main.js`, `electron/preload.js`).
- **Packaging Tools**: PyInstaller (`backend/build.spec`) creates a standalone Python bundle (`video-editor-backend.exe`), while `electron-builder` packages the React build, the backend executable, and static FFmpeg binaries into an NSIS Windows installer (`AI Video Editor Setup 1.0.0.exe`).
- **Process Orchestration**: On launch, Electron discovers an open localhost port, launches the backend process with `--port <port>`, polls `/api/health` until ready, and loads the frontend. FastAPI directly serves the React SPA production build via `spa` fallback routing.
- **Data Isolation**: Application executable files remain read-only, while all projects, media uploads, rendered exports, logs, and API settings are isolated in `%LOCALAPPDATA%\AI Video Editor\`. Upgrades never overwrite user projects.

---

## ⚡ Key Features

1. **Project Management**: Create, list, rename, and delete short-form video projects with customizable resolutions (`9:16`, `16:9`, `1:1`, `4:5`) and frame rates (`30fps`, `60fps`).
2. **Media Upload & Range-Aware Streaming**: Ingest user video/audio files with automated duration, dimension, and codec resolution probing using `ffprobe`. Video playback and scrubbing utilize HTTP 206 Partial Content byte-range streaming for instantaneous response.
3. **Word-Level Speech Transcription**: Audio extraction to mono 16kHz WAV and precise timestamp generation down to individual words using Groq Whisper, supporting optional language codes.
4. **Automated Styled Captions & Local Font Engine**: Generate styled multi-word or single-word captions (Hormozi style, Viral, TikTok, Podcast) with customizable fonts, highlight colors, WebKit stroke outlines, background boxes, positioning, and animation effects (`fade`, `pop`, `bounce`, `karaoke`, `word_by_word`, `slide_up`). Rendered server-side via TrueType fontfiles resolved directly from the local font registry.
5. **Submagic-Style Video Preset System**:
   - Templates act as complete editing presets defining Captions, B-roll, Overlays, Camera Zooms, Transitions, Audio ducking, and Layout safe areas.
   - Core principle: **AI decides WHERE and WHEN. Template decides HOW. Timeline stores WHAT is rendered.**
   - Includes 10 complete presets in `templates/library/`: Bold Viral, Viral, Podcast, YouTube Shorts, Instagram Reels, TikTok, Business, Gaming, Education, Split Reaction.
6. **AI Auto-Edit Engine**:
   - Analyzes audio transcripts to extract hooks, titles, and social descriptions.
   - Plans camera punch-in zooms, B-roll stock footage overlays, and caption emphasis.
   - **Google Gemini only** (`gemini-3.8-flash` default via `GEMINI_MODEL`) — the sole AI provider, no fallback.
   - Enforces a **hard validation gate** to filter out overlapping moments, bad timestamps, or invalid zoom scales (`[1.05, 2.0]`).
   - Integrates with the active template via `template_engine.py` to inherit template-specific B-roll reveal animations, layout placement, and zoom scale clamp boundaries.
   - `mode` query param (`zoom` | `broll`) scopes execution so individual tracks can be modified independently.
   - Returns newly downloaded B-roll assets in the timeline update response.
7. **B-roll Library — Image Search / Video Search / Upload Local**:
   - Integrated three-tab panel in `BrollPicker.jsx`.
   - **Image Search** and **Video Search** hit the Pexels API with pagination and thumbnail previews.
   - **Upload Local** allows uploading custom images and video clips directly from the user's filesystem.
   - Unified attachment endpoint (`POST /projects/{id}/broll/attach`) with customizable placement target, duration, screen layout (fullscreen, split-screen, picture-in-picture), and reveal animations.
   - Direct B-roll editing in `Scenes.jsx` with a 3-option dropdown: *Add New B-roll*, *Edit Transition*, and *Delete B-roll*.
8. **AI Stress Text Highlighter** (`stress_words.py`, `StressHighlightModal.jsx`):
   - Automatically detects the most critical stress words in each caption line using a deterministic offline heuristic.
   - Configurable highlight text color, background color, stroke, and font adjustments.
9. **Sound FX (SFX) Library** (`SfxPicker.jsx`, `app/sfx/`, `routers/sfx.py`):
   - Browse bundled audio clips (switches, swooshes, pops, risers) and attach them to the timeline's `sfx` track with custom start times, duration, and volume scaling.
10. **Call-To-Action (CTA) Badges** (`CtaPicker.jsx`): Select and attach graphic overlay badges and engagement stickers directly to the timeline and preview canvas.
11. **Split-Screen B-roll Animation & Parallax Drift**: Main video smoothly shrinks from fullscreen into its complementary half in sync with the B-roll reveal, followed by continuous parallax hold-phase drift (`driftMotion.js` mirrored in `render.py`).
12. **Cover Image Capture**: Scrub the timeline in a dedicated "Cover" preview tab and save the current frame as the dashboard thumbnail via `POST /api/projects/{id}/cover`.
13. **Local Export Engine**:
    - Local multi-track FFmpeg renderer.
    - Supported formats: MP4 (`video/mp4`), WebM (`video/webm`), and animated GIF (`image/gif`).
    - Configurable quality presets (`draft`, `standard`, `high`) and frame rates (`24`, `30`, `60` fps).
14. **In-App API & Settings Management**: Configure Groq, Gemini, and Pexels API keys directly inside the application UI via `SettingsModal.jsx`. Secrets are persisted in user app data and masked when queried.
15. **Zero-Configuration Desktop Packaging**: Windows installer bundling all dependencies, including Python runtime, FastAPI server, React static bundle, and FFmpeg/FFprobe binaries.

---

## 🔌 Backend API Specification

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health check (returns status, version, and frozen flag) |
| `GET` | `/api/system/paths` | System diagnostics showing active resource, user data, database, and binary paths |
| `GET` | `/api/settings` | Read current configuration state (returns masked keys and user data directory) |
| `PUT` | `/api/settings` | Update API keys and model configurations in user data `settings.json` |
| `GET` | `/api/uploads/{filename}` | Range-aware media streaming endpoint with HTTP 206 Partial Content support |
| `GET` | `/api/projects` | List all existing video projects |
| `POST` | `/api/projects` | Create a new video project |
| `GET` | `/api/projects/{id}` | Fetch project details (timeline, assets, transcript) |
| `PATCH` | `/api/projects/{id}` | Rename an existing project |
| `DELETE` | `/api/projects/{id}` | Delete a project and its associated local assets |
| `POST` | `/api/projects/{id}/cover` | Capture frame at given timeline timestamp and set as project cover thumbnail |
| `POST` | `/api/projects/{id}/upload` | Upload video/audio asset file to project with FFprobe probing |
| `POST` | `/api/projects/{id}/transcribe` | Trigger Groq Whisper speech-to-text (supports `language` parameter) |
| `GET` | `/api/projects/{id}/transcript` | Get existing word-level transcript for a project |
| `POST` | `/api/projects/{id}/generate-captions` | Generate timed caption track items from transcript |
| `POST` | `/api/projects/{id}/captions/stress-highlight` | Toggle AI Stress Text Highlighter across caption items |
| `POST` | `/api/projects/{id}/auto-edit` | Execute AI auto-edit analysis & apply edit decisions (`mode=zoom\|broll`) |
| `GET` | `/api/templates` | List all preset video templates (optionally filtered by category) |
| `GET` | `/api/templates/{template_id}` | Get detailed schema for a specific video template |
| `GET` | `/api/templates/thumbnails/{filename}` | Serve static preview thumbnail images for templates |
| `GET` | `/api/templates/overlays/{filename}` | Serve static video overlay loops (film grain, light leaks) |
| `POST` | `/api/templates/reload` | Hot-reload template JSON files from `templates/library/` |
| `POST` | `/api/projects/{id}/apply-template` | Apply preset video template to project |
| `GET` | `/api/broll/search` | Search B-roll Library (`media=video\|image`, `query`, `page`) |
| `POST` | `/api/projects/{id}/broll/attach` | Attach media to B-roll track (`downloadUrl` or `assetId`) |
| `GET` | `/api/sfx` | Fetch bundled sound effects catalog |
| `POST` | `/api/projects/{id}/sfx/attach` | Attach chosen sound effect clip to timeline |
| `POST` | `/api/projects/{id}/export` | Trigger background local FFmpeg export job (format, quality, fps) |
| `GET` | `/api/renders/{job_id}` | Check status and progress of background rendering job |
| `GET` | `/api/download/{filename}` | Download final rendered output file |

---

## ⚙️ Environment Configuration

Configuration can be supplied via a development `.env` file or configured at runtime through the application UI (saved in `settings.json` in the user data directory).

### Configuration Keys & Environment Variables

| Key / Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `GROQ_API_KEY` | Groq API Key for Whisper speech-to-text | Required for transcription |
| `WHISPER_MODEL` | Whisper model ID on Groq | `whisper-large-v3-turbo` |
| `GEMINI_API_KEY` | Google Gemini API Key | **Required** for AI auto-edit (sole provider) |
| `GEMINI_MODEL` | Google Gemini model identifier | `gemini-3.8-flash` |
| `PEXELS_API_KEY` | Pexels API Key for stock media search & downloads | Required for stock B-roll |
| `AIVE_DATA_DIR` | Custom writable user data directory override | Default: `%LOCALAPPDATA%\AI Video Editor` |
| `AIVE_FFMPEG_DIR` | Custom directory containing `ffmpeg.exe` and `ffprobe.exe` | Optional override |
| `RENDER_DEBUG` | Enable verbose FFmpeg filtergraph logging to console | `1` to enable |

---

## 🚀 Running the Application

### Option A: Web Development Mode

#### 1. Backend Server
```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Backend runs at `http://localhost:8000` (API Docs: `http://localhost:8000/docs`).

#### 2. Frontend Development Server
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:5173`.

---

### Option B: Desktop Development Mode (Electron + Vite + Backend)

To test the desktop experience locally with live reloading:

```powershell
# From the repository root
npm install
npm run frontend:install
npm run backend:install

# Fetch bundled FFmpeg if not already present
npm run fetch:ffmpeg

# Run backend, Vite frontend, and Electron concurrently
npm run dev
```

---

### Option C: Building the Windows Installer (`.exe`)

To produce the standalone Windows installer (`AI Video Editor Setup 1.0.0.exe`):

```powershell
# From the repository root
npm install
npm run frontend:install
npm run backend:install

# Ensure FFmpeg binaries are staged in resources/ffmpeg/
npm run fetch:ffmpeg

# Build React app and freeze Python backend with PyInstaller
npm run build:app

# Package installer with electron-builder
npm run dist
```
The resulting installer is saved to the `release/` directory.

---

## ⚠️ Known Gaps & Implementation Notes

- **Template Thumbnails & Overlay Loops on Disk**: Preset JSON definitions in `templates/library/*.json` reference preview thumbnails (`thumbnailUrl`) and video overlay loops (`overlayVideoUrl`). The corresponding directories (`templates/library/thumbnails/` and `templates/library/overlays/`) are served statically, but users should add corresponding media files to these folders for visual previews.
- **FFmpeg Stress Text Box Corner Radius**: `drawtext` in FFmpeg renders background boxes with square corners. The rounded corners and active pop-in animations shown in the HTML5 preview canvas are preview-only styling; the exported MP4 preserves exact fonts, colors, padding, strokes, and positioning as static rendered boxes.
- **Local Font Expansion**: To add additional TrueType fonts to the local rendering engine, place `.ttf` or `.otf` files under `backend/fonts/<FamilyName>/` and register the weight mappings in `backend/fonts/registry.json`.

---

## 📜 Documentation & Reference Files

- [`README.md`](file:///d:/anna/akash_db/files%20%282%29/README.md): Quick start guide and workspace directory overview.
- [`DESKTOP_BUILD.md`](file:///d:/anna/akash_db/files%20%282%29/DESKTOP_BUILD.md): Step-by-step Windows desktop packaging guide, architecture overview, and build checklist.
- [`EXE_BUILD.txt`](file:///d:/anna/akash_db/files%20%282%29/EXE_BUILD.txt): Comprehensive packaging reference, process flow, and troubleshooting details.
- [`FFMPEG.txt`](file:///d:/anna/akash_db/files%20%282%29/FFMPEG.txt): Comprehensive FFmpeg technical reference, version details, filtergraph pipelines, and encoding profiles.
- [`ALGORITHM.txt`](file:///d:/anna/akash_db/files%20%282%29/ALGORITHM.txt): Core mathematical formulas, algorithms, validation gates, and filtergraph rendering pipelines.
- [`.gitignore`](file:///d:/anna/akash_db/files%20%282%29/.gitignore): Comprehensive Git ignore rules for root, backend, frontend, build artifacts, and secrets.
