"""
The template registry. Add a template by adding an entry here — nothing
else needs to change (routers/templates.py, the caption generator, and
the frontend picker all read this list/dict directly).
"""
from __future__ import annotations

from .schema import VideoTemplate, CaptionStyle, BrollStyle, OverlayStyle

TEMPLATES: dict[str, VideoTemplate] = {
    "bold-viral-01": VideoTemplate(
        id="bold-viral-01",
        name="Bold Viral",
        category="Viral",
        description="Big single-word punch captions with a bold orange highlight — built to stop the scroll.",
        tags=["high-energy", "hook-first"],
        aspectRatio="9:16",
        accentColor="#FF6B00",
        thumbnailUrl="/api/templates/thumbnails/bold-viral-01.jpg",
        overlayVideoUrl="/api/templates/overlays/bold-viral-01.mp4",
        caption=CaptionStyle(
            fontFamily="Montserrat", fontWeight=800, fontSize=64,
            color="#FFFFFF", highlightColor="#FF6B00", strokeColor="#000000",
            strokeWidth=3, backgroundColor=None, position="center",
            case="upper", animation="word_by_word", wordsPerCaption=1,
        ),
        broll=BrollStyle(frequency="high", defaultScale=1.0, position="full-screen", transitionMs=200),
        overlay=OverlayStyle(enabled=True, blendMode="screen", opacity=0.85, videoUrl="/api/templates/overlays/bold-viral-01.mp4"),
    ),
    "viral": VideoTemplate(
        id="viral",
        name="Viral",
        category="Viral",
        description="Big punchy single words, high-contrast yellow, built to stop the scroll.",
        tags=["high-energy", "hook-first"],
        aspectRatio="9:16",
        accentColor="#FDE047",
        thumbnailUrl="/api/templates/thumbnails/viral.jpg",
        overlayVideoUrl="/api/templates/overlays/viral.mp4",
        caption=CaptionStyle(
            fontFamily="Space Grotesk", fontWeight=800, fontSize=96,
            color="#FDE047", highlightColor="#FFFFFF", strokeColor="#000000",
            strokeWidth=3, backgroundColor=None, position="center",
            case="upper", animation="pop", wordsPerCaption=1,
        ),
        broll=BrollStyle(frequency="high", defaultScale=0.6, position="center", transitionMs=180),
    ),
    "podcast": VideoTemplate(
        id="podcast",
        name="Podcast",
        category="Podcast",
        description="Clean readable phrases for long-form talking-head clips.",
        tags=["talking-head", "clean"],
        aspectRatio="9:16",
        accentColor="#5EEAD4",
        thumbnailUrl="/api/templates/thumbnails/podcast.jpg",
        overlayVideoUrl="/api/templates/overlays/podcast.mp4",
        caption=CaptionStyle(
            fontFamily="Inter", fontWeight=600, fontSize=58,
            color="#FFFFFF", highlightColor="#5EEAD4", strokeColor=None,
            strokeWidth=0, backgroundColor="#00000066", position="bottom",
            case="none", animation="fade", wordsPerCaption=5,
        ),
        broll=BrollStyle(frequency="low", defaultScale=0.5, position="top-right", transitionMs=300),
    ),
    "youtube_shorts": VideoTemplate(
        id="youtube_shorts",
        name="YouTube Shorts",
        category="YouTube Shorts",
        description="Bold centered karaoke-style captions tuned for Shorts retention.",
        tags=["shorts", "karaoke"],
        aspectRatio="9:16",
        accentColor="#F87171",
        thumbnailUrl="/api/templates/thumbnails/youtube_shorts.jpg",
        overlayVideoUrl="/api/templates/overlays/youtube_shorts.mp4",
        caption=CaptionStyle(
            fontFamily="Space Grotesk", fontWeight=800, fontSize=84,
            color="#FFFFFF", highlightColor="#F87171", strokeColor="#000000",
            strokeWidth=2, backgroundColor=None, position="center",
            case="none", animation="karaoke", wordsPerCaption=3,
        ),
        broll=BrollStyle(frequency="medium", defaultScale=0.55, position="center", transitionMs=200),
    ),
    "instagram_reels": VideoTemplate(
        id="instagram_reels",
        name="Instagram Reels",
        category="Instagram Reels",
        description="Soft rounded captions with a gradient-friendly accent, tuned for Reels.",
        tags=["reels", "trendy"],
        aspectRatio="9:16",
        accentColor="#F472B6",
        thumbnailUrl="/api/templates/thumbnails/instagram_reels.jpg",
        overlayVideoUrl="/api/templates/overlays/instagram_reels.mp4",
        caption=CaptionStyle(
            fontFamily="Inter", fontWeight=700, fontSize=68,
            color="#FFFFFF", highlightColor="#F472B6", strokeColor=None,
            strokeWidth=0, backgroundColor="#00000055", position="bottom",
            case="none", animation="slide_up", wordsPerCaption=4,
        ),
        broll=BrollStyle(frequency="medium", defaultScale=0.55, position="full", transitionMs=250),
    ),
    "tiktok": VideoTemplate(
        id="tiktok",
        name="TikTok",
        category="TikTok",
        description="Single-word punch captions, maximum contrast, fast pacing.",
        tags=["fast", "punchy"],
        aspectRatio="9:16",
        accentColor="#FDE047",
        thumbnailUrl="/api/templates/thumbnails/tiktok.jpg",
        overlayVideoUrl="/api/templates/overlays/tiktok.mp4",
        caption=CaptionStyle(
            fontFamily="Space Grotesk", fontWeight=800, fontSize=92,
            color="#FDE047", highlightColor="#FFFFFF", strokeColor="#000000",
            strokeWidth=3, backgroundColor=None, position="center",
            case="upper", animation="pop", wordsPerCaption=1,
        ),
        broll=BrollStyle(frequency="high", defaultScale=0.6, position="center", transitionMs=150),
    ),
    "business": VideoTemplate(
        id="business",
        name="Business",
        category="Business",
        description="Understated, professional captions for corporate and B2B content.",
        tags=["corporate", "minimal"],
        aspectRatio="16:9",
        accentColor="#60A5FA",
        thumbnailUrl="/api/templates/thumbnails/business.jpg",
        overlayVideoUrl="/api/templates/overlays/business.mp4",
        caption=CaptionStyle(
            fontFamily="Inter", fontWeight=600, fontSize=48,
            color="#F1F5F9", highlightColor="#60A5FA", strokeColor=None,
            strokeWidth=0, backgroundColor="#0B0D12CC", position="bottom",
            case="none", animation="fade", wordsPerCaption=6,
        ),
        broll=BrollStyle(frequency="low", defaultScale=0.4, position="bottom-left", transitionMs=350),
    ),
    "gaming": VideoTemplate(
        id="gaming",
        name="Gaming",
        category="Gaming",
        description="Neon high-contrast captions built for fast gameplay footage.",
        tags=["gameplay", "neon"],
        aspectRatio="9:16",
        accentColor="#A3E635",
        thumbnailUrl="/api/templates/thumbnails/gaming.jpg",
        overlayVideoUrl="/api/templates/overlays/gaming.mp4",
        caption=CaptionStyle(
            fontFamily="Space Grotesk", fontWeight=800, fontSize=80,
            color="#A3E635", highlightColor="#FFFFFF", strokeColor="#000000",
            strokeWidth=3, backgroundColor=None, position="top",
            case="upper", animation="bounce", wordsPerCaption=2,
        ),
        broll=BrollStyle(frequency="medium", defaultScale=0.55, position="center", transitionMs=150),
    ),
    "education": VideoTemplate(
        id="education",
        name="Education",
        category="Education",
        description="Slower-paced, high-legibility captions for explainer and how-to content.",
        tags=["explainer", "legible"],
        aspectRatio="4:5",
        accentColor="#5EEAD4",
        thumbnailUrl="/api/templates/thumbnails/education.jpg",
        overlayVideoUrl="/api/templates/overlays/education.mp4",
        caption=CaptionStyle(
            fontFamily="Inter", fontWeight=600, fontSize=52,
            color="#FFFFFF", highlightColor="#5EEAD4", strokeColor=None,
            strokeWidth=0, backgroundColor="#00000066", position="bottom",
            case="none", animation="fade", wordsPerCaption=6,
        ),
        broll=BrollStyle(frequency="low", defaultScale=0.5, position="top-right", transitionMs=300),
    ),
}


def list_templates() -> list[VideoTemplate]:
    return list(TEMPLATES.values())


def get_template(template_id: str) -> VideoTemplate | None:
    return TEMPLATES.get(template_id)
