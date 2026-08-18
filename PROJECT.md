# AI Short-Form Video Editor

## Project Overview
The **AI Short-Form Video Editor** is a web-based, full-stack video editing application designed specifically for short-form vertical content (TikTok, Instagram Reels, YouTube Shorts, Podcasts, and Explainer videos). It features word-level speech transcription, dynamic template styling, AI-driven auto-editing (hooks, zooms, B-roll suggestions, caption emphasis), stock video integration via Pexels, and a server-side FFmpeg rendering engine.

The core architecture follows the principle:
> **"AI decides. Timeline stores. Renderer executes. Preview and export consume the same timeline model."**

---

## Workspace Directory Structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI application entrypoint & routing setup
│   │   ├── models.py                # Pydantic data models (Timeline, Track, Item, Project, Asset)
│   │   ├── db.py                    # Lightweight file-based JSON DB storage helper
│   │   ├── db.json                  # Local database store for projects & export jobs
│   │   ├── storage.py               # Local media asset file manager (Uploads & Render storage)
│   │   ├── transcribe.py            # Audio extraction (FFmpeg) & Groq Whisper transcription API
│   │   ├── caption_templates.py     # Caption generation logic & legacy preset configurations
│   │   ├── ai_edit.py               # AI Auto-edit LLM prompt & hard validation gate
│   │   ├── template_engine.py       # Decision-to-timeline converter (EditDecisions -> TimelineItems)
│   │   ├── render.py                # FFmpeg filtergraph render engine for video/audio export
│   │   ├── pexels.py                # Pexels stock video search, preview, and auto-download
│   │   ├── routers/
│   │   │   ├── projects.py          # Project management routes (CRUD)
│   │   │   ├── upload.py            # Video/audio asset file upload router
│   │   │   ├── transcription.py     # Speech-to-text trigger router
│   │   │   ├── captions.py          # Caption generation router
│   │   │   ├── auto_edit.py         # AI auto-edit router
│   │   │   ├── templates.py         # Video template application router
│   │   │   ├── broll.py             # Manual B-roll search & attach router
│   │   │   └── export.py            # Background render job router & download handler
│   │   └── templates/
│   │       ├── schema.py            # Typed video template Pydantic schemas (CaptionStyle, BrollStyle)
│   │       └── registry.py          # Preset video template registry (Viral, Podcast, Shorts, etc.)
│   ├── .env                         # API keys (GROQ_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY, PEXELS_API_KEY)
│   └── requirements.txt             # Python dependencies (fastapi, uvicorn, pydantic, requests, etc.)
│
└── frontend/
    ├── src/
    │   ├── main.jsx                 # React entrypoint
    │   ├── App.jsx                  # Main router setup
    │   ├── pages/
    │   │   ├── Dashboard.jsx        # Project list, creation modal, project management dashboard
    │   │   └── EditorPage.jsx       # Interactive video editor workspace
    │   ├── components/
    │   │   └── editor/
    │   │       ├── VideoPreview.jsx # Live interactive browser canvas preview with karaoke animations
    │   │       ├── Timeline.jsx     # Multi-track timeline control panel
    │   │       ├── TimelineTrack.jsx# Individual track container (video, broll, caption, audio, zoom)
    │   │       ├── TimelineItem.jsx # Draggable/resizable timeline elements
    │   │       ├── Sidebar.jsx      # Control panel for Templates, Captions, AI Auto-Edit, B-roll, Assets
    │   │       ├── Toolbar.jsx      # Header actions (Project title, Export, Split, Undo/Redo)
    │   │       ├── BrollPicker.jsx  # Pexels B-roll search grid & thumbnail previewer
    │   │       ├── TemplateLibrary.jsx # Template picker modal / panel
    │   │       └── Scenes.jsx       # Scene breakdown view
    │   ├── services/
    │   │   └── api.js               # Centralized REST API client for backend endpoints
    │   └── stores/
    │       └── editorStore.js       # Zustand state management store for timeline, playback, selection
    ├── package.json                 # Frontend dependencies & scripts
    ├── tailwind.config.js           # Styling configuration
    └── vite.config.js               # Vite build configuration
```

---

## Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.10+)
- **Data Models**: Pydantic v2
- **Transcription**: Groq hosted Whisper API (`whisper-large-v3-turbo`) with word-level timestamps
- **AI Auto-Edit**: OpenRouter (`openai/gpt-4o-mini`) / Gemini Direct API (`gemini-2.0-flash`)
- **Stock Media**: Pexels Video API
- **Rendering & Media**: FFmpeg & FFprobe CLI integration
- **Storage**: Local filesystem with JSON database (`db.json`)

### Frontend
- **Framework**: React 18 (Vite)
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **API Communication**: Native Fetch API

---

## Key Features

1. **Project Management**: Create, list, rename, delete video projects with custom resolutions and framerates.
2. **Media Upload & Storage**: Ingest video/audio assets with automated duration and dimension probing.
3. **Word-Level Transcription**: Extract audio to mono 16kHz WAV and generate precise word timestamps using Groq Whisper.
4. **Automated Captions**: Generate styled captions from transcript words with single-word or multi-word grouping.
5. **Template System**:
   - Apply preset styles (Viral, Podcast, YouTube Shorts, Instagram Reels, TikTok, Business, Gaming, Education).
   - Automatically adapts aspect ratios (`9:16`, `16:9`, `1:1`, `4:5`), font sizing, positioning, highlights, and animations.
6. **AI Auto-Edit Engine**:
   - Analyzes transcripts to generate hooks, titles, and social captions.
   - Automatically plans camera punch-in zooms, B-roll stock footage overlays, and emphasis captions.
   - Enforces a strict validation gate to prevent overlapping or out-of-bounds edit moments.
7. **B-roll Library**: Search Pexels stock videos directly inside the editor and attach overlay footage to the timeline.
8. **Interactive Editor UI**:
   - Multi-track timeline (Video, Zoom, B-roll, Captions, Audio/SFX).
   - Real-time HTML5 video preview with animated CSS captions and zoom overlays.
9. **Server-Side FFmpeg Exporter**: Background multi-track video renderer generating high-quality MP4 exports.

---

## Backend API Specification

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health check |
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create a new project |
| `GET` | `/api/projects/{id}` | Get project details (timeline, assets, transcript) |
| `PATCH` | `/api/projects/{id}` | Rename project |
| `DELETE` | `/api/projects/{id}` | Delete project |
| `POST` | `/api/projects/{id}/upload` | Upload video/audio asset to project |
| `POST` | `/api/projects/{id}/transcribe` | Trigger Groq Whisper word-level transcription |
| `POST` | `/api/projects/{id}/generate-captions` | Generate caption track items |
| `POST` | `/api/projects/{id}/auto-edit` | Run AI auto-edit analysis & apply decisions |
| `GET` | `/api/templates` | List available video templates |
| `POST` | `/api/projects/{id}/apply-template` | Apply video template to project |
| `GET` | `/api/broll/search` | Search Pexels stock video library |
| `POST` | `/api/projects/{id}/broll/attach` | Download and attach B-roll clip to timeline |
| `POST` | `/api/projects/{id}/export` | Trigger server-side background FFmpeg render job |
| `GET` | `/api/renders/{job_id}` | Check export job status & progress |
| `GET` | `/api/download/{filename}` | Download rendered output MP4 |

---

## Environment Setup & Configuration

Create a `.env` file in the `backend/` directory with the following keys:

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

---

## Running the Application

### 1. Start Backend Server
```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Start Frontend App
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.
