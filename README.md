# 🎬 AI Short-Form Video Editor

An intelligent, full-stack web application designed for editing short-form vertical video content (TikTok, Instagram Reels, YouTube Shorts, Podcasts, and Explainer videos). 

It features word-level speech transcription via Groq Whisper API, dynamic preset template styling, AI-driven auto-editing (hooks, camera punch-in zooms, B-roll suggestions, caption emphasis), stock video integration via Pexels, interactive React canvas preview with live karaoke captions, and a server-side FFmpeg multi-track filtergraph rendering engine.

> 💡 **Core Architecture Principle:**  
> *"AI decides. Timeline stores. Renderer executes. Preview and export consume the same timeline model."*

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python**: 3.10+
- **Node.js**: 18+ and `npm`
- **FFmpeg & FFprobe**: Installed and available in your system `PATH`

---

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create and activate Python virtual environment
python -m venv venv

# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

#### Environment Variables (`backend/.env`)
Create a `.env` file in the `backend/` directory:

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

#### Run Backend Server
```bash
uvicorn app.main:app --reload --port 8000
```
Backend API will run at `http://localhost:8000` (API Docs: `http://localhost:8000/docs`).

---

### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install node dependencies
npm install

# Start development server
npm run dev
```
Frontend app will run at `http://localhost:5173`.

---

## 📁 Workspace Directory Structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI entrypoint, CORS setup, router inclusion & static mounts
│   │   ├── models.py                # Pydantic data models (Timeline, Track, Item, Project, Asset, Transcript)
│   │   ├── db.py                    # Lightweight file-based JSON DB storage helper
│   │   ├── db.json                  # Local database store for projects & export jobs
│   │   ├── storage.py               # Local media asset manager (Uploads & Render storage)
│   │   ├── transcribe.py            # Audio extraction (FFmpeg) & Groq Whisper transcription API
│   │   ├── caption_templates.py     # Caption generation logic & preset configurations
│   │   ├── ai_edit.py               # AI Auto-edit LLM prompt & hard validation gate
│   │   ├── template_engine.py       # EditDecisions to TimelineItems converter
│   │   ├── render.py                # FFmpeg multi-track filtergraph render engine
│   │   ├── pexels.py                # Pexels stock video search, preview & download manager
│   │   ├── shotstack.py             # Shotstack Cloud API client for cloud video rendering
│   │   ├── shotstack_timeline.py    # Timeline JSON to Shotstack Edit JSON converter
│   │   ├── stress_words.py          # AI Stress Text Highlighter heuristic scoring
│   │   ├── sfx/                     # Bundled sound effects library registry & catalog
│   │   ├── overlays/                # Video overlay filter validation & manager
│   │   ├── routers/
│   │   │   ├── projects.py          # Project management routes (CRUD operations)
│   │   │   ├── upload.py            # Media file upload router with FFprobe metadata extraction
│   │   │   ├── transcription.py     # Speech-to-text trigger router
│   │   │   ├── captions.py          # Caption generation router
│   │   │   ├── auto_edit.py         # AI auto-edit trigger router & Pexels resolution
│   │   │   ├── templates.py         # Video template application router & static media asset server
│   │   │   ├── broll.py             # B-roll search & attach router
│   │   │   ├── sfx.py               # SFX catalog browse & attach router
│   │   │   └── export.py            # Render job router, preflight validator & download handler
│   │   └── templates/
│   │       ├── schema.py            # Pydantic schemas for video templates (Caption, Broll, Overlay)
│   │       ├── registry.py          # Template registry loader & JSON presets parser
│   │       └── library/             # Preset JSON templates (viral, gaming, podcast, business, etc.)
│   │           ├── thumbnails/      # Template preview thumbnails (referenced by thumbnailUrl)
│   │           └── overlays/        # Bundled video overlay loops (light leaks, film grain)
│   ├── .env                         # Backend environment secrets (API Keys)
│   ├── .gitignore                   # Backend git ignore rules
│   ├── diagnose_export.py           # Diagnostic script to run ladder of FFmpeg commands & identify crashes
│   ├── test_shotstack_export.py     # Offline verification script for Shotstack timeline conversion
│   └── requirements.txt             # Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx                 # React entrypoint
│   │   ├── App.jsx                  # Main router setup
│   │   ├── index.css                # Global CSS styles & Tailwind directives
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx        # Project management dashboard & creation modal
│   │   │   └── EditorPage.jsx       # Interactive video editor workspace page
│   │   ├── components/
│   │   │   ├── dashboard/
│   │   │   │   └── CreateProjectModal.jsx # Project creation modal with template & aspect ratio selector
│   │   │   └── editor/
│   │   │       ├── VideoPreview.jsx # HTML5 live preview canvas — captions, zooms, b-roll, and Cover Image tab
│   │   │       ├── Timeline.jsx     # Multi-track timeline control panel wrapper
│   │   │       ├── TimelineTrack.jsx# Track container (video, broll, caption, audio, zoom, overlay, sfx)
│   │   │       ├── TimelineItem.jsx # Draggable/resizable timeline clips
│   │   │       ├── Sidebar.jsx      # Control panel tabs (Captions / Edit Scenes / Trim / SFX / CTA), mounted with CSS toggle
│   │   │       ├── Toolbar.jsx      # Navigation bar (Export modal trigger, Undo/Redo, Save, top tab switcher)
│   │   │       ├── BrollPicker.jsx  # Pexels search grid (Images & Videos) + Upload Local tab
│   │   │       ├── SfxPicker.jsx    # Bundled SFX catalog browser & timeline attacher modal
│   │   │       ├── CtaPicker.jsx    # Call-To-Action stickers & badges picker modal
│   │   │       ├── ExportPanel.jsx  # Dual export modal — Local FFmpeg & Cloud Shotstack, MP4/WebM/GIF, quality, FPS
│   │   │       ├── StressHighlightModal.jsx # AI Stress Text Highlighter style editor modal
│   │   │       ├── TemplateLibrary.jsx # Video style template selector modal
│   │   │       ├── Scenes.jsx       # Sentence-level scene view with b-roll indicator & 3-option dropdown
│   │   │       └── animations/
│   │   │           ├── index.js             # Re-exports BrollAnimation, SplitScreenLayout, compute*Style helpers
│   │   │           ├── BrollAnimation.jsx   # B-roll reveal animation + hold-phase drift
│   │   │           ├── SplitScreenLayout.jsx# Main video split-screen placement & drift
│   │   │           └── driftMotion.js       # Shared drift constants/formula, mirrored in backend/app/render.py
│   │   ├── services/
│   │   │   └── api.js               # Centralized REST API client for backend
│   │   └── stores/
│   │       └── editorStore.js       # Zustand state management for timeline, assets, playback, selection & cover image
│   ├── package.json                 # Node dependencies & scripts
│   ├── tailwind.config.js           # Styling configuration
│   ├── vite.config.js               # Vite build configuration
│   └── .gitignore                   # Frontend git ignore rules
│
├── ALGORITHM.txt                     # Detailed core algorithms & data pipelines document
├── PROJECT.md                       # Comprehensive architecture & API documentation
└── .gitignore                       # Root git ignore rules
```

---

## 🔥 Key Features

1. **Project Management**: Create, list, rename, and delete short-form video projects with custom resolutions (`9:16`, `16:9`, `1:1`, `4:5`) and frame rates (`30fps`, `60fps`).
2. **Media Upload & Asset Probing**: Ingest user video/audio assets with automatic duration, dimension, and codec resolution probing via `ffprobe`.
3. **Word-Level Speech Transcription**: Automatic mono 16kHz audio extraction and timestamp generation down to individual words using Groq Whisper (`whisper-large-v3-turbo`). Includes segment linear interpolation fallback when API word arrays are absent.
4. **Automated Styled Captions**: Generate styled multi-word or single-word captions (Hormozi style, Viral, TikTok, Podcast) with customizable fonts, highlight colors, stroke outlines, background boxes, positioning, and animation effects (`fade`, `pop`, `bounce`, `karaoke`, `word_by_word`, `slide_up`).
5. **Preset Video Template System**: Apply preset video styles (Bold Viral, Podcast, Gaming, TikTok, YouTube Shorts, Instagram Reels, Business, Education) with dynamic layout adjustments, default aspect ratio adjustments, and overlay video loops (film grain, light leaks) using screen blending.
6. **AI Auto-Edit Engine**:
   - Analyzes audio transcripts to extract hooks, titles, and social descriptions.
   - Plans punch-in camera zooms, B-roll stock footage overlays, and caption emphasis.
   - Dual provider engine: OpenRouter (`openai/gpt-4o-mini`) with direct fallback to Google Gemini (`gemini-3.7-flash`).
   - Enforces a **hard validation gate** to filter out overlapping moments, bad timestamps, or invalid zoom scales (`[1.05, 2.0]`).
7. **Pexels Stock B-Roll Search & Library**: Search portrait MP4 stock footage directly from Pexels API, preview thumbnails/video loops in-browser, and attach overlays to timeline tracks manually or via AI.
   - Pick screen layout (Full / Top Split / Bottom Split) and reveal animation manually before attaching (select-then-save, not instant-attach).
   - Already-attached b-roll gets a 3-option dropdown from `Scenes.jsx` — Add New B-roll, Edit Transition, Delete B-roll.
8. **Interactive React Preview & Scenes Panel**:
   - Multi-track HTML5 video preview with synchronized dynamic caption rendering, live zoom scale transforms, and B-roll overlays.
   - Sentence-level transcript scene segmentation view (`Scenes.jsx`) allowing quick manual zoom toggles and targeted B-roll attachment.
   - Sidebar tabs (Captions / Edit Scenes / Trim / SFX / CTA) stay mounted and switch via CSS visibility, preserving each panel's state across tab changes.
9. **Split-screen B-roll animation synced with the main video**: the main video shrinks from fullscreen into its complementary half in sync with the b-roll's own reveal (same timing/easing, edge against the frame boundary always flush so there's never a gap), then both layers keep drifting slowly in the same direction as a subtle continuous parallax once settled. Shared timing constants live in `driftMotion.js` and are mirrored exactly in `render.py` for preview/export parity.
10. **Sound FX (SFX) Library**: Browse bundled audio catalog (switches, swooshes, pops, risers) and attach SFX clips with precise start timing, custom duration, and volume scaling to dedicated timeline tracks.
11. **Call-To-Action (CTA) Overlays**: Pick and place graphic overlay stickers and CTA badges onto the preview canvas and timeline.
12. **Cover Image capture**: scrub the timeline in a dedicated "Cover" tab and save the current frame (via `POST /api/projects/{id}/cover`, reusing the export filtergraph) as the project's dashboard thumbnail.
13. **Dual Export Engine & Preflight Validation**: Export projects using either a local server-side multi-track FFmpeg filtergraph engine or Cloud Shotstack rendering. Supports format selection (`mp4`, `webm`, `gif`), quality levels (`draft`, `standard`, `high`), target frame rates (`24`, `30`, `60` fps), and dry-run preflight validation checks (`/api/projects/{id}/export/preflight`).

---

## 🛠️ Backend API Specification

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health check endpoint |
| `GET` | `/api/projects` | List all existing video projects |
| `POST` | `/api/projects` | Create a new video project |
| `GET` | `/api/projects/{id}` | Fetch project details (timeline, assets, transcript) |
| `PATCH` | `/api/projects/{id}` | Rename an existing project |
| `DELETE` | `/api/projects/{id}` | Delete a project and its associated local assets |
| `POST` | `/api/projects/{id}/cover` | Capture the frame at a given time (via the export filtergraph) and set it as the project's dashboard cover image |
| `POST` | `/api/projects/{id}/upload` | Upload video/audio asset file to project |
| `POST` | `/api/projects/{id}/transcribe` | Trigger Groq Whisper word-level speech-to-text |
| `POST` | `/api/projects/{id}/generate-captions` | Generate timed caption track items |
| `POST` | `/api/projects/{id}/captions/stress-highlight` | Enable/disable AI Stress Text Highlighter |
| `POST` | `/api/projects/{id}/auto-edit` | Execute AI auto-edit analysis & apply edit decisions |
| `GET` | `/api/templates` | List all preset video templates (optionally filtered by category) |
| `GET` | `/api/templates/{template_id}` | Get detailed schema for a specific video template |
| `GET` | `/api/templates/thumbnails/{filename}` | Serve static preview thumbnail images for templates |
| `GET` | `/api/templates/overlays/{filename}` | Serve static video overlay loops (film grain, light leaks) |
| `POST` | `/api/templates/reload` | Hot-reload template JSON files from `templates/library/` |
| `POST` | `/api/projects/{id}/apply-template` | Apply preset video template to project |
| `GET` | `/api/broll/search` | Search Pexels stock video/photo library by keyword (or popular feed) |
| `POST` | `/api/projects/{id}/broll/attach` | Download & attach Pexels clip or local asset to timeline |
| `GET` | `/api/sfx` | Fetch bundled sound effects catalog |
| `POST` | `/api/projects/{id}/sfx/attach` | Attach chosen sound effect clip to timeline |
| `GET` | `/api/export/engines` | List available export engines (Local FFmpeg & Cloud Shotstack) |
| `POST` | `/api/projects/{id}/export/preflight` | Dry-run validation check for Shotstack cloud export |
| `POST` | `/api/projects/{id}/export` | Trigger background export job (engine=`ffmpeg`\|`shotstack`, format, quality, fps) |
| `POST` | `/api/shotstack/webhook` | Webhook callback handler for completed Shotstack cloud renders |
| `GET` | `/api/renders/{job_id}` | Check status and progress of background rendering job |
| `GET` | `/api/download/{filename}` | Download final rendered output file |

---

## 📜 Documentation & Reference Files
- [`PROJECT.md`](file:///d:/anna/akash_db/files%20%282%29/PROJECT.md): Full architectural overview and API details.
- [`FFMPEG.txt`](file:///d:/anna/akash_db/files%20%282%29/FFMPEG.txt): Comprehensive FFmpeg technical reference, version details, filtergraph pipelines, and encoding profiles.
- [`ALGORITHM.txt`](file:///d:/anna/akash_db/files%20%282%29/ALGORITHM.txt): Core mathematical formulas, algorithms, validation gates, and filtergraph rendering pipelines.
- [`.gitignore`](file:///d:/anna/akash_db/files%20%282%29/.gitignore): Comprehensive Git ignore rules for root, backend, and frontend dependencies and secrets.

