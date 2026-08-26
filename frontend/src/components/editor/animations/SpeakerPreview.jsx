import { useState } from 'react'
import useOverlaySourceSync from './useOverlaySourceSync'

// Speaker PiP bubble — a small corner copy of the main video's own
// footage (see models.py + render.py's dedicated "speaker" branch,
// which this mirrors exactly: same base-size fraction, same
// circle/rounded mask, same transform.x/y/scale positioning contract).
// item.transform.x/y are PROJECT-pixel coordinates (top-left corner),
// same convention every other transform-positioned overlay item already
// uses — converted to percentages here so the bubble lands in the same
// relative spot regardless of the preview canvas's on-screen CSS size.
const SPEAKER_BASE_FRAC = 0.34

export default function SpeakerPreview({ item, src, currentTime, projectWidth, projectHeight }) {
  const [videoEl, setVideoEl] = useState(null)
  useOverlaySourceSync(videoEl, item, currentTime)

  const scale = item.transform?.scale || 1
  const sizePct = (SPEAKER_BASE_FRAC * scale) * 100
  const leftPct = ((item.transform?.x || 0) / projectWidth) * 100
  const topPct = ((item.transform?.y || 0) / projectHeight) * 100

  return (
    <video
      ref={setVideoEl}
      src={src}
      className="absolute z-30 object-cover shadow-2xl shadow-black/50"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${sizePct}%`,
        aspectRatio: '1 / 1',
        borderRadius: item.shape === 'rounded' ? '16%' : '50%',
        border: '2px solid rgba(255,255,255,0.85)',
        opacity: item.opacity ?? 1,
      }}
      autoPlay
      muted
      playsInline
    />
  )
}
