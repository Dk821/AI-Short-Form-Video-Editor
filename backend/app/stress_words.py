"""
"AI Stress Text Highlighter" — detects the important/emphasis words in one
caption line so Sidebar.jsx's boost card can style just those words.

Deliberately offline/deterministic rather than a Gemini/OpenRouter call like
auto_edit.py's zoom/b-roll suggestions: captions are regenerated often (every
transcript edit, every "Regenerate" click), and re-running an AI call on
every one of those — with the network/API-key failure modes that come with
it (see ai_edit.py) — would make a purely cosmetic styling feature far
flakier than it needs to be. This is intentionally simple and fast enough to
run synchronously on every caption line with no perceptible delay.

Scoring, per candidate word:
  +3  a number ("12", "100x") — figures read as the "point" of a line.
  +3  a curated intensifier/superlative (see INTENSIFIERS below).
  +1  a mid-sentence capitalized word (a name/acronym, not just the first
      word of the line, which is capitalized for grammar, not emphasis).
  +1, plus a small per-character bonus, for any non-stopword — so a line
      with no numbers or intensifiers still highlights its most
      "content-bearing" word(s) rather than highlighting nothing.
Pure stopwords score 0 and are never picked. Ties break on earliest
position, so the highlighted words stay stable if this ever runs twice on
the same line.
"""
from __future__ import annotations

import re

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "nor", "so", "yet",
    "is", "are", "was", "were", "be", "been", "being", "am",
    "to", "of", "in", "on", "at", "by", "for", "with", "about",
    "as", "into", "like", "through", "after", "over", "between",
    "out", "against", "during", "without", "before", "under", "around",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
    "us", "them", "my", "your", "his", "its", "our", "their", "mine",
    "this", "that", "these", "those", "there", "here",
    "do", "does", "did", "doing", "done",
    "have", "has", "had", "having",
    "will", "would", "can", "could", "shall", "should", "may", "might", "must",
    "not", "no", "if", "then", "than", "just", "up", "down", "off", "again",
    "what", "which", "who", "whom", "when", "where", "why", "how",
    "all", "any", "both", "each", "few", "more", "most", "other", "some", "such",
    "own", "same", "very", "too", "also", "and", "get", "got", "go", "going",
}

INTENSIFIERS = {
    "never", "always", "best", "worst", "biggest", "smallest", "huge", "massive",
    "insane", "crazy", "perfect", "incredible", "unbelievable", "shocking",
    "amazing", "love", "hate", "must", "need", "free", "new", "now", "today",
    "secret", "proven", "guaranteed", "warning", "breaking", "stop", "wait",
    "wow", "literally", "actually", "seriously", "everyone", "nobody", "everything",
    "nothing", "impossible", "instantly", "immediately", "urgent", "critical",
    "dangerous", "deadly", "life-changing", "game-changer", "epic", "legendary",
    "worst-case", "million", "billion", "thousand", "percent", "%",
}

_WORD_RE = re.compile(r"[A-Za-z0-9']+")


def _bare(token: str) -> str:
    m = _WORD_RE.search(token)
    return m.group(0).lower() if m else ""


def detect_stress_word_indices(text: str, max_words: int = 2) -> list[int]:
    """Returns up to `max_words` indices into `text.split(' ')` (the exact
    split both render.py and VideoPreview.jsx index words by), sorted in
    reading order. Empty text or an all-stopword line returns []."""
    if not text or not text.strip():
        return []
    tokens = text.split(" ")
    scored: list[tuple[float, int]] = []
    for i, tok in enumerate(tokens):
        bare = _bare(tok)
        if not bare:
            continue
        score = 0.0
        if bare.replace(".", "", 1).isdigit():
            score += 3
        if bare in INTENSIFIERS:
            score += 3
        if i > 0 and tok[:1].isupper() and not tok.isupper():
            # Mid-line capitalized word (a name/acronym) — not word 0, which
            # is capitalized for grammar regardless of emphasis.
            score += 1
        if bare not in STOPWORDS:
            score += 1 + min(len(bare), 10) * 0.1
        if score > 0:
            scored.append((score, i))

    scored.sort(key=lambda pair: (-pair[0], pair[1]))
    chosen = sorted(i for _, i in scored[:max_words])
    return chosen
