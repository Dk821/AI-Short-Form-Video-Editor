"""
B-roll Scheduling Policy (Milestone 3 — density enforcement).

This module is the backend's *scheduling policy* for Auto B-roll.
It is the ONLY place that decides HOW MANY B-roll clips a video should have.

Architecture separation:
    Backend (this module)  →  quantity/spacing/duration policy
    Gemini (ai_edit.py)    →  semantic decisions (WHERE, WHAT, WHY)

To change density targets, edit BROLL_DENSITY_TABLE below.
To change clip-length limits, edit BROLL_CLIP_DURATION below.

This module has NO side effects: no I/O, no network, no DB.
All functions are pure and deterministic given their inputs.
"""
from __future__ import annotations

import re
from typing import List, Tuple

# ---------------------------------------------------------------------------
# ① Density table — the single, easy-to-find configuration knob.
# ---------------------------------------------------------------------------
# Each bucket says: "for a video up to max_duration seconds long,
# the backend requires min..max B-roll clips."
# The last entry (max_duration=None) is the open-ended "long video" rule.
#
# ┌──────────────┬─────┬─────┐
# │ Duration     │ min │ max │
# ├──────────────┼─────┼─────┤
# │ 0 – 10 s     │  1  │  2  │
# │ 10 – 20 s    │  2  │  4  │
# │ 20 – 30 s    │  4  │  5  │
# │ 30 – 45 s    │  5  │  7  │
# │ 45 – 60 s    │  6  │ 10  │
# │ > 60 s       │ ~1/6s│  20 │
# └──────────────┴─────┴─────┘

BROLL_DENSITY_TABLE: List[dict] = [
    {"max_duration": 10,  "min": 1, "max": 2},
    {"max_duration": 20,  "min": 2, "max": 4},
    {"max_duration": 30,  "min": 4, "max": 5},
    {"max_duration": 45,  "min": 5, "max": 7},
    {"max_duration": 60,  "min": 6, "max": 10},
    # > 60 s: ~1 clip every 5–8 s, hard cap at 20 so very long videos
    # don't become wall-to-wall B-roll.
    {"max_duration": None, "min": None, "max": 20},
]

# ---------------------------------------------------------------------------
# ② Clip duration limits — how long each individual B-roll item should be.
# ---------------------------------------------------------------------------
BROLL_CLIP_DURATION = {
    "preferred_s": 3.5,   # ideal clip length
    "min_s": 2.0,          # never shorter than this
    "max_s": 5.0,          # never longer than this (avoid clips running to end of video)
    # Never let any single clip exceed this fraction of the total video duration
    # (prevents a 4s B-roll dominating a 6s video).
    "max_video_fraction": 0.40,
}

# ---------------------------------------------------------------------------
# ③ Minimum spacing between B-roll clips (seconds).
# ---------------------------------------------------------------------------
# Absolute floor: no two clips may be closer than this regardless of density.
BROLL_MIN_GAP_S: float = 3.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_broll_target_count(video_duration: float) -> Tuple[int, int]:
    """Return (min_count, max_count) for a given video duration.

    Examples
    --------
    >>> get_broll_target_count(10)
    (1, 2)
    >>> get_broll_target_count(20)
    (2, 4)
    >>> get_broll_target_count(30)
    (4, 5)
    >>> get_broll_target_count(45)
    (5, 7)
    >>> get_broll_target_count(60)
    (6, 10)
    >>> get_broll_target_count(90)
    (11, 18)  # ~1 every 6s, capped at 20
    """
    for bucket in BROLL_DENSITY_TABLE:
        if bucket["max_duration"] is None:
            # Open-ended "long video" bucket — compute dynamically.
            # Target 1 clip per 6 seconds, floor at previous max's min+1=11.
            computed_min = max(11, int(video_duration / 8))
            computed_max = min(20, int(video_duration / 5))
            # Ensure min <= max
            computed_min = min(computed_min, computed_max)
            return computed_min, computed_max
        if video_duration <= bucket["max_duration"]:
            return bucket["min"], bucket["max"]

    # Should never reach here (last bucket has max_duration=None), but be safe.
    return 1, 3


def get_broll_spacing(video_duration: float, target_count: int) -> float:
    """Minimum gap (seconds) that must exist between any two B-roll clips.

    Dynamically scales with density: denser timelines get a tighter floor
    so clips can actually fit, but we never go below BROLL_MIN_GAP_S.
    """
    if target_count <= 0:
        return BROLL_MIN_GAP_S
    # Even-distribution spacing, reduced slightly so clips feel organic, not
    # metronome-like.  Then floor at the absolute minimum.
    distributed_gap = video_duration / (target_count + 1) * 0.5
    return max(BROLL_MIN_GAP_S, distributed_gap)


def get_broll_clip_duration(video_duration: float) -> Tuple[float, float]:
    """Return (min_clip_s, max_clip_s) for individual B-roll clips.

    The upper bound is also capped at a fraction of the total video so one
    clip can't accidentally span the majority of the video.
    """
    cfg = BROLL_CLIP_DURATION
    max_by_fraction = video_duration * cfg["max_video_fraction"]
    clamp_max = min(cfg["max_s"], max_by_fraction)
    clamp_max = max(clamp_max, cfg["min_s"])  # ensure max >= min
    return cfg["min_s"], clamp_max


# ---------------------------------------------------------------------------
# Transcript supplementation helpers (used by routers/auto_edit.py when
# Gemini returns fewer B-roll suggestions than the backend minimum).
# ---------------------------------------------------------------------------

_STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "is", "it", "this", "that", "be", "are", "was", "were",
    "as", "by", "from", "we", "i", "you", "he", "she", "they", "do",
    "did", "have", "had", "has", "will", "would", "can", "could", "not",
    "so", "if", "what", "when", "how", "just", "like", "also", "about",
    "up", "out", "into", "over", "more", "some", "than", "then", "now",
    "our", "your", "all", "been", "its", "my", "me", "no", "yes", "get",
    "make", "use", "go", "see", "know", "there", "here", "even", "very",
    "one", "two", "three", "four", "five", "any", "each", "which",
}


def _content_words(words_in_window: List[dict]) -> List[str]:
    """Extract meaningful (non-stopword, non-punctuation) words from a
    word-level transcript window, lowercased and deduplicated (order kept)."""
    seen = set()
    result = []
    for w in words_in_window:
        token = re.sub(r"[^a-z0-9'-]", "", w["word"].lower())
        if len(token) >= 3 and token not in _STOP_WORDS and token not in seen:
            seen.add(token)
            result.append(token)
    return result


def build_supplement_windows(
    words: List[dict],
    covered_intervals: List[Tuple[float, float]],
    target_count: int,
    video_duration: float,
    min_gap: float,
) -> List[dict]:
    """Identify transcript segments that are not already covered by B-roll
    and are suitable for supplementation.

    Returns a list of dicts::

        {"start": float, "end": float, "keyword": str}

    Each window is a 5–8 second span of transcript words chosen for noun
    richness. Only returns as many windows as needed to reach target_count.
    The selection avoids gaps that are already covered and respects spacing.

    This is intentionally simple (no NLP library required): keyword = the
    top 2–3 content words from the window, joined by a space — exactly the
    same kind of 2–4 word visual search term Gemini uses.
    """
    WINDOW_S = 6.0   # target window size in seconds
    MIN_WORDS = 3    # skip windows with too few words (little transcript content)

    # Build a set of already-covered mid-points so we can skip them.
    def _is_covered(t: float) -> bool:
        for s, e in covered_intervals:
            if s - min_gap < t < e + min_gap:
                return True
        return False

    # Slice the timeline into WINDOW_S chunks and evaluate each.
    candidates: List[dict] = []
    t = 0.0
    while t < video_duration and len(candidates) < target_count * 2:
        window_end = min(t + WINDOW_S, video_duration)
        mid = (t + window_end) / 2.0

        if not _is_covered(mid):
            # Gather transcript words that fall in this window.
            window_words = [w for w in words if t <= w["start"] < window_end]
            content = _content_words(window_words)
            if len(content) >= MIN_WORDS:
                keyword = " ".join(content[:3])  # 2–3 meaningful words
                # Use a transcript-anchored start (first word in window)
                # rather than the raw grid boundary so B-roll follows speech.
                first_word = next((w for w in words if w["start"] >= t), None)
                last_word = next(
                    (w for w in reversed(words) if w["end"] <= window_end), None
                )
                actual_start = first_word["start"] if first_word else t
                actual_end = last_word["end"] if last_word else window_end
                if actual_end > actual_start:
                    candidates.append({
                        "start": actual_start,
                        "end": actual_end,
                        "keyword": keyword,
                        "content_word_count": len(content),
                    })

        t += WINDOW_S

    # Sort by richness (more content words = more concrete visuals) and return
    # only as many as needed.
    candidates.sort(key=lambda c: c["content_word_count"], reverse=True)
    return candidates[:target_count]
