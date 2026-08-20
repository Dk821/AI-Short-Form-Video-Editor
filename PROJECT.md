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
│   │   ├── pexels.py                # Pexels stock video search, preview, and auto-download manager
│   │   ├── routers/
│   │   │   ├── projects.py          # Project management routes (CRUD operations)
│   │   │   ├── upload.py            # Video/audio asset file upload router with FFprobe metadata extraction
│   │   │   ├── transcription.py     # Speech-to-text trigger router
│   │   │   ├── captions.py          # Caption generation router
│   │   │   ├── auto_edit.py         # AI auto-edit router & Pexels resolution
│   │   │   ├── templates.py         # Video template application router & static asset serving
│   │   │   ├── broll.py             # Manual B-roll search & attach router
│   │   │   └── export.py            # Background render job router & file download handler
│   │   └── templates/
│   │       ├── schema.py            # Typed video template Pydantic schemas (CaptionStyle, BrollStyle, OverlayStyle)
│   │       ├── registry.py          # Dynamic template loader & JSON presets parser
│   │       └── library/             # Preset JSON templates (viral, gaming, podcast, business, etc.)
│   │           ├── thumbnails/      # Template preview thumbnails (referenced by thumbnailUrl; not yet present on disk — see Known Gaps)
│   │           └── overlays/        # Bundled video overlay loops (light leaks, film grain) — same gap as above
│   ├── .env                         # API keys (GROQ_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY, PEXELS_API_KEY)
│   └── requirements.txt             # Python dependencies (fastapi, uvicorn, pydantic, requests, etc.)
│
└── frontend/
    ├── src/
    │   ├── main.jsx                 # React entrypoint
    │   ├── App.jsx                  # Main router setup
    │   ├── index.css                # Global CSS styles & Tailwind directives
    │   ├── pages/
    │   │   ├── Dashboard.jsx        # Project list, creation modal, project management dashboard (shows project.coverImage when set)
    │   │   └── EditorPage.jsx       # Interactive video editor workspace page
    │   ├── components/
    │   │   ├── dashboard/
    │   │   │   └── CreateProjectModal.jsx # Project creation modal with template & aspect ratio selector
    │   │   └── editor/
    │   │       ├── VideoPreview.jsx # HTML5 live preview canvas — animated captions, zoom transforms, B-roll overlays, and the Cover Image scrub/save tab
    │   │       ├── Timeline.jsx     # Multi-track timeline control panel wrapper (currently dead code — not imported/rendered anywhere; Scenes.jsx is the live per-scene b-roll UI)
    │   │       ├── TimelineTrack.jsx# Individual track container (video, broll, caption, audio, zoom, overlay) — see note above
    │   │       ├── TimelineItem.jsx # Draggable/resizable timeline elements — see note above
    │   │       ├── Sidebar.jsx      # Control panel tabs (Captions / Edit Scenes / Trim); all three panels stay mounted and are shown/hidden via CSS so switching tabs doesn't lose in-progress state
    │   │       ├── Toolbar.jsx      # Navigation bar (Export, Undo/Redo, Save, top-level tab switcher mirroring Sidebar's tabs)
    │   │       ├── BrollPicker.jsx  # Pexels B-roll search grid — pick a clip + reveal animation + screen layout, then an explicit "Save B-roll" button attaches it (no longer instant-attach-on-click)
    │   │       ├── TemplateLibrary.jsx # Video style template selector modal
    │   │       ├── Scenes.jsx       # Sentence-level scene view; the per-scene b-roll indicator opens a picker when empty, or a 3-option dropdown (Add New / Edit Transition / Delete) when a b-roll is already attached
    │   │       └── animations/
    │   │           ├── index.js             # Re-exports BrollAnimation, SplitScreenLayout, and their compute*Style helpers
    │   │           ├── BrollAnimation.jsx   # B-roll reveal animation (slide/fade/zoom/wipe/bounce) + continuous hold-phase drift once revealed
    │   │           ├── SplitScreenLayout.jsx# Main video's split-screen placement — shrinks from fullscreen into its half in sync with the b-roll's reveal, plus its own hold-phase parallax drift
    │   │           └── driftMotion.js       # Shared "hold-phase drift" constants/formula (mirrored exactly in backend/app/render.py) so preview and export move identically
    │   ├── services/
    │   │   └── api.js               # Centralized REST API client for backend endpoints (incl. setCover)
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
- **Stock Media Integration**: Pexels Video API (portrait MP4 filtering, height capping <= 1920p, dual preview/render URL selection).
- **Rendering Engine**: Server-side FFmpeg filtergraph constructing multi-track overlays (zooms, b-roll, captions via `drawtext`, screen blend overlays, mixed audio tracks via `amix`).
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
7. **Pexels Stock B-Roll Search & Library**: Search portrait MP4 stock footage directly from Pexels API, preview thumbnails/video loops in-browser, and attach overlays to timeline tracks manually or via AI with automatic template default inheritance.
   - **Manual layout + animation control at attach time** (`BrollPicker.jsx`): alongside the AI-suggested reveal animation, users can pick the b-roll's screen layout (Full Screen / Top Split / Bottom Split) and reveal animation before attaching, mirrored by the same options when editing an already-placed clip.
   - **Select-then-save flow**: clicking a search result selects it (visual ring + checkmark) rather than attaching immediately; an explicit "Save B-roll" button performs the attach once the layout/animation choice is confirmed.
   - **Edit an already-attached b-roll from `Scenes.jsx`**: clicking a scene's b-roll indicator when a clip is already attached opens a 3-option dropdown — *Add New B-roll*, *Edit Transition* (inline reveal-animation / layout / speed editor operating on the existing item via `updateItem`), and *Delete B-roll* — instead of always reopening the picker.
8. **Interactive React Preview & Scenes Panel**:
   - Multi-track HTML5 video preview (`VideoPreview.jsx`) with synchronized dynamic caption rendering, live zoom scale transforms, template overlay loops, and split-screen duet/reaction layout positioning (`SplitScreenLayout.jsx`).
   - Centralized Zustand store resolution via `currentTemplate()` helper in `editorStore.js` ensuring safe template metadata resolution and error-free canvas rendering.
   - Sentence-level transcript scene segmentation view (`Scenes.jsx`) allowing quick manual zoom toggles and targeted B-roll attachment.
   - **Sidebar tabs stay mounted** (Captions / Edit Scenes / Trim in `Sidebar.jsx`) and are toggled via CSS instead of being unmounted/remounted, so switching tabs is instant and preserves each panel's in-progress state; the shared scroll container resets to the top on every tab change.
9. **Split-screen B-roll animation, synced with the main video** (`animations/BrollAnimation.jsx`, `animations/SplitScreenLayout.jsx`, `animations/driftMotion.js`, mirrored in `render.py`):
   - The main video shrinks from fullscreen into its complementary half in sync with the b-roll's own reveal (same start time, duration, easing) instead of hard-cutting to half height the instant the item goes active.
   - The edge of the main video against the outer frame boundary always stays flush with the screen edge, so there is never a moment of exposed empty space mid-transition — only the edge facing the split boundary advances, which reads as the main video moving in the same direction the b-roll is revealing.
   - Once fully revealed, both the b-roll and the main video keep drifting slowly in that same direction (a subtle continuous parallax, main video moving at a reduced amplitude relative to the b-roll) instead of freezing solid — timing/easing constants live once in `driftMotion.js` and are mirrored exactly in the FFmpeg export.
10. **Cover Image capture**: a dedicated "Cover" preview tab lets the user scrub the timeline (including whatever b-roll/split layer is active at that instant) and save the current frame as the project's dashboard thumbnail via `POST /api/projects/{id}/cover`, which reuses the export filtergraph (`render.py`'s `capture_frame`) so the captured frame is pixel-identical to what export would produce at that timestamp.
11. **Server-Side FFmpeg Exporter**: Background multi-track video renderer generating high-quality MP4 exports using a single FFmpeg filtergraph with zoom punch-ins, B-roll overlays, text drawtext filters, and mixed audio tracks. Template ambient overlays (light leaks/grain) play as short 2–3s bursts once or twice across the video instead of for the full duration (`_overlay_burst_windows` in `routers/templates.py`).

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
| `POST` | `/api/projects/{id}/auto-edit` | Execute AI auto-edit analysis & apply edit decisions |
| `GET` | `/api/templates` | List all preset video templates (optionally filtered by category) |
| `GET` | `/api/templates/{template_id}` | Get detailed schema for a specific video template |
| `GET` | `/api/templates/thumbnails/{filename}` | Serve static preview thumbnail images for templates |
| `GET` | `/api/templates/overlays/{filename}` | Serve static video overlay loops (film grain, light leaks) |
| `POST` | `/api/templates/reload` | Hot-reload template JSON files from `templates/library/` |
| `POST` | `/api/projects/{id}/apply-template` | Apply preset video template to project |
| `GET` | `/api/broll/search` | Search Pexels stock video library by keyword (or popular feed) |
| `POST` | `/api/projects/{id}/broll/attach` | Download & attach Pexels clip to timeline |
| `POST` | `/api/projects/{id}/export` | Trigger background FFmpeg render export job |
| `GET` | `/api/renders/{job_id}` | Check status and progress of background rendering job |
| `GET` | `/api/download/{filename}` | Download final rendered output MP4 file |

---

## ⚠️ Known Gaps

- **Template thumbnails/overlays are unresolved on disk.** Every preset in `templates/registry.py` / `templates/library/*.json` sets `thumbnailUrl` (e.g. `/api/templates/thumbnails/split_reaction.jpg`) and most set `overlayVideoUrl` (e.g. `/api/templates/overlays/split_reaction.mp4`), and `main.py` mounts `templates/library/thumbnails/` and `templates/library/overlays/` as static dirs to serve them — but neither directory (nor any file in them) currently exists in the repo. Template picker cards and the ambient overlay effect have nothing to actually load until real thumbnail JPGs and overlay MP4s are added at those paths.

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
