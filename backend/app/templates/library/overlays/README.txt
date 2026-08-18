# Template overlay videos go here.
#
# Naming convention:  <template_id>.mp4
# Examples:
#   bold-viral-01.mp4
#   viral.mp4
#   podcast.mp4
#   tiktok.mp4
#   youtube_shorts.mp4
#   instagram_reels.mp4
#   gaming.mp4
#   business.mp4
#   education.mp4
#
# These files are served via FastAPI StaticFiles at:
#   GET /api/templates/overlays/<template_id>.mp4
#
# They are referenced in each template's JSON as:
#   "overlay": { "videoUrl": "/api/templates/overlays/<template_id>.mp4" }
#
# Recommended spec:
#   - Format  : MP4 (H.264 + AAC)
#   - Duration : 3–8 seconds, loopable
#   - Resolution: 1080x1920 (9:16) for vertical templates, 1920x1080 for Business (16:9)
#   - Size    : Keep under 5 MB per file for fast browser preview loading
