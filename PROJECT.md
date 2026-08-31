# 🎬 AI Short-Form Video Editor — Project & Architecture Guide

## 📌 Project Overview
The **AI Short-Form Video Editor** is an intelligent, full-stack web application designed specifically for short-form vertical video content (TikTok, Instagram Reels, YouTube Shorts, Podcasts, and Explainer videos). 

It features word-level speech transcription via Groq Whisper API, dynamic preset template styling, AI-driven auto-editing (hooks, camera punch-in zooms, B-roll suggestions, caption emphasis), stock video integration via Pexels, interactive React canvas preview with live karaoke captions, and a server-side FFmpeg multi-track filtergraph rendering engine.

> 💡 **Core Architecture Principle:**  
> *"AI decides. Timeline stores. Renderer executes. Preview and export consume the same timeline model."*

---

## 📁 Workspace Directory Structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI application entrypoint, CORS setup, router inclusion & static mounts
│   │   ├── models.py                # Pydantic data models (Timeline, Track, Item, Project, Asset, Transcript)
│   │   ├── db.py                    # Lightweight file-based JSON DB storage helper
│   │   ├── db.json                  # Local database store for projects & export jobs
│   │   ├── storage.py               # Local media asset file manager (Uploads & Render storage)
│   │   ├── transcribe.py            # Audio extraction (FFmpeg) & Groq Whisper transcription API (with language parameter)
│   │   ├── caption_templates.py     # Caption generation logic & legacy preset configurations
│   │   ├── ai_edit.py               # AI Auto-edit LLM prompt & hard validation gate (OpenRouter + Gemini fallback)
│   │   ├── template_engine.py       # Decision-to-timeline converter (EditDecisions -> TimelineItems)
│   │   ├── render.py                # FFmpeg multi-track filtergraph render engine for video/audio export
│   │   ├── pexels.py                # Pexels stock VIDEO + PHOTO search, preview, and auto-download manager
│   │   ├── shotstack.py             # Shotstack Cloud API client for cloud video rendering
│   │   ├── shotstack_timeline.py    # Timeline JSON to Shotstack Edit JSON converter & validator
│   │   ├── stress_words.py          # "AI Stress Text Highlighter": deterministic offline heuristic to highlight key words
│   │   ├── sfx/                     # Bundled sound effects library registry & catalog (`sfx` track)
│   │   │   ├── registry.py          # SFX catalog listing, duration probing & URL path resolver
│   │   │   └── library/             # Bundled audio files (switches, pops, swooshes, risers)
│   │   ├── overlays/                # Video overlay filter validation & overlay plan manager
│   │   │   ├── manager.py           # Overlay manager for loading overlay definitions
│   │   │   ├── resolver.py          # Pure resolution function computing overlay start/duration/t-params for FFmpeg
│   │   │   └── validator.py         # Validation rules for overlay assets
│   │   ├── routers/
│   │   │   ├── projects.py          # Project management routes (CRUD operations)
│   │   │   ├── upload.py            # Asset file upload router with FFprobe metadata extraction
│   │   │   ├── transcription.py     # Speech-to-text trigger router
│   │   │   ├── captions.py          # Caption generation router & stress-highlight toggle endpoint
│   │   │   ├── auto_edit.py         # AI auto-edit router & Pexels resolution
│   │   │   ├── templates.py         # Video template application router & static asset serving
│   │   │   ├── broll.py             # B-roll Library router (Pexels search + local asset attach)
│   │   │   ├── sfx.py               # SFX catalog browser & timeline attacher router
│   │   │   └── export.py            # Render job router, preflight validator, Shotstack webhook & file download handler
│   │   └── templates/
│   │       ├── schema.py            # Typed video template Pydantic schemas (CaptionStyle, BrollStyle, OverlayStyle)
│   │       ├── registry.py          # Dynamic template loader & JSON presets parser
│   │       └── library/             # Preset JSON templates (viral, gaming, podcast, business, etc.)
│   │           ├── thumbnails/      # Template preview thumbnails (referenced by thumbnailUrl)
│   │           └── overlays/        # Bundled video overlay loops (light leaks, film grain)
│   ├── .env                         # API keys (GROQ_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY, PEXELS_API_KEY, SHOTSTACK_API_KEY)
│   ├── .gitignore                   # Backend git ignore rules
│   ├── diagnose_export.py           # Diagnostic script to run ladder of FFmpeg commands against input media
│   ├── test_shotstack_export.py     # Offline test suite for Shotstack conversion & validation
│   └── requirements.txt             # Python dependencies (fastapi, uvicorn, pydantic, requests, etc.)
│
└── frontend/
    ├── src/
    │   ├── main.jsx                 # React entrypoint
    │   ├── App.jsx                  # Main router setup
    │   ├── index.css                # Global CSS styles & Tailwind directives
    │   ├── pages/
    │   │   ├── Dashboard.jsx        # Project list, creation modal, project management dashboard
    │   │   └── EditorPage.jsx       # Interactive video editor workspace page
    │   ├── components/
    │   │   ├── dashboard/
    │   │   │   └── CreateProjectModal.jsx # Project creation modal with template & aspect ratio selector
    │   │   └── editor/
    │   │       ├── VideoPreview.jsx # HTML5 live preview canvas — animated captions, zoom transforms, B-roll overlays, Cover Image tab
    │   │       ├── Timeline.jsx     # Multi-track timeline control panel wrapper
    │   │       ├── TimelineTrack.jsx# Individual track container (video, broll, caption, audio, zoom, overlay, sfx)
    │   │       ├── TimelineItem.jsx # Draggable/resizable timeline elements
    │   │       ├── Sidebar.jsx      # Control panel tabs (Captions / Edit Scenes / Trim / SFX / CTA), CSS visibility toggles
    │   │       ├── Toolbar.jsx      # Navigation bar (Export modal trigger, Undo/Redo, Save, top-level tab switcher)
    │   │       ├── BrollPicker.jsx  # B-roll Library modal (Image Search / Video Search / Upload Local)
    │   │       ├── SfxPicker.jsx    # Bundled SFX catalog browser & attacher modal
    │   │       ├── CtaPicker.jsx    # Call-To-Action stickers & badges picker modal
    │   │       ├── ExportPanel.jsx  # Dual export modal — Local FFmpeg & Cloud Shotstack, MP4/WebM/GIF formats, Quality, FPS
    │   │       ├── StressHighlightModal.jsx # AI Stress Text Highlighter style editor modal
    │   │       ├── TemplateLibrary.jsx # Video style template selector modal
    │   │       ├── Scenes.jsx       # Sentence-level scene view with b-roll indicator & 3-option dropdown
    │   │       └── animations/
    │   │           ├── index.js             # Re-exports BrollAnimation, SplitScreenLayout, compute*Style helpers
    │   │           ├── BrollAnimation.jsx   # B-roll reveal animation + hold-phase drift
    │   │           ├── SplitScreenLayout.jsx# Main video split-screen placement & parallax drift
    │   │           └── driftMotion.js       # Shared hold-phase drift constants/formula (mirrored in render.py)
    │   ├── services/
    │   │   └── api.js               # Centralized REST API client for backend endpoints
    │   └── stores/
    │       └── editorStore.js       # Zustand state management store for timeline, playback, selection, cover-image save state
    ├── package.json                 # Node dependencies & scripts
    ├── tailwind.config.js           # Styling configuration
    └── vite.config.js               # Vite build configuration
```

---

## 🛠️ Tech Stack & Architecture

### Backend
- **Framework**: FastAPI (Python 3.10+)
- **Data Validation & Schemas**: Pydantic v2
- **Transcription**: Groq-hosted Whisper API (`whisper-large-v3-turbo`) with word-level timestamps, mono 16kHz audio extraction via FFmpeg, and segment linear interpolation fallback.
- **AI Auto-Edit Engine**: Dual-provider architecture: primary OpenRouter (`openai/gpt-4o-mini`) with direct fallback to Google Gemini (`gemini-3.7-flash`).
- **Stock Media Integration**: Pexels Video API (portrait MP4 filtering, height capping <= 1920p, dual preview/render URL selection) and Pexels Photos API (portrait image search + curated feed) — both power the B-roll Library's Image/Video Search tabs, in addition to the video-only automatic fetch used by AI Auto-Edit.
- **Rendering Engine**: Server-side FFmpeg filtergraph constructing multi-track overlays (zooms, b-roll, captions via `drawtext`, screen blend overlays, mixed audio tracks via `amix`).
- **Cloud Rendering Alternative**: Shotstack Cloud Video API integration (`app/shotstack.py`, `app/shotstack_timeline.py`) converting timeline JSON to Shotstack Edit JSON for distributed cloud rendering with webhooks.
- **Sound & Overlay Subsystems**: Sound Effects catalog registry (`app/sfx/`) and video overlay filter validation manager (`app/overlays/`).
- **Storage & Database**: Local filesystem storage (`backend/app/uploads/`, `backend/app/renders/`) with JSON database (`db.json`).

### Frontend
- **Framework**: React 18 with Vite
- **State Management**: Zustand centralized store (`editorStore.js`)
- **Styling & UI**: Tailwind CSS with custom rich dark theme aesthetics
- **Icons**: Lucide React
- **Playback & Synchronization**: 60Hz `requestAnimationFrame` audio/video position tracking loop.

---

## ⚡ Key Features

1. **Project Management**: Create, list, rename, and delete short-form video projects with customizable resolutions (`9:16`, `16:9`, `1:1`, `4:5`) and frame rates (`30fps`, `60fps`).
2. **Media Upload & Asset Probing**: Ingest user video/audio files with automated duration, dimension, and codec resolution probing using `ffprobe`.
3. **Word-Level Speech Transcription**: Audio extraction to mono 16kHz WAV and precise timestamp generation down to individual words using Groq Whisper, supporting optional language codes.
4. **Automated Styled Captions**: Generate styled multi-word or single-word captions (Hormozi style, Viral, TikTok, Podcast) with customizable fonts, highlight colors, clean WebKit stroke outlines, background boxes, positioning, and animation effects (`fade`, `pop`, `bounce`, `karaoke`, `word_by_word`, `slide_up`).
5. **Submagic-Style Complete Video Preset System**:
   - Templates act as complete editing presets defining Captions, B-roll, Overlays, Camera Zooms, Transitions, Audio ducking, and Layout safe areas.
   - Core principle: **AI decides WHERE and WHEN. Template decides HOW. Timeline stores WHAT is rendered.**
   - Includes 10 complete presets in `templates/library/`: Bold Viral, Viral, Podcast, YouTube Shorts, Instagram Reels, TikTok, Business, Gaming, Education, Split Reaction.
6. **AI Auto-Edit Engine**:
   - Analyzes audio transcripts to extract hooks, titles, and social descriptions.
   - Plans camera punch-in zooms, B-roll stock footage overlays, and caption emphasis.
   - Dual provider engine: OpenRouter (`openai/gpt-4o-mini`) with direct fallback to Google Gemini (`gemini-3.7-flash`).
   - Enforces a **hard validation gate** to filter out overlapping moments, bad timestamps, or invalid zoom scales (`[1.05, 2.0]`).
   - Integrates with the active template via `template_engine.py` to inherit template-specific B-roll reveal animations (`zoom_in`, `slide_down`, `fade_in`, `bounce_in`), layout placement, and zoom scale clamp boundaries.
   - `mode` query param (`zoom` | `broll`) scopes one call to only that moment type, so the Sidebar's "Auto Zooms" and "Auto B-rolls" boost toggles — and Scenes.jsx's "Magic Zooms"/"Magic B-roll" buttons — never touch each other's track.
   - **Downloaded B-roll assets are always returned to the frontend in the same response** that updates the timeline (`assets: [...]` on the `/auto-edit` response).
7. **B-roll Library — Image Search / Video Search / Upload Local** (`BrollPicker.jsx`, `pexels.py`, `routers/broll.py`): a redesigned three-tab panel replacing the old single Pexels-video-only search.
   - **Image Search** and **Video Search** both hit the Pexels API with paginated results grid and numbered pager.
   - **Upload Local** uploads an image or video straight from the user's device.
   - All three sources converge on `POST /projects/{id}/broll/attach` (`downloadUrl` or `assetId`) responding with `{asset, item, timeline}`.
   - Shared right-side panel: Placement Target, Duration controls, Screen Layout, Reveal Animation, Lightbox Preview, and Add to Timeline.
   - **Edit attached B-roll from `Scenes.jsx`**: 3-option dropdown — *Add New B-roll*, *Edit Transition*, and *Delete B-roll*.
8. **AI Stress Text Highlighter** (`stress_words.py`, `StressHighlightModal.jsx`): automatically detects the most important/"stress" words in each caption line using a deterministic offline heuristic and applies distinct text/background/stroke/animation styles.
9. **Sound FX (SFX) Library** (`SfxPicker.jsx`, `app/sfx/`, `routers/sfx.py`): browse bundled audio clips (switches, swooshes, pops, risers) and attach them to the timeline's `sfx` track with custom start times, duration, and volume scaling.
10. **Call-To-Action (CTA) Badges** (`CtaPicker.jsx`): select and attach graphic overlay badges and engagement stickers directly to the timeline and preview canvas.
11. **Split-screen B-roll animation, synced with the main video**: main video shrinks from fullscreen into its complementary half in sync with the b-roll's reveal, followed by continuous parallax hold-phase drift (`driftMotion.js` mirrored in `render.py`).
12. **Cover Image capture**: scrub the timeline in a dedicated "Cover" preview tab and save the current frame as the dashboard thumbnail via `POST /api/projects/{id}/cover`.
13. **Dual Export Engine & Preflight Validation** (`ExportPanel.jsx`, `render.py`, `shotstack.py`, `shotstack_timeline.py`, `routers/export.py`):
    - Export using local multi-track FFmpeg renderer or Shotstack cloud rendering engine.
    - Export format choices: MP4 (`video/mp4`), WebM (`video/webm`), or animated GIF (`image/gif`).
    - Export quality presets (`draft`, `standard`, `high`) and custom target frame rates (`24`, `30`, `60` fps).
    - Preflight dry-run validation (`POST /api/projects/{id}/export/preflight`) to detect any timeline features incompatible with cloud rendering before submitting a job.

---

## 🔌 Backend API Specification

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health check endpoint |
| `GET` | `/api/projects` | List all existing video projects |
| `POST` | `/api/projects` | Create a new video project |
| `GET` | `/api/projects/{id}` | Fetch project details (timeline, assets, transcript) |
| `PATCH` | `/api/projects/{id}` | Rename an existing project |
| `DELETE` | `/api/projects/{id}` | Delete a project and its associated local assets |
| `POST` | `/api/projects/{id}/cover` | Capture the frame at a given timeline time (via the export filtergraph) and set it as the project's dashboard cover image |
| `POST` | `/api/projects/{id}/upload` | Upload video/audio asset file to project |
| `POST` | `/api/projects/{id}/transcribe` | Trigger Groq Whisper word-level speech-to-text (supports `language` query param) |
| `GET` | `/api/projects/{id}/transcript` | Get existing transcript for a project |
| `POST` | `/api/projects/{id}/generate-captions` | Generate timed caption track items from transcript |
| `POST` | `/api/projects/{id}/captions/stress-highlight` | Enable/disable AI Stress Text Highlighter across caption items |
| `POST` | `/api/projects/{id}/auto-edit` | Execute AI auto-edit analysis & apply edit decisions (`mode=zoom\|broll`) |
| `GET` | `/api/templates` | List all preset video templates (optionally filtered by category) |
| `GET` | `/api/templates/{template_id}` | Get detailed schema for a specific video template |
| `GET` | `/api/templates/thumbnails/{filename}` | Serve static preview thumbnail images for templates |
| `GET` | `/api/templates/overlays/{filename}` | Serve static video overlay loops (film grain, light leaks) |
| `POST` | `/api/templates/reload` | Hot-reload template JSON files from `templates/library/` |
| `POST` | `/api/projects/{id}/apply-template` | Apply preset video template to project |
| `GET` | `/api/broll/search` | Search the B-roll Library (`media=video\|image`, `query`, `page`) |
| `POST` | `/api/projects/{id}/broll/attach` | Attach media to broll track (`downloadUrl` or `assetId`) |
| `GET` | `/api/sfx` | Fetch bundled sound effects catalog |
| `POST` | `/api/projects/{id}/sfx/attach` | Attach chosen sound effect clip to timeline |
| `GET` | `/api/export/engines` | List available rendering engines (Local FFmpeg & Cloud Shotstack) |
| `POST` | `/api/projects/{id}/export/preflight` | Perform dry-run conversion validation check for Shotstack cloud export |
| `POST` | `/api/projects/{id}/export` | Trigger background export job (engine=`ffmpeg`\|`shotstack`, format, quality, fps) |
| `POST` | `/api/shotstack/webhook` | Receive webhook notifications for completed Shotstack cloud renders |
| `GET` | `/api/renders/{job_id}` | Check status and progress of background rendering job |
| `GET` | `/api/download/{filename}` | Download final rendered output file |

---

## ⚠️ Known Gaps

- **Template thumbnails/overlays are unresolved on disk.** Every preset in `templates/registry.py` / `templates/library/*.json` sets `thumbnailUrl` (e.g. `/api/templates/thumbnails/split_reaction.jpg`) and most set `overlayVideoUrl` (e.g. `/api/templates/overlays/split_reaction.mp4`), and `main.py` mounts `templates/library/thumbnails/` and `templates/library/overlays/` as static dirs to serve them — but neither directory (nor any file in them) currently exists in the repo.
- **AI Stress Text Highlighter's corner radius & highlight animation are preview-only.** `ffmpeg drawtext` has no native rounded-rectangle or per-word animation support, so the exported MP4 renders each stress word's color/background/stroke/font/padding exactly as previewed but as a static, square-cornered box.

---

## ⚙️ Environment Configuration (`backend/.env`)

```env
# Speech Transcription (Groq Console: https://console.groq.com)
GROQ_API_KEY=your_groq_api_key
WHISPER_MODEL=whisper-large-v3-turbo

# AI Auto-Edit (OpenRouter or Google Gemini)
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-4o-mini
# OR
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.7-flash

# Stock Media Library (Pexels API: https://www.pexels.com/api/)
PEXELS_API_KEY=your_pexels_api_key

# Shotstack Cloud Rendering (Optional cloud MP4 rendering engine)
SHOTSTACK_API_KEY=your_shotstack_api_key
SHOTSTACK_ENV=stage # stage = free sandbox (watermarked), v1 = production
SHOTSTACK_CALLBACK_BASE= # Optional public HTTPS base URL for render completion webhooks
```

---

## 🚀 Running the Application

### 1. Start Backend Server
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

### 2. Start Frontend Application
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:5173`.

---

## 📜 Documentation & Reference Files
- [`README.md`](file:///d:/anna/akash_db/files%20%282%29/README.md): Quick start guide and workspace directory overview.
- [`FFMPEG.txt`](file:///d:/anna/akash_db/files%20%282%29/FFMPEG.txt): Comprehensive FFmpeg technical reference, version details, filtergraph pipelines, and encoding profiles.
- [`ALGORITHM.txt`](file:///d:/anna/akash_db/files%20%282%29/ALGORITHM.txt): Core mathematical formulas, algorithms, validation gates, and filtergraph rendering pipelines.
- [`.gitignore`](file:///d:/anna/akash_db/files%20%282%29/.gitignore): Comprehensive Git ignore rules for root, backend, and frontend dependencies and secrets.
