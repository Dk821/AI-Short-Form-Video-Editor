# 🎬 AI Short-Form Video Editor

An intelligent, full-stack web application designed for editing short-form vertical video content (TikTok, Instagram Reels, YouTube Shorts, Podcasts, and Explainer videos). 

It features word-level speech transcription via Groq Whisper API, dynamic preset template styling, AI-driven auto-editing (hooks, camera punch-in zooms, B-roll suggestions, caption emphasis), stock video integration via Pexels, interactive React canvas preview, and a server-side FFmpeg multi-track filtergraph rendering engine.

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
GEMINI_MODEL=gemini-2.0-flash

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
│   │   ├── main.py                  # FastAPI application entrypoint & CORS setup
│   │   ├── models.py                # Pydantic data models (Timeline, Track, Item, Project, Asset)
│   │   ├── db.py                    # Lightweight file-based JSON DB storage helper
│   │   ├── db.json                  # Local database store for projects & export jobs
│   │   ├── storage.py               # Local media asset manager (Uploads & Render storage)
│   │   ├── transcribe.py            # Audio extraction (FFmpeg) & Groq Whisper transcription API
│   │   ├── caption_templates.py     # Caption generation logic & preset configurations
│   │   ├── ai_edit.py               # AI Auto-edit LLM prompt & hard validation gate
│   │   ├── template_engine.py       # EditDecisions to TimelineItems converter
│   │   ├── render.py                # FFmpeg multi-track filtergraph render engine
│   │   ├── pexels.py                # Pexels stock video search, preview & download
│   │   ├── routers/
│   │   │   ├── projects.py          # Project management routes (CRUD)
│   │   │   ├── upload.py            # Media file upload router
│   │   │   ├── transcription.py     # Speech-to-text trigger router
│   │   │   ├── captions.py          # Caption generation router
│   │   │   ├── auto_edit.py         # AI auto-edit trigger router
│   │   │   ├── templates.py         # Video template application router
│   │   │   ├── broll.py             # B-roll search & attach router
│   │   │   └── export.py            # Render job router & file download handler
│   │   └── templates/
│   │       ├── schema.py            # Pydantic schemas for video templates
│   │       ├── registry.py          # Template registry loader & JSON presets
│   │       └── library/             # Preset JSON templates (viral, gaming, podcast, etc.)
│   ├── .env                         # Backend environment secrets (API Keys)
│   ├── .gitignore                   # Backend git ignore rules
│   └── requirements.txt             # Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx                 # React entrypoint
│   │   ├── App.jsx                  # Main router setup
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx        # Project management dashboard & creation modal
│   │   │   └── EditorPage.jsx       # Interactive video editor workspace
│   │   ├── components/
│   │   │   └── editor/
│   │   │       ├── VideoPreview.jsx # HTML5 live preview canvas with animated captions & zooms
│   │   │       ├── Timeline.jsx     # Multi-track timeline control panel
      │   │       ├── TimelineTrack.jsx# Track container (video, broll, caption, audio, zoom)
│   │   │       ├── TimelineItem.jsx # Draggable/resizable timeline clips
│   │   │       ├── Sidebar.jsx      # Control panel for Templates, Captions, AI Edit, B-roll
│   │   │       ├── Toolbar.jsx      # Navigation bar (Export, Undo/Redo, Split, Title)
│   │   │       ├── BrollPicker.jsx  # Pexels stock video search grid & thumbnail previewer
│   │   │       └── TemplateLibrary.jsx # Video style template selector modal
│   │   ├── services/
│   │   │   └── api.js               # Centralized REST API client for backend
│   │   └── stores/
│   │       └── editorStore.js       # Zustand state management for timeline & playback
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
3. **Word-Level Speech Transcription**: Automatic mono 16kHz audio extraction and timestamp generation down to individual words using Groq Whisper (`whisper-large-v3-turbo`).
4. **Automated Styled Captions**: Generate styled multi-word or single-word captions (Hormozi style, Viral, TikTok, Podcast) with customizable fonts, highlight colors, and outline strokes.
5. **Preset Video Template System**: Apply preset video styles (Bold Viral, Podcast, Gaming, TikTok, YouTube Shorts, Instagram Reels, Business, Education) with dynamic layout adjustments.
6. **AI Auto-Edit Engine**:
   - Analyzes audio transcripts to extract hooks, titles, and social descriptions.
   - Plans punch-in camera zooms, B-roll stock footage overlays, and caption emphasis.
   - Enforces a **hard validation gate** to filter out overlapping or invalid edit timestamps.
7. **Pexels Stock B-Roll Search**: Search portrait MP4 stock footage directly from Pexels API and attach overlays to timeline tracks.
8. **Interactive React Preview**: Multi-track HTML5 video preview with synchronized dynamic caption rendering, zoom scale transforms, and B-roll overlays.
9. **Server-Side FFmpeg Exporter**: Background multi-track video renderer generating high-quality MP4 exports using a single FFmpeg filtergraph.

---

## 🛠️ Backend API Specification

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health check |
| `GET` | `/api/projects` | List all existing projects |
| `POST` | `/api/projects` | Create a new video project |
| `GET` | `/api/projects/{id}` | Fetch project details (timeline, assets, transcript) |
| `PATCH` | `/api/projects/{id}` | Rename an existing project |
| `DELETE` | `/api/projects/{id}` | Delete a project and its assets |
| `POST` | `/api/projects/{id}/upload` | Upload video/audio asset to project |
| `POST` | `/api/projects/{id}/transcribe` | Trigger Groq Whisper word-level transcription |
| `POST` | `/api/projects/{id}/generate-captions` | Generate timed caption track items |
| `POST` | `/api/projects/{id}/auto-edit` | Execute AI auto-edit analysis & apply decisions |
| `GET` | `/api/templates` | List all preset video templates |
| `POST` | `/api/projects/{id}/apply-template` | Apply preset video template to project |
| `GET` | `/api/broll/search` | Search Pexels stock video library by keyword |
| `POST` | `/api/projects/{id}/broll/attach` | Download & attach Pexels clip to timeline |
| `POST` | `/api/projects/{id}/export` | Trigger background FFmpeg render export job |
| `GET` | `/api/renders/{job_id}` | Check status and progress of rendering job |
| `GET` | `/api/download/{filename}` | Download final rendered output MP4 |

---

## 📜 Documentation & Reference Files
- [`PROJECT.md`](file:///c:/Users/DK/Downloads/akash_db/files%20%282%29/PROJECT.md): Full architectural overview and API details.
- [`ALGORITHM.txt`](file:///c:/Users/DK/Downloads/akash_db/files%20%282%29/ALGORITHM.txt): Core mathematical formulas, algorithms, validation gates, and FFmpeg filtergraph rendering pipelines.
- [`.gitignore`](file:///c:/Users/DK/Downloads/akash_db/files%20%282%29/.gitignore): Comprehensive Git ignore rules for root, backend, and frontend dependencies and secrets.
