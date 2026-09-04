import threading
import time
from typing import List, Literal, Optional
import uuid

from fastapi import APIRouter, HTTPException

from .. import db
from ..ai_edit import call_auto_edit, validate_decisions, EditMoment, VALID_REVEAL_ANIMATIONS
from ..broll_policy import (
    build_supplement_windows,
    get_broll_clip_duration,
    get_broll_spacing,
    get_broll_target_count,
)
from ..models import Timeline
from ..pexels import fetch_broll_asset
from ..template_engine import apply_edit_decisions
from ..templates import get_template

router = APIRouter(prefix="/api/projects", tags=["auto-edit"])

# Set of project_ids with an auto-edit job currently running.
# Prevents concurrent duplicate Auto Edit jobs from being executed for the same project.
_active_auto_edit_projects = set()
_active_projects_lock = threading.Lock()

# EditMoment.type value each mode keeps — everything else gets filtered out
# of `decisions.moments` before apply_edit_decisions ever sees it. This is
# what makes "Magic Zooms" (Scenes.jsx) or the "AI Auto Zooms" boost toggle
# (Sidebar.jsx) touch ONLY the zoom track and leave b-roll (and vice versa)
# completely alone — the single Gemini call still returns zoom AND b-roll
# suggestions together every time, so filtering which of those moments
# actually get applied is the only way to scope one without the other.
_MODE_MOMENT_TYPE = {"zoom": "zoom", "broll": "broll_suggestion"}

# Ordered pool of fallback transitions — used when Gemini repeats the same
# animation for multiple clips. Ordered from most visually dynamic to most
# subtle so clips cycle through a varied, sensible sequence.
_FALLBACK_TRANSITION_POOL = [
    "slide_down", "zoom_in", "fade_in", "slide_up",
    "wipe_down", "slide_left", "pop", "bounce_in",
    "slide_right", "none",
]


# ---------------------------------------------------------------------------
# B-roll enforcement helpers
# ---------------------------------------------------------------------------

def _broll_moments(moments: List[EditMoment]) -> List[EditMoment]:
    """Return only the broll_suggestion moments from a moments list."""
    return [m for m in moments if m.type == "broll_suggestion"]


def _non_broll_moments(moments: List[EditMoment]) -> List[EditMoment]:
    """Return all non-broll moments."""
    return [m for m in moments if m.type != "broll_suggestion"]


def _remove_too_close(brolls: List[EditMoment], min_gap: float) -> List[EditMoment]:
    """Remove B-roll clips that are too close to a preceding clip.

    Clips are sorted by start time. The first clip is always kept.
    Any subsequent clip whose start is within `min_gap` seconds of the
    previous kept clip's start is dropped.
    """
    if not brolls:
        return []
    sorted_clips = sorted(brolls, key=lambda m: m.start)
    kept = [sorted_clips[0]]
    for clip in sorted_clips[1:]:
        prev = kept[-1]
        if clip.start - prev.start >= min_gap:
            kept.append(clip)
    return kept


def _clamp_broll_duration(
    clip: EditMoment, min_dur: float, max_dur: float, video_duration: float
) -> EditMoment:
    """Return a copy of `clip` with its duration clamped to [min_dur, max_dur],
    ensuring it doesn't run past the end of the video."""
    desired = min(max(clip.end - clip.start, min_dur), max_dur)
    new_end = min(clip.start + desired, video_duration)
    # If the clip got pushed against the video end, adjust start backward only
    # enough to fit min_dur — never move it before 0.
    if new_end - clip.start < min_dur:
        new_start = max(0.0, new_end - min_dur)
        clip = clip.model_copy(update={"start": round(new_start, 3), "end": round(new_end, 3)})
    else:
        clip = clip.model_copy(update={"end": round(clip.start + (new_end - clip.start), 3)})
    return clip


def _rank_by_relevance(brolls: List[EditMoment]) -> List[EditMoment]:
    """Sort B-roll clips by a simple relevance proxy: longer `reason` text
    (more specific reasoning from Gemini) → ranked higher. Clips without a
    reason come last."""
    return sorted(brolls, key=lambda m: len(m.reason or ""), reverse=True)


def _diversify_transitions(
    brolls: List[EditMoment],
    template_default: str = "none",
) -> List[EditMoment]:
    """Enforce transition diversity: prevent every B-roll clip from using the
    same revealAnimation, and fill in None values with varied fallbacks.

    Architecture
    ------------
    Gemini SUGGESTS a revealAnimation per clip (validated in ai_edit.py).
    This function is the backend ENFORCEMENT step:
      1. Accept Gemini's suggestion if it is valid and not already over-used.
      2. If Gemini's suggestion is None (failed validation or omitted), assign
         a fallback from _FALLBACK_TRANSITION_POOL that hasn't been used yet.
      3. If Gemini repeats the same transition for more than half the clips,
         replace the repeats with diverse fallbacks so the video feels varied.
      4. Always validate the template_default as a final safety net.

    The user can still change any clip's transition manually via the
    'Edit Transition' modal — this function only affects AI-placed clips.
    """
    if not brolls:
        return brolls

    # Count how many times each transition appears in Gemini's suggestions.
    from collections import Counter
    suggestion_counts: Counter = Counter(
        m.revealAnimation for m in brolls if m.revealAnimation
    )
    total = len(brolls)
    # Threshold: a transition is "over-used" if it covers more than half the
    # clips. For 2 clips that's both; for 4 clips that's 3+.
    overuse_threshold = max(1, total // 2)

    # Build a cycling iterator over the fallback pool that skips already-used
    # transitions first, then wraps around (so we always find something).
    def _pick_unused(used: set[str]) -> str:
        for t in _FALLBACK_TRANSITION_POOL:
            if t not in used:
                return t
        # All pool entries already used — cycle from the start
        return _FALLBACK_TRANSITION_POOL[0]

    used_transitions: set[str] = set()
    result: List[EditMoment] = []

    for m in brolls:
        chosen = m.revealAnimation

        # Case 1: Gemini gave a valid suggestion that isn't over-used.
        if chosen and suggestion_counts[chosen] <= overuse_threshold and chosen not in used_transitions:
            pass  # keep as-is

        # Case 2: No suggestion (None) OR over-used OR already used this clip.
        else:
            # Prefer not repeating what Gemini gave for THIS clip.
            preferred_avoid = {chosen} if chosen else set()
            chosen = _pick_unused(used_transitions | preferred_avoid)

        used_transitions.add(chosen)
        result.append(m.model_copy(update={"revealAnimation": chosen}))

    return result


def _enforce_broll_policy(
    moments: List[EditMoment],
    words: List[dict],
    video_duration: float,
) -> tuple[List[EditMoment], List[EditMoment]]:
    """Backend B-roll scheduling policy enforcement.

    Architecture separation
    -----------------------
    Gemini decides:  WHERE (timestamps), WHAT (keyword), WHY (reason)
    Backend decides: HOW MANY (min/max count), spacing, clip duration

    Steps
    -----
    1. Extract broll_suggestion moments.
    2. Validate each clip is in-range (already done by validate_decisions, but
       we re-check the spacing constraint here which validate_decisions skips).
    3. Remove clips that are too close together.
    4. Clamp clip durations to the configured target range.
    5. If count < min → supplement from transcript (no random B-roll).
    6. If count > max → keep only the highest-relevance clips.

    Returns
    -------
    (enforced_brolls, supplement_brolls)
        enforced_brolls  : the final, policy-compliant B-roll moments
        supplement_brolls: only the NEW moments added during supplementation
                           (caller needs to fetch Pexels assets for these)
    """
    min_count, max_count = get_broll_target_count(video_duration)
    target_mid = (min_count + max_count) // 2
    min_gap = get_broll_spacing(video_duration, target_mid)
    min_clip_dur, max_clip_dur = get_broll_clip_duration(video_duration)

    # --- Step 1: extract brolls ---
    brolls = _broll_moments(moments)

    # --- Step 2+3: spacing enforcement ---
    brolls = _remove_too_close(brolls, min_gap)

    # --- Step 4: clamp clip duration ---
    brolls = [
        _clamp_broll_duration(m, min_clip_dur, max_clip_dur, video_duration)
        for m in brolls
    ]

    supplement_brolls: List[EditMoment] = []

    # --- Step 5: supplement if below minimum ---
    if len(brolls) < min_count:
        need = min_count - len(brolls)
        covered = [(m.start, m.end) for m in brolls]
        windows = build_supplement_windows(
            words=words,
            covered_intervals=covered,
            target_count=need,
            video_duration=video_duration,
            min_gap=min_gap,
        )
        for w in windows:
            # Build a clip duration within the allowed range
            raw_dur = w["end"] - w["start"]
            clip_dur = min(max(raw_dur, min_clip_dur), max_clip_dur)
            new_end = min(w["start"] + clip_dur, video_duration)
            new_moment = EditMoment(
                type="broll_suggestion",
                start=round(w["start"], 3),
                end=round(new_end, 3),
                reason="backend-supplemented: transcript content window",
                keyword=w["keyword"],
            )
            brolls.append(new_moment)
            supplement_brolls.append(new_moment)

        # Re-apply spacing after adding supplements
        brolls = _remove_too_close(
            sorted(brolls, key=lambda m: m.start), min_gap
        )

    # --- Step 6: prune if above maximum ---
    if len(brolls) > max_count:
        # Separate Gemini's clips (have a real reason) from supplements,
        # rank Gemini's by relevance, keep the best ones first.
        gemini_clips = [m for m in brolls if m not in supplement_brolls]
        supp_clips = [m for m in brolls if m in supplement_brolls]
        ranked = _rank_by_relevance(gemini_clips) + supp_clips
        # Re-sort kept clips chronologically so timeline order is preserved.
        brolls = sorted(ranked[:max_count], key=lambda m: m.start)
        # Remove any supplement that didn't survive pruning
        surviving_supp_ids = {id(m) for m in brolls}
        supplement_brolls = [m for m in supplement_brolls if id(m) in surviving_supp_ids]

    return brolls, supplement_brolls


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

@router.post("/{project_id}/auto-edit")
def auto_edit(project_id: str, mode: Optional[Literal["zoom", "broll"]] = None):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    transcript = project.get("transcript")
    words = transcript.get("words") if transcript else None
    if not words:
        raise HTTPException(400, "No transcript yet — call /transcribe first")

    timeline = Timeline(**project["timeline"])
    duration = timeline.project.duration or words[-1]["end"]

    try:
        raw = call_auto_edit(words, duration)
    except RuntimeError as e:
        raise HTTPException(400, str(e))  # missing API key
    except Exception as e:
        raise HTTPException(502, f"AI auto-edit call failed: {e}")

    try:
        decisions = validate_decisions(raw, duration)
    except ValueError as e:
        raise HTTPException(502, f"AI auto-edit returned an unusable response: {e}")

    if mode:
        wanted_type = _MODE_MOMENT_TYPE[mode]
        decisions.moments = [m for m in decisions.moments if m.type == wanted_type]

    # ---------------------------------------------------------------------------
    # Resolve template early — needed for both transition diversity enforcement
    # and for apply_edit_decisions (template decides HOW: layout, scale, reveal).
    # ---------------------------------------------------------------------------
    template_id = project.get("templateId")
    template = get_template(template_id) if template_id else None
    # The template's broll revealAnimation is the fallback for clips where
    # Gemini didn't suggest one and the diversity pool is exhausted.
    template_broll_default = (
        getattr(getattr(template, "broll", None), "revealAnimation", None) or "none"
    )

    # ---------------------------------------------------------------------------
    # B-roll policy enforcement (backend controls quantity).
    #
    # This runs ONLY when broll_suggestion moments are present (i.e., when the
    # mode is None/"broll"). For "zoom"-only mode there are no broll moments to
    # enforce, and we skip straight to Pexels fetch.
    # ---------------------------------------------------------------------------
    supplement_brolls: List[EditMoment] = []
    if mode != "zoom":
        enforced_brolls, supplement_brolls = _enforce_broll_policy(
            decisions.moments, words, duration
        )
        # Enforce per-clip transition diversity: Gemini suggests, backend
        # validates. This runs AFTER enforcement so supplemented clips also
        # receive a diverse transition (they have revealAnimation=None).
        enforced_brolls = _diversify_transitions(
            enforced_brolls, template_default=template_broll_default
        )
        # Rebuild moments list: non-broll moments untouched + enforced brolls.
        decisions.moments = _non_broll_moments(decisions.moments) + enforced_brolls

    # Milestone 3 B-roll: resolve each suggested keyword to real footage.
    # Best-effort — a missing PEXELS_API_KEY, empty search, or failed
    # download leaves the item as a keyword-only suggestion (the renderer
    # skips those), so a Pexels hiccup never fails the whole auto-edit.
    broll_assets: dict[str, str] = {}
    new_assets: list[dict] = []
    for m in decisions.moments:
        if m.type != "broll_suggestion" or not (m.keyword and m.keyword.strip()):
            continue
        if m.keyword in broll_assets:
            continue
        asset = fetch_broll_asset(m.keyword)
        if asset:
            broll_assets[m.keyword] = asset["id"]
            project["assets"].append(asset)
            new_assets.append(asset)

    timeline = apply_edit_decisions(
        timeline, decisions, broll_assets=broll_assets, template=template
    )
    project["timeline"] = timeline.model_dump()
    db.put_project(project_id, project)

    # Count breakdown for observability
    final_brolls = _broll_moments(decisions.moments)
    min_count, max_count = get_broll_target_count(duration)

    return {
        "decisions": decisions.model_dump(),
        "timeline": project["timeline"],
        "brollDownloaded": len(broll_assets),
        "brollCount": len(final_brolls),
        "brollTarget": {"min": min_count, "max": max_count},
        "brollSupplemented": len(supplement_brolls),
        # Newly-downloaded Pexels assets — persisted server-side above, but
        # the frontend's `assets` store state is a separate in-memory copy
        # that only ever grows via explicit merges (see attachBrollResult
        # in editorStore.js for the manual-attach equivalent of this same
        # merge). Without returning these, the broll TimelineItem this
        # request just created points at an assetId the frontend has never
        # heard of, so `assets.find(a => a.id === item.assetId)` comes back
        # undefined and the b-roll layer silently renders as nothing.
        "assets": new_assets,
    }
