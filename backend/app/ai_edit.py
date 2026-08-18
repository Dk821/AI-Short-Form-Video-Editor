"""
AI auto-edit (Milestone 3).

"AI decides. Timeline stores. Renderer executes." — this module is the
"AI decides" step, and nothing more. It calls Gemini, gets back JSON, and
validates it hard against EditDecisions before anything downstream ever
sees it. It never returns raw model output to the timeline; invalid or
out-of-range moments are dropped, not passed through. template_engine.py
is the separate "timeline stores" step that turns validated decisions
into TimelineItems.
"""
from __future__ import annotations

import json
import os
from typing import List, Literal, Optional

import requests
from pydantic import BaseModel, ValidationError

OPENROUTER_API_BASE = "https://openrouter.ai/api/v1/chat/completions"
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

SYSTEM_PROMPT = """You are an assistant that plans edits for a short-form vertical video, \
given its word-level transcript with timestamps.

Return ONLY a JSON object with this exact shape, no prose, no markdown fences:
{
  "hook": "a punchy 1-sentence hook/opening line suggestion",
  "title": "a short video title suggestion",
  "description": "a 1-2 sentence social caption/description suggestion",
  "moments": [
    {
      "type": "zoom" | "emphasis_caption" | "broll_suggestion",
      "start": <seconds, number>,
      "end": <seconds, number>,
      "reason": "why this moment matters, one short phrase",
      "keyword": "2-4 word visual search term, ONLY for broll_suggestion, else null",
      "scale": <number between 1.1 and 1.6, ONLY for zoom, else null>
    }
  ]
}

Rules:
- start and end must fall within the transcript's time range and end must be greater than start.
- Use "zoom" for at most 2-4 of the most punch-worthy moments (surprise, emphasis, punchlines).
- Use "broll_suggestion" when a concrete visual noun/place/object is said and cutaway footage would help.
- Use "emphasis_caption" for at most 1-2 of the single most important sentences to visually emphasize.
- Do not overlap moments of the same type.
- Do not invent timestamps that aren't supported by the transcript.
"""


class EditMoment(BaseModel):
    type: Literal["zoom", "emphasis_caption", "broll_suggestion"]
    start: float
    end: float
    reason: Optional[str] = None
    keyword: Optional[str] = None
    scale: Optional[float] = None


class EditDecisions(BaseModel):
    hook: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    moments: List[EditMoment] = []


def _build_transcript_text(words: List[dict]) -> str:
    # Compact "[start-end] word" lines keep the prompt small while giving
    # the model exact timestamps to anchor moments to.
    lines = [f"[{w['start']:.2f}-{w['end']:.2f}] {w['word']}" for w in words]
    return "\n".join(lines)


def _clean_json_text(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    return text


def call_openrouter(words: List[dict], duration: float) -> dict:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set. Get a key at "
            "https://openrouter.ai/keys and set it in your environment/vars before calling /auto-edit."
        )

    model = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    transcript_text = _build_transcript_text(words)
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Video duration: {duration:.2f}s\n\nWord-level transcript:\n{transcript_text}",
            },
        ],
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AI Auto-Edit",
    }

    resp = requests.post(OPENROUTER_API_BASE, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()

    try:
        content = resp.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise ValueError(f"OpenRouter returned an unexpected response shape: {e}")

    return json.loads(_clean_json_text(content))


def call_gemini_direct(words: List[dict], duration: float) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Get a free key at "
            "https://aistudio.google.com/apikey and set it as an environment variable."
        )

    gemini_model = os.environ.get("GEMINI_MODEL", "gemini-3.7-flash")
    transcript_text = _build_transcript_text(words)
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": f"Video duration: {duration:.2f}s\n\nWord-level transcript:\n{transcript_text}",
                    }
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.4,
            "response_mime_type": "application/json",
        },
    }

    url = f"{GEMINI_API_BASE}/{gemini_model}:generateContent"
    resp = requests.post(url, params={"key": api_key}, json=payload, timeout=60)
    resp.raise_for_status()

    try:
        content = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as e:
        raise ValueError(f"Gemini returned an unexpected response shape: {e}")

    return json.loads(_clean_json_text(content))


def call_auto_edit(words: List[dict], duration: float) -> dict:
    openrouter_key = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
    gemini_key = (os.environ.get("GEMINI_API_KEY") or "").strip()

    if not openrouter_key and not gemini_key:
        raise RuntimeError(
            "Neither OPENROUTER_API_KEY nor GEMINI_API_KEY is set. "
            "Set OPENROUTER_API_KEY or GEMINI_API_KEY in backend/.env before calling /auto-edit."
        )

    last_err: Exception | None = None

    if openrouter_key:
        try:
            return call_openrouter(words, duration)
        except (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError) as e:
            # Network-level failure (blocked, reset, timeout). Try Gemini fallback.
            last_err = e
            print(f"[auto-edit] OpenRouter unreachable ({type(e).__name__}), falling back to Gemini…")

    if gemini_key:
        try:
            return call_gemini_direct(words, duration)
        except Exception as e:
            last_err = e

    raise RuntimeError(
        f"All AI providers failed. Last error: {last_err}"
    )


call_gemini = call_auto_edit




def validate_decisions(raw: dict, duration: float) -> EditDecisions:
    """Hard validation gate. Anything malformed or out of bounds is
    dropped rather than raising, so one bad moment doesn't sink the
    whole auto-edit — but nothing ungrounded ever reaches the timeline."""
    try:
        decisions = EditDecisions(**raw)
    except ValidationError as e:
        raise ValueError(f"Gemini response didn't match the expected schema: {e}")

    clean: List[EditMoment] = []
    seen_windows: dict[str, list[tuple[float, float]]] = {}

    for m in decisions.moments:
        if m.start < 0 or m.end <= m.start or m.end > duration + 0.5:
            continue
        if m.type == "broll_suggestion" and not (m.keyword and m.keyword.strip()):
            continue
        if m.type == "zoom":
            m.scale = min(max(m.scale or 1.25, 1.05), 2.0)

        overlaps = any(
            not (m.end <= s or m.start >= e) for s, e in seen_windows.get(m.type, [])
        )
        if overlaps:
            continue
        seen_windows.setdefault(m.type, []).append((m.start, m.end))
        clean.append(m)

    decisions.moments = clean
    return decisions
