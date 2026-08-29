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
│   │   ├── pexels.py                # Pexels stock VIDEO + PHOTO search, preview, and auto-download manager (auto-edit's automatic fetch, and the manual B-roll Library's Image/Video Search tabs)
│   │   ├── stress_words.py          # "AI Stress Text Highlighter": deterministic, offline, non-AI heuristic that scores each caption word (numbers, an intensifier list, mid-line capitalization, non-stopword length) and returns the top N indices to highlight
│   │   ├── routers/
│   │   │   ├── projects.py          # Project management routes (CRUD operations)
│   │   │   ├── upload.py            # Video/audio/image asset file upload router with FFprobe metadata extraction — also powers the B-roll Library's Upload Local tab
│   │   │   ├── transcription.py     # Speech-to-text trigger router
│   │   │   ├── captions.py          # Caption generation router, incl. the stress-highlight enable/disable endpoint
│   │   │   ├── auto_edit.py         # AI auto-edit router & Pexels resolution — returns newly-downloaded B-roll assets in its response so the frontend's local asset state always stays in sync with the timeline items it just created
│   │   │   ├── templates.py         # Video template application router & static asset serving
│   │   │   ├── broll.py             # Manual B-roll Library router: search (Image/Video, Pexels) + attach (by downloadUrl for a fresh Pexels pick, or by assetId for an already-uploaded local file) — always returns {asset, item, timeline} together
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
    │   │       ├── Sidebar.jsx      # Control panel tabs (Captions / Edit Scenes / Trim); all three panels stay mounted and are shown/hidden via CSS so switching tabs doesn't lose in-progress state. AI BOOST FEATURES / ADVANCED AI TOOLS toggles (Auto Zooms, Auto B-rolls, AI Stress Text Highlighter) derive their on/off state from what's actually on the timeline/captions, never a local flag, and guard against re-firing while a request is already in flight
    │   │       ├── Toolbar.jsx      # Navigation bar (Export, Undo/Redo, Save, top-level tab switcher mirroring Sidebar's tabs)
    │   │       ├── BrollPicker.jsx  # B-roll Library modal, built around three source tabs — Image Search, Video Search (both Pexels, paginated), and Upload Local (any image/video from disk) — each producing selectable media cards, a shared right-side panel for Placement Target / Duration / Screen Layout / Reveal Animation, a "Preview" lightbox, and one explicit "Add to Timeline" button that attaches the pick
    │   │       ├── TemplateLibrary.jsx # Video style template selector modal
    │   │       ├── Scenes.jsx       # Sentence-level scene view; the per-scene b-roll indicator opens a picker when empty, or a 3-option dropdown (Add New / Edit Transition / Delete) when a b-roll is already attached. "Magic B-roll"/"Magic Zooms" regenerate actions await the old auto-edit items being removed before requesting new ones, closing a race that could otherwise duplicate items
    │   │       └── animations/
    │   │           ├── index.js             # Re-exports BrollAnimation, SplitScreenLayout, and their compute*Style helpers
    │   │           ├── BrollAnimation.jsx   # B-roll reveal animation (slide/fade/zoom/wipe/bounce) + continuous hold-phase drift once revealed
    │   │           ├── SplitScreenLayout.jsx# Main video's split-screen placement — shrinks from fullscreen into its half in sync with the b-roll's reveal, plus its own hold-phase parallax drift
    │   │           ├── driftMotion.js       # Shared "hold-phase drift" constants/formula (mirrored exactly in backend/app/render.py) so preview and export move identically
    │   │           └── StressHighlightModal.jsx # "AI Stress Text Highlighter" style editor — text/background color, no-background toggle, stroke on/off + color/width, font family/size/weight, normal/italic, highlight padding & corner radius, and a highlight animation (none/pop/pulse/underline/glow); live-applies to every caption line's detected stress words as you edit
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
- **Stock Media Integration**: Pexels Video API (portrait MP4 filtering, height capping <= 1920p, dual preview/render URL selection) and Pexels Photos API (portrait image search + curated feed) — both power the B-roll Library's Image/Video Search tabs, in addition to the video-only automatic fetch used by AI Auto-Edit.
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
   - `mode` query param (`zoom` | `broll`) scopes one call to only that moment type, so the Sidebar's "Auto Zooms" and "Auto B-rolls" boost toggles — and Scenes.jsx's "Magic Zooms"/"Magic B-roll" buttons — never touch each other's track; each toggle's on/off state is derived live from whether any `source: "auto_edit"` item exists on its track, not a separate flag that could drift from reality.
   - **Downloaded B-roll assets are always returned to the frontend in the same response** that updates the timeline (`assets: [...]` on the `/auto-edit` response), so a newly-placed AI b-roll item's `assetId` is immediately resolvable in the local preview — fixes an earlier bug where the timeline item was correct but pointed at an asset the frontend had never been told about, rendering as a blank layer.
7. **B-roll Library — Image Search / Video Search / Upload Local** (`BrollPicker.jsx`, `pexels.py`, `routers/broll.py`): a redesigned three-tab panel replacing the old single Pexels-video-only search.
   - **Image Search** and **Video Search** both hit the Pexels API (Photos and Videos respectively), each with its own paginated results grid (thumbnail, duration/type badge, selection ring + checkmark) and numbered pager.
   - **Upload Local** uploads an image or video straight from the user's device (via the same generic `/upload` endpoint every other asset uses) and treats it as a selectable card identically to a search result.
   - All three sources converge on one attach call: `POST /projects/{id}/broll/attach` takes either a `downloadUrl` (fresh Pexels pick — downloaded now) or an `assetId` (already-uploaded local file — placed as-is), and always responds with the fully-resolved `{asset, item, timeline}` so the frontend's asset list is synced in the same round trip — no source can produce a blank b-roll layer.
   - Shared right-side panel: **Placement Target** (start/end + the transcript line it targets), **B-roll Duration** controls (±0.5s stepper, +1/+2/+5s quick-extend, reset-to-scene-length), **Screen Layout** (Full Screen / Top Split / Bottom Split), **Reveal Animation** (None, Slide Down/Up/Left/Right, Fade In, Zoom In, Pop, Wipe Down, Bounce In), a **Preview** button (large lightbox of the exact pick before committing), and **Add to Timeline**.
   - **Edit an already-attached b-roll from `Scenes.jsx`**: clicking a scene's b-roll indicator when a clip is already attached opens a 3-option dropdown — *Add New B-roll*, *Edit Transition* (inline reveal-animation / layout / speed editor operating on the existing item via `updateItem`), and *Delete B-roll* — instead of always reopening the picker.
8. **AI Stress Text Highlighter** (`stress_words.py`, `StressHighlightModal.jsx`): automatically detects the most important/"stress" words in each caption line and applies a distinct highlight style to just those words.
   - **Detection** is a deterministic, offline heuristic (no AI call) — `detect_stress_word_indices` scores each word by whether it's a number, whether it's in a curated intensifier list, whether it's capitalized mid-line (a name/acronym), and a small bonus for longer non-stopword words, then keeps the top-scoring word(s) per line (`maxWordsPerLine`, default 2).
   - **Enable/disable** (`POST /projects/{id}/captions/stress-highlight`) runs or clears detection across every existing caption item; the Sidebar boost toggle derives its on/off state from whether any caption item actually has stress words assigned, the same "derive from real data" pattern used by Auto Zooms/Auto B-rolls.
   - **Style editor** (`StressHighlightModal.jsx`, opened via the boost card's Edit button): text color, background/highlight color with a "no background" toggle, stroke on/off with color + thickness, font family/size/weight, normal/italic, highlight padding, corner radius, and a highlight animation (None, Pop, Pulse, Underline, Glow) — applied live to every caption line's detected stress words as each control changes.
   - **Export parity, with one disclosed gap**: `render.py` builds one `drawtext` filter per word so color, background, stroke, font, and padding all match the live preview exactly in the exported MP4. Corner radius and the highlight animation have no equivalent in ffmpeg's `drawtext` and stay preview-only — the exported highlight is a static (non-rounded, non-animated) box, called out explicitly in the modal's own UI rather than left as a silent mismatch.
9. **Interactive React Preview & Scenes Panel**:
   - Multi-track HTML5 video preview (`VideoPreview.jsx`) with synchronized dynamic caption rendering, live zoom scale transforms, template overlay loops, and split-screen duet/reaction layout positioning (`SplitScreenLayout.jsx`).
   - Centralized Zustand store resolution via `currentTemplate()` helper in `editorStore.js` ensuring safe template metadata resolution and error-free canvas rendering.
   - Sentence-level transcript scene segmentation view (`Scenes.jsx`) allowing quick manual zoom toggles and targeted B-roll attachment.
   - **Sidebar tabs stay mounted** (Captions / Edit Scenes / Trim in `Sidebar.jsx`) and are toggled via CSS instead of being unmounted/remounted, so switching tabs is instant and preserves each panel's in-progress state; the shared scroll container resets to the top on every tab change.
10. **Split-screen B-roll animation, synced with the main video** (`animations/BrollAnimation.jsx`, `animations/SplitScreenLayout.jsx`, `animations/driftMotion.js`, mirrored in `render.py`):
   - The main video shrinks from fullscreen into its complementary half in sync with the b-roll's own reveal (same start time, duration, easing) instead of hard-cutting to half height the instant the item goes active.
   - The edge of the main video against the outer frame boundary always stays flush with the screen edge, so there is never a moment of exposed empty space mid-transition — only the edge facing the split boundary advances, which reads as the main video moving in the same direction the b-roll is revealing.
   - Once fully revealed, both the b-roll and the main video keep drifting slowly in that same direction (a subtle continuous parallax, main video moving at a reduced amplitude relative to the b-roll) instead of freezing solid — timing/easing constants live once in `driftMotion.js` and are mirrored exactly in the FFmpeg export.
11. **Cover Image capture**: a dedicated "Cover" preview tab lets the user scrub the timeline (including whatever b-roll/split layer is active at that instant) and save the current frame as the project's dashboard thumbnail via `POST /api/projects/{id}/cover`, which reuses the export filtergraph (`render.py`'s `capture_frame`) so the captured frame is pixel-identical to what export would produce at that timestamp.
12. **Server-Side FFmpeg Exporter**: Background multi-track video renderer generating high-quality MP4 exports using a single FFmpeg filtergraph with zoom punch-ins, B-roll overlays, text drawtext filters, and mixed audio tracks. Template ambient overlays (light leaks/grain) play as short 2–3s bursts once or twice across the video instead of for the full duration (`_overlay_burst_windows` in `routers/templates.py`).

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
| `POST` | `/api/projects/{id}/captions/stress-highlight` | Enable/disable the AI Stress Text Highlighter — runs (or clears) stress-word detection across every caption item |
| `POST` | `/api/projects/{id}/auto-edit` | Execute AI auto-edit analysis & apply edit decisions. Optional `mode=zoom\|broll` scopes it to one moment type; response includes any newly-downloaded B-roll assets so the frontend stays in sync |
| `GET` | `/api/templates` | List all preset video templates (optionally filtered by category) |
| `GET` | `/api/templates/{template_id}` | Get detailed schema for a specific video template |
| `GET` | `/api/templates/thumbnails/{filename}` | Serve static preview thumbnail images for templates |
| `GET` | `/api/templates/overlays/{filename}` | Serve static video overlay loops (film grain, light leaks) |
| `POST` | `/api/templates/reload` | Hot-reload template JSON files from `templates/library/` |
| `POST` | `/api/projects/{id}/apply-template` | Apply preset video template to project |
| `GET` | `/api/broll/search` | Search the B-roll Library — `media=video` (default) hits Pexels Videos, `media=image` hits Pexels Photos; supports `query`, `page`, `per_page`, returns `totalPages` for pagination |
| `POST` | `/api/projects/{id}/broll/attach` | Attach media to the timeline's broll track — pass `downloadUrl` to download a fresh Pexels video/photo, or `assetId` to reuse an already-uploaded local file; always returns `{asset, item, timeline}` |
| `POST` | `/api/projects/{id}/export` | Trigger background FFmpeg render export job |
| `GET` | `/api/renders/{job_id}` | Check status and progress of background rendering job |
| `GET` | `/api/download/{filename}` | Download final rendered output MP4 file |

---

## ⚠️ Known Gaps

- **Template thumbnails/overlays are unresolved on disk.** Every preset in `templates/registry.py` / `templates/library/*.json` sets `thumbnailUrl` (e.g. `/api/templates/thumbnails/split_reaction.jpg`) and most set `overlayVideoUrl` (e.g. `/api/templates/overlays/split_reaction.mp4`), and `main.py` mounts `templates/library/thumbnails/` and `templates/library/overlays/` as static dirs to serve them — but neither directory (nor any file in them) currently exists in the repo. Template picker cards and the ambient overlay effect have nothing to actually load until real thumbnail JPGs and overlay MP4s are added at those paths.
- **AI Stress Text Highlighter's corner radius & highlight animation are preview-only.** `ffmpeg drawtext` has no native rounded-rectangle or per-word animation support, so the exported MP4 renders each stress word's color/background/stroke/font/padding exactly as previewed but as a static, square-cornered box — `StressHighlightModal.jsx` says this explicitly rather than leaving it as a silent preview/export mismatch.

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
