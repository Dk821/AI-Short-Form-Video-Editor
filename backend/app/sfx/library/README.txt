Placeholder SFX library
========================

These 8 files are simple synthesized placeholder tones (sine waves / filtered
noise, generated with ffmpeg — no external audio, no licensing concerns),
standing in for a real royalty-free SFX pack. They're wired up end-to-end
(catalog API, attach-to-timeline, live preview, export), so the whole
Sound feature works today — the tones themselves just aren't polished.

To swap in real sound effects, replace a file below with a real one of the
SAME filename (keeps the catalog in registry.py unchanged), or add new
entries to SFX_CATALOG in ../registry.py pointing at new files you drop
here. Any common ffmpeg-readable audio format works (mp3/wav/m4a/ogg) —
just match the extension you register.

  pop.mp3                 - short percussive blip (UI)
  click_tap.mp3            - tiny high tick (UI)
  ding_notification.mp3    - two-tone bell ding (Notification)
  success_chime.mp3        - ascending two-note chime (Notification)
  drum_hit.mp3             - low punchy thump (Impact)
  impact_boom.mp3          - deeper, longer low hit (Impact)
  whoosh_transition.mp3    - filtered noise sweep (Transition)
  riser_build.mp3          - rising-pitch tension riser (Transition)
