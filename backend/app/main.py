import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Load .env from the backend directory
backend_dir = Path(__file__).parent.parent
load_dotenv(backend_dir / '.env', override=True)

from .routers import projects, upload, export, transcription, captions, auto_edit, templates, broll, sfx
from .storage import UPLOADS_DIR

# Static asset directories for template previews
_APP_DIR = Path(__file__).parent
TEMPLATES_LIB_DIR = _APP_DIR / "templates" / "library"
SFX_LIB_DIR = _APP_DIR / "sfx" / "library"

app = FastAPI(title="AI Short-Form Video Editor API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(upload.router)
app.include_router(export.router)
app.include_router(transcription.router)  # Milestone 2: Groq-hosted Whisper transcription
app.include_router(captions.router)       # Milestone 2: caption templates + generation
app.include_router(auto_edit.router)      # Milestone 3: Gemini auto-edit
app.include_router(templates.router)      # Template System: reusable video templates
app.include_router(broll.router)          # B-roll Library: manual search + attach
app.include_router(sfx.router)            # SFX Library: bundled placeholder sounds, browse + attach

# Local-dev stand-in for a CDN in front of S3/R2 (see storage.py).
app.mount("/api/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# Template static assets (thumbnails + overlay preview videos).
# These are bundled with the source tree, not user-uploaded content.
app.mount(
    "/api/templates/thumbnails",
    StaticFiles(directory=str(TEMPLATES_LIB_DIR / "thumbnails")),
    name="template_thumbnails",
)
app.mount(
    "/api/templates/overlays",
    StaticFiles(directory=str(TEMPLATES_LIB_DIR / "overlays")),
    name="template_overlays",
)

# Bundled SFX audio files (see app/sfx/library/README.txt) — same
# "static asset shipped with the source tree" contract as the template
# overlays above.
app.mount(
    "/api/sfx/library",
    StaticFiles(directory=str(SFX_LIB_DIR)),
    name="sfx_library",
)


@app.get("/api/health")
def health():
    return {"status": "ok"}
