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
│   │   ├── routers/
│   │   │   ├── projects.py          # Project management routes (CRUD operations)
│   │   │   ├── upload.py            # Media file upload router with FFprobe metadata extraction
│   │   │   ├── transcription.py     # Speech-to-text trigger router
│   │   │   ├── captions.py          # Caption generation router
│   │   │   ├── auto_edit.py         # AI auto-edit trigger router & Pexels resolution
│   │   │   ├── templates.py         # Video template application router & static media asset server
│   │   │   ├── broll.py             # B-roll search & attach router
│   │   │   └── export.py            # Render job router & file download handler
│   │   └── templates/
│   │       ├── schema.py            # Pydantic schemas for video templates (Caption, Broll, Overlay)
│   │       ├── registry.py          # Template registry loader & JSON presets parser
│   │       └── library/             # Preset JSON templates (viral, gaming, podcast, business, etc.)
│   │           ├── thumbnails/      # Template preview thumbnails
│   │           └── overlays/        # Bundled video overlay loops (light leaks, film grain)
│   ├── .env                         # Backend environment secrets (API Keys)
│   ├── .gitignore                   # Backend git ignore rules
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
│   │   │       ├── VideoPreview.jsx # HTML5 live preview canvas with animated captions & zooms
│   │   │       ├── Timeline.jsx     # Multi-track timeline control panel wrapper
│   │   │       ├── TimelineTrack.jsx# Track container (video, broll, caption, audio, zoom, overlay)
│   │   │       ├── TimelineItem.jsx # Draggable/resizable timeline clips
│   │   │       ├── Sidebar.jsx      # Control panel for Templates, Captions, AI Edit, B-roll, Assets
│   │   │       ├── Toolbar.jsx      # Navigation bar (Export, Undo/Redo, Split, Title)
│   │   │       ├── BrollPicker.jsx  # Pexels stock video search grid & thumbnail previewer modal
│   │   │       ├── TemplateLibrary.jsx # Video style template selector modal
│   │   │       └── Scenes.jsx       # Sentence-level scene segmentation & manual zoom/broll trigger
│   │   ├── services/
│   │   │   └── api.js               # Centralized REST API client for backend
│   │   └── stores/
│   │       └── editorStore.js       # Zustand state management for timeline, assets, playback & selection
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
8. **Interactive React Preview & Scenes Panel**:
   - Multi-track HTML5 video preview with synchronized dynamic caption rendering, live zoom scale transforms, and B-roll overlays.
   - Sentence-level transcript scene segmentation view (`Scenes.jsx`) allowing quick manual zoom toggles and targeted B-roll attachment.
9. **Server-Side FFmpeg Exporter**: Background multi-track video renderer generating high-quality MP4 exports using a single FFmpeg filtergraph with zoom punch-ins, B-roll overlays, text drawtext filters, and mixed audio tracks.

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
| `POST` | `/api/projects/{id}/upload` | Upload video/audio asset file to project |
| `POST` | `/api/projects/{id}/transcribe` | Trigger Groq Whisper word-level speech-to-text |
| `POST` | `/api/projects/{id}/generate-captions` | Generate timed caption track items |
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

## 📜 Documentation & Reference Files
- [`PROJECT.md`](file:///c:/Users/DK/Downloads/akash_db/files%20%282%29/PROJECT.md): Full architectural overview and API details.
- [`ALGORITHM.txt`](file:///c:/Users/DK/Downloads/akash_db/files%20%282%29/ALGORITHM.txt): Core mathematical formulas, algorithms, validation gates, and FFmpeg filtergraph rendering pipelines.
- [`.gitignore`](file:///c:/Users/DK/Downloads/akash_db/files%20%282%29/.gitignore): Comprehensive Git ignore rules for root, backend, and frontend dependencies and secrets.
