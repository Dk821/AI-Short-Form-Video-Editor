"""
Transcription (Milestone 2, step 1).

Uses Groq's hosted Whisper API (whisper-large-v3-turbo by default) — no
local model download, no CPU/GPU/RAM requirements. The audio is first
pulled into a mono 16kHz wav (the same step faster-whisper used to need),
then uploaded to Groq, which returns word-level timestamps we feed straight
into caption_templates.py.
"""
from __future__ import annotations

import os
import subprocess
import tempfile
from typing import List, TypedDict

import requests

GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "whisper-large-v3-turbo")


class WordTiming(TypedDict):
    word: str
    start: float
    end: float
    probability: float | None


def _extract_audio(source_path: str, out_wav: str) -> None:
    """Pull a mono 16kHz wav out of any video/audio file. Doing this
    explicitly (rather than uploading the raw container) keeps decoding
    reliable across whatever codecs users upload, shrinks the upload so it
    fits Groq's request size limit, and avoids 415s on odd formats."""
    # Same binary the renderer uses, so an FFMPEG_BINARY override (see
    # render._configured_ffmpeg) covers every ffmpeg call in the app rather
    # than leaving transcription pointed at a different build.
    from .render import _configured_ffmpeg

    cmd = [_configured_ffmpeg(), "-y", "-i", source_path, "-ac", "1", "-ar", "16000", "-vn", out_wav]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg audio extraction failed:\n{proc.stderr[-2000:]}")


def _words_from_segments(segments: List[dict]) -> List[WordTiming]:
    """Fallback: if the API returns segments but no word array, distribute
    each segment's words evenly across its start/end window. Coarser than
    true word-level timestamps, but keeps captions/auto-edit working."""
    words: List[WordTiming] = []
    for seg in segments:
        text = (seg.get("text") or "").strip()
        tokens = [t for t in text.split() if t]
        if not tokens:
            continue
        seg_start = float(seg["start"])
        seg_end = float(seg["end"])
        step = max(seg_end - seg_start, 0.05) / len(tokens)
        for i, token in enumerate(tokens):
            words.append(
                {
                    "word": token,
                    "start": round(seg_start + i * step, 3),
                    "end": round(seg_start + (i + 1) * step, 3),
                    "probability": None,
                }
            )
    return words


def transcribe_words(source_path: str, language: str | None = None) -> List[WordTiming]:
    """Run word-level transcription on a video or audio file via Groq's
    hosted Whisper. Returns a flat list of {word, start, end, probability}
    across the whole file — the caption-generation step (caption_templates.py)
    is what turns this into timeline items."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Get a free key at https://console.groq.com and "
            "set it as an environment variable before calling /transcribe."
        )

    with tempfile.TemporaryDirectory() as tmp:
        wav_path = os.path.join(tmp, "audio.wav")
        _extract_audio(source_path, wav_path)

        with open(wav_path, "rb") as f:
            files = {"file": ("audio.wav", f, "audio/wav")}
            data = [
                ("model", GROQ_WHISPER_MODEL),
                ("response_format", "verbose_json"),
                ("timestamp_granularities[]", "word"),
                ("temperature", "0"),
            ]
            if language:
                data.append(("language", language))
            resp = requests.post(
                GROQ_TRANSCRIBE_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                files=files,
                data=data,
                timeout=180,
            )

        if resp.status_code == 401:
            raise RuntimeError("Groq rejected the API key (401). Check GROQ_API_KEY.")
        if resp.status_code == 413:
            raise RuntimeError(
                "Audio is too large for Groq's transcription API. Trim the clip "
                "or use a shorter asset."
            )
        resp.raise_for_status()
        result = resp.json()

        words: List[WordTiming] = []
        for w in result.get("words", []):
            token = (w.get("word") or "").strip()
            if not token:
                continue
            words.append(
                {
                    "word": token,
                    "start": round(float(w["start"]), 3),
                    "end": round(float(w["end"]), 3),
                    "probability": None,
                }
            )

        if not words:
            words = _words_from_segments(result.get("segments", []))
        return words