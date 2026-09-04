"""
AI auto-edit (Milestone 3).

"AI decides. Timeline stores. Renderer executes." — this module is the
"AI decides" step, and nothing more. It calls Google Gemini, gets back JSON,
and validates it hard against EditDecisions before anything downstream ever
sees it. It never returns raw model output to the timeline; invalid or
out-of-range moments are dropped, not passed through. template_engine.py
is the separate "timeline stores" step that turns validated decisions
into TimelineItems.

Provider: Google Gemini only (via the google-genai SDK).
No fallback provider. If Gemini fails, a clear Gemini-specific error is
raised so the caller can surface it to the user directly.
"""
from __future__ import annotations

import json
import os
import time
from typing import List, Literal, Optional

from google import genai
from pydantic import BaseModel, ValidationError

from .broll_policy import get_broll_target_count, get_broll_spacing

SYSTEM_PROMPT = """You are an assistant that plans edits for a short-form vertical video, \
given its word-level transcript with timestamps.

Return ONLY a JSON object with this exact shape, no prose, no markdown fences:
{
  "hook": "a punchy 1-sentence hook/opening line suggestion",
  "title": "a short video title suggestion",
  "description": "a 1-2 sentence social caption/description suggestion",
  "moments": [
    {
      "type": "zoom" | "emphasis_caption" | "broll_suggestion" | "overlay",
      "start": <seconds, number>,
      "end": <seconds, number>,
      "reason": "why this moment matters, one short phrase",
      "keyword": "2-4 word visual search term, ONLY for broll_suggestion, else null",
      "revealAnimation": "none" | "slide_down" | "slide_up" | "slide_left" | "slide_right" | "fade_in" | "zoom_in" | "pop" | "wipe_down" | "bounce_in", ONLY for broll_suggestion, else null,
      "scale": <number between 1.1 and 1.6, ONLY for zoom, else null>,
      "style": "hook" | "transition" | "emphasis" | "ambient", "ONLY for overlay, else null",
      "confidence": <number between 0 and 1, ONLY for overlay, else null>
    }
  ]
}

Rules:
- start and end must fall within the transcript's time range and end must be greater than start.
- Use "zoom" for at most 2-4 of the most punch-worthy moments (surprise, emphasis, punchlines).
- Use "broll_suggestion" when a concrete visual noun/place/object is said and cutaway footage
  would help. The backend controls the QUANTITY of B-roll (you will be given a required range
  below). You control the QUALITY: choose WHERE and WHAT so each clip is semantically meaningful.
  Do NOT pad with generic B-roll just to hit the count; pick only genuinely useful moments.
- Use "emphasis_caption" for at most 1-2 of the single most important sentences to visually emphasize.
- Use "overlay" for at most 1-3 moments where a decorative video texture (light leak, grain,
  glitch, flash) would add energy — never name a filename, only a semantic "style":
  "hook" = right at the video's opening hook, "transition" = a scene/topic change,
  "emphasis" = a punchline or surprising beat, "ambient" = a longer, subtle background texture.
  You decide WHERE, WHEN, and roughly how long (via start/end) and WHY (reason/confidence) —
  never a specific asset, filename, or exact ffmpeg-level duration; the app's template picks the
  actual asset and clamps the final on-screen duration to what looks right for that style.
- Do not overlap moments of the same type.
- Do not invent timestamps that aren't supported by the transcript.
- For broll_suggestion: keyword must be a 2-4 word concrete visual search term (what a
  stock-footage camera would film). Never null or empty for broll_suggestion.
- For broll_suggestion: revealAnimation must be one of the allowed values above. Choose based
  on the mood/pace of the spoken content at that moment:
    "slide_down" or "slide_up" — fast, energetic, directional cuts
    "zoom_in" or "pop" — surprising facts, punchlines, emphasis
    "fade_in" — calm, reflective, ambient moments
    "wipe_down" — scene transitions, topic changes
    "slide_left" or "slide_right" — comparisons, before/after
    "bounce_in" — playful, upbeat, comedic moments
    "none" — clean cut, when the clip should appear instantly
  Do NOT assign the same revealAnimation to every b-roll clip in one video.
  Vary the transitions to match the emotional arc of the content.
"""


# Canonical set of valid reveal animations — must stay in sync with:
#   frontend/src/components/editor/animations/RevealAnimationPicker.jsx REVEAL_ANIMATIONS
#   backend/app/models.py TimelineItem.revealAnimation Literal
#   backend/app/templates/schema.py BrollStyle.revealAnimation Literal
VALID_REVEAL_ANIMATIONS = frozenset({
    "none", "slide_down", "slide_up", "slide_left", "slide_right",
    "fade_in", "zoom_in", "pop", "wipe_down", "bounce_in",
})


class EditMoment(BaseModel):
    type: Literal["zoom", "emphasis_caption", "broll_suggestion", "overlay"]
    start: float
    end: float
    reason: Optional[str] = None
    keyword: Optional[str] = None
    # Per-clip transition suggested by Gemini (broll_suggestion only).
    # Validated by validate_decisions; ignored for all other moment types.
    # The backend may override with a diverse fallback if Gemini repeats
    # the same transition for every clip (see routers/auto_edit.py).
    revealAnimation: Optional[str] = None
    scale: Optional[float] = None
    style: Optional[Literal["hook", "transition", "emphasis", "ambient"]] = None
    confidence: Optional[float] = None


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


def _is_daily_quota_error(msg: str) -> bool:
    """Check if the Gemini error is a daily quota exhaustion (free tier request limit reached)."""
    msg_lower = msg.lower()
    if "generate_content_free_tier" in msg_lower or "free_tier_requests" in msg_lower:
        return True
    if "limit: 20" in msg_lower or "limit of 20" in msg_lower:
        return True
    if "quota" in msg_lower and ("day" in msg_lower or "daily" in msg_lower):
        return True
    if "perday" in msg_lower or "per_day" in msg_lower:
        return True
    return False


def _is_temporary_rate_limit(msg: str) -> bool:
    """Check if the error is a temporary burst/per-minute rate limit (retryable)."""
    if _is_daily_quota_error(msg):
        return False
    msg_lower = msg.lower()
    return "429" in msg or "resource_exhausted" in msg_lower or "rate limit" in msg_lower or "rate_limit" in msg_lower


def call_auto_edit(
    words: List[dict],
    duration: float,
    project_id: str = "unknown",
    job_id: str = "unknown",
) -> dict:
    """Call Google Gemini to generate structured auto-edit decisions.

    This is the sole AI provider. There is no fallback. If Gemini is
    unavailable or misconfigured, a descriptive error is raised immediately
    so the caller can surface it to the user.

    Architecture:
        Groq/Whisper → Transcript → Gemini → EditDecisions → Validation → Timeline → FFmpeg

    B-roll density: the backend computes min/max B-roll counts from
    broll_policy.BROLL_DENSITY_TABLE and injects them into the prompt so
    Gemini has concrete targets. The backend then enforces those limits
    again after validation (see routers/auto_edit.py _enforce_broll_policy).
    Gemini decides WHERE/WHAT/WHY; the backend controls quantity.
    """
    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. "
            "Get a free key at https://aistudio.google.com/apikey and add it to "
            "backend/.env (development) or via the in-app Settings screen (desktop build)."
        )

    model = (os.environ.get("GEMINI_MODEL") or "").strip() or "gemini-3.8-flash"
    transcript_text = _build_transcript_text(words)

    # Compute backend-controlled B-roll density targets and inject them
    # into the prompt so Gemini understands what quantity is expected.
    # The backend will enforce these limits again after Gemini responds —
    # this is just a hint so Gemini produces a better first answer.
    min_broll, max_broll = get_broll_target_count(duration)
    min_gap = get_broll_spacing(duration, (min_broll + max_broll) // 2)

    broll_density_hint = (
        f"\nB-ROLL DENSITY REQUIREMENT (backend-controlled):\n"
        f"  Video duration  : {duration:.1f} seconds\n"
        f"  Required B-roll : {min_broll}–{max_broll} clips\n"
        f"  Minimum gap     : {min_gap:.1f} s between clips\n"
        f"  Rules:\n"
        f"  - Select {min_broll}–{max_broll} semantically meaningful broll_suggestion moments.\n"
        f"  - Do NOT return fewer than {min_broll} unless there is genuinely no suitable\n"
        f"    visual opportunity in the transcript.\n"
        f"  - Do NOT exceed {max_broll} clips.\n"
        f"  - Space clips at least {min_gap:.1f} s apart (midpoint to midpoint).\n"
        f"  - Each clip must be semantically relevant to the spoken words at that moment.\n"
        f"  - keyword must be a concrete 2-4 word visual search term (never null).\n"
    )

    prompt = (
        f"{SYSTEM_PROMPT}\n\n"
        f"Video duration: {duration:.2f}s\n"
        f"{broll_density_hint}\n"
        f"Word-level transcript:\n{transcript_text}"
    )

    # Retry configuration for transient Gemini errors (temporary 429, 500, 503).
    # Daily quota exhaustion (free tier request limit) is NEVER retried.
    _MAX_ATTEMPTS = 3
    _BACKOFF_SECONDS = [3, 6, 12]  # exponential backoff wait before attempts 2 and 3

    client = genai.Client(api_key=api_key)
    output_text: str = ""

    for attempt in range(1, _MAX_ATTEMPTS + 1):
        attempt_start = time.time()
        print(
            f"[auto_edit] GEMINI REQUEST START | job_id={job_id} | project_id={project_id} | "
            f"attempt={attempt}/{_MAX_ATTEMPTS} | model={model}"
        )
        try:
            interaction = client.interactions.create(
                model=model,
                input=prompt,
            )
            output_text = interaction.output_text
            elapsed = time.time() - attempt_start
            print(
                f"[auto_edit] GEMINI REQUEST SUCCESS | job_id={job_id} | project_id={project_id} | "
                f"attempt={attempt} | duration={elapsed:.2f}s"
            )
            break  # success — exit retry loop

        except Exception as exc:
            elapsed = time.time() - attempt_start
            exc_msg = str(exc)
            exc_type = type(exc).__name__

            # Check 1: Daily quota exhaustion -> STOP IMMEDIATELY. Do not repeatedly retry.
            if _is_daily_quota_error(exc_msg):
                print(
                    f"[auto_edit] GEMINI REQUEST FAILED | job_id={job_id} | project_id={project_id} | "
                    f"attempt={attempt} | error=Daily quota exhausted | details={exc_msg}"
                )
                raise RuntimeError(
                    "Gemini API error 429: Free tier daily request limit reached (limit: 20 requests/day exhausted). "
                    "Please wait for your daily quota to reset, or configure a paid Gemini API key in Settings."
                ) from exc

            # Check 2: Non-retryable authentication / permission errors
            if "401" in exc_msg:
                print(
                    f"[auto_edit] GEMINI REQUEST FAILED | job_id={job_id} | project_id={project_id} | "
                    f"attempt={attempt} | error=Invalid API key"
                )
                raise RuntimeError(
                    "Gemini API error 401: Invalid API key. Check that your GEMINI_API_KEY is correct in Settings."
                ) from exc

            if "403" in exc_msg:
                print(
                    f"[auto_edit] GEMINI REQUEST FAILED | job_id={job_id} | project_id={project_id} | "
                    f"attempt={attempt} | error=Permission denied"
                )
                raise RuntimeError(
                    "Gemini API error 403: Your API key does not have permission for this model or quota is exhausted."
                ) from exc

            # Check 3: Temporary rate limit (429) or transient server errors (500, 503, 504)
            is_temp_429 = _is_temporary_rate_limit(exc_msg)
            is_server_error = any(code in exc_msg for code in ("500", "503", "504"))
            is_retryable = is_temp_429 or is_server_error

            if is_retryable and attempt < _MAX_ATTEMPTS:
                wait = _BACKOFF_SECONDS[attempt - 1]
                reason = "Temporary rate limit (429)" if is_temp_429 else f"Transient server error ({exc_type})"
                print(
                    f"[auto_edit] GEMINI REQUEST RETRY | job_id={job_id} | project_id={project_id} | "
                    f"attempt={attempt} | next_attempt={attempt + 1} | wait={wait}s | reason={reason}"
                )
                time.sleep(wait)
                continue

            # Final attempt failed or non-retryable error
            print(
                f"[auto_edit] GEMINI REQUEST FAILED | job_id={job_id} | project_id={project_id} | "
                f"attempt={attempt} | error={exc_type} | details={exc_msg}"
            )
            if is_temp_429:
                raise RuntimeError(
                    f"Gemini API error 429: Rate limit exceeded after {_MAX_ATTEMPTS} attempts. "
                    "Please wait a few moments and try again."
                ) from exc

            if is_server_error:
                raise RuntimeError(
                    f"Gemini is temporarily unavailable (failed after {_MAX_ATTEMPTS} attempts). "
                    "Please try again shortly."
                ) from exc

            raise RuntimeError(
                f"Gemini API call failed ({exc_type}): {exc_msg}\n"
                "Please check your GEMINI_API_KEY and network connection, then try again."
            ) from exc

    if not output_text:
        raise RuntimeError(
            "Gemini returned an empty response. "
            "The model may be unavailable or the prompt was rejected. Please try again."
        )

    try:
        return json.loads(_clean_json_text(output_text))
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Gemini returned a response that could not be parsed as JSON: {exc}\n"
            f"Raw output (truncated): {output_text[:300]}"
        ) from exc


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
        if m.type == "broll_suggestion":
            # Validate Gemini's revealAnimation suggestion. Reject any value
            # not in the canonical set — unknown values become None so the
            # router can assign a diverse fallback (see _diversify_transitions).
            if m.revealAnimation and m.revealAnimation not in VALID_REVEAL_ANIMATIONS:
                m = m.model_copy(update={"revealAnimation": None})
        if m.type == "zoom":
            m.scale = min(max(m.scale or 1.25, 1.05), 2.0)
        if m.type == "overlay":
            if not m.style:
                continue
            if m.confidence is not None:
                m.confidence = min(max(m.confidence, 0.0), 1.0)

        overlaps = any(
            not (m.end <= s or m.start >= e) for s, e in seen_windows.get(m.type, [])
        )
        if overlaps:
            continue
        seen_windows.setdefault(m.type, []).append((m.start, m.end))
        clean.append(m)

    decisions.moments = clean
    return decisions
