import { useEffect, useRef, useState } from 'react'
import {
  Sparkles,
  Music,
  Image as ImageIcon,
  Eye,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  ChevronDown,
  Film,
  SkipBack,
  Sliders,
  Save,
  Loader2,
  Check
} from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { api } from '../../services/api'
import { BrollAnimation, computeBaseVideoStyle, SpeakerPreview } from './animations'
import useOverlaySourceSync from './animations/useOverlaySourceSync'
import { fetchCaptionLayout, resolveOverlayFont } from '../../lib/captionLayout'

// Unicode glyph shown before a CTA's text, keyed by item.ctaIcon — MUST
// mirror backend/app/render.py's _CTA_ICON_GLYPHS exactly (same names,
// same characters) so the live preview and the exported video agree on
// what a given icon name looks like, per this app's one golden rule.
const CTA_ICON_GLYPHS = {
  arrow: '→',
  heart: '♥',
  cart: '\u{1F6D2}',
  link: '\u{1F517}',
  star: '★',
  fire: '\u{1F525}',
  bell: '\u{1F514}',
  play: '▶',
}

// Renders a broll/overlay item that carries its own `sourceUrl` but no
// resolved `assetId` (e.g. a template's burst-timed overlay video — see
// routers/templates.py _apply_overlay_video). A separate component (not
// inline JSX) so useOverlaySourceSync — which seeks this element to the
// right point in its source and decides trim/loop/hold, see
// lib/overlayResolver.js — can be a real hook call per item.
function RawSourceOverlayVideo({ item, currentTime }) {
  const [videoEl, setVideoEl] = useState(null)
  useOverlaySourceSync(videoEl, item, currentTime)
  return (
    <video
      ref={setVideoEl}
      src={item.sourceUrl}
      className="absolute inset-0 h-full w-full object-cover pointer-events-none z-10"
      style={{
        mixBlendMode: item.blendMode || 'screen',
        opacity: item.opacity ?? 0.85,
      }}
      autoPlay
      muted
      playsInline
    />
  )
}

// Plays back one audio/sfx track item's clip in sync with the main video —
// without this, an attached sound effect only ever plays in the exported
// file (render.py's amix), never in the live canvas, which reads as "the
// sound effect doesn't work" even though it's correctly on the timeline.
// Seeks to (item.sourceStart + elapsed-since-item.start) exactly like the
// main video's own currentTime-sync effect below, and mirrors the same
// isMuted/volume controls so muting the preview mutes everything in it,
// not just the main clip.
function TrackAudioPlayer({ item, src, currentTime, isPlaying, isMuted, volume }) {
  const audioRef = useRef(null)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const target = Math.max(0, (item.sourceStart || 0) + (currentTime - item.start))
    if (Math.abs(el.currentTime - target) > 0.25) {
      el.currentTime = target
    }
    el.muted = isMuted
    el.volume = Math.max(0, Math.min(1, (item.volume ?? 1) * volume))
    if (isPlaying && el.paused) {
      el.play().catch(() => { })
    } else if (!isPlaying && !el.paused) {
      el.pause()
    }
  }, [currentTime, isPlaying, isMuted, volume, item.start, item.sourceStart, item.volume])

  return <audio ref={audioRef} src={src} preload="auto" />
}

// Canvas layer order, back to front — keep every z-index in this file (and
// in BrollAnimation.jsx / SpeakerPreview.jsx) matching this list, since
// it's the one thing standing between "widgets read correctly" and a
// caption or speaker bubble getting buried under a b-roll clip:
//   0  main video            (SplitScreenLayout's computeBaseVideoStyle)
//   10 b-roll / overlay video (BrollAnimation.jsx, RawSourceOverlayVideo,
//                              template overlay-video fallback below)
//   20 captions
//   30 speaker PiP + CTA pill (always on top — small widgets that must
//                              never be hidden behind a full-frame b-roll)
export default function VideoPreview() {
  const {
    timeline, assets, currentTime, isPlaying, setCurrentTime, setPlaying,
    project, saveCover, isSavingCover, coverError,
  } = useEditorStore()
  const videoRef = useRef(null)
  const [previewTab, setPreviewTab] = useState('brand')
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [justSavedCover, setJustSavedCover] = useState(false)

  const videoTrack = timeline?.tracks?.find((t) => t.type === 'video')
  const mainItem = videoTrack?.items?.[0]
  const mainAsset = mainItem && assets.find((a) => a.id === mainItem.assetId)

  const brollTrack = timeline?.tracks?.find((t) => t.type === 'broll')
  const captionTrack = timeline?.tracks?.find((t) => t.type === 'caption')
  const overlayTrack = timeline?.tracks?.find((t) => t.type === 'overlay')
  const zoomTrack = timeline?.tracks?.find((t) => t.type === 'zoom')
  const ctaTrack = timeline?.tracks?.find((t) => t.type === 'cta')
  const audioTrack = timeline?.tracks?.find((t) => t.type === 'audio')
  const sfxTrack = timeline?.tracks?.find((t) => t.type === 'sfx')

  const brollItems = brollTrack?.items || []
  // .hidden items are skipped in the live preview the same way render.py
  // skips them at export — see models.py's `hidden` field.
  const captionItems = (captionTrack?.items || []).filter((it) => !it.hidden)
  const overlayItems = overlayTrack?.items || []
  const zoomItems = zoomTrack?.items || []
  const ctaItems = ctaTrack?.items || []
  const audioItems = audioTrack?.items || []
  const sfxItems = sfxTrack?.items || []

  // Speaker items also live on the "overlay" track (see models.py) but are
  // never rendered through the generic BrollAnimation full-frame/split
  // path below — that would stretch a small PiP bubble across the whole
  // canvas. They get their own SpeakerPreview block instead.
  const speakerItems = overlayItems.filter((it) => it.type === 'speaker')
  const genericOverlayItems = overlayItems.filter((it) => it.type !== 'speaker')

  const currentTemplate = useEditorStore((s) => (typeof s?.currentTemplate === 'function' ? s.currentTemplate() : null))
  const width = timeline?.project?.aspectRatio === '16:9' ? 1920 : 1080
  const height = timeline?.project?.aspectRatio === '16:9' ? 1080 : 1920
  const duration = timeline?.project?.duration || mainItem?.duration || 10

  useEffect(() => {
    if (!videoRef.current) return
    const diff = Math.abs(videoRef.current.currentTime - currentTime)
    if (diff > 0.3) {
      videoRef.current.currentTime = currentTime
    }
    if (isPlaying && videoRef.current.paused) {
      videoRef.current.play().catch(() => { })
    } else if (!isPlaying && !videoRef.current.paused) {
      videoRef.current.pause()
    }
  }, [currentTime, isPlaying])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted
      videoRef.current.volume = volume
    }
  }, [isMuted, volume])

  function onTimeUpdate(e) {
    if (isPlaying) setCurrentTime(e.target.currentTime)
  }

  function activeAt(item) {
    return currentTime >= item.start && currentTime <= item.start + item.duration
  }

  const activeZoom = zoomItems.find(activeAt)
  const zoomScale = activeZoom ? activeZoom.transform.scale : 1

  const activeBroll = brollItems.find(activeAt)
  const activeSplitItem = activeBroll || genericOverlayItems.filter(activeAt).find((it) => it.layout === 'split_top' || it.layout === 'split_bottom')

  const baseStyle = computeBaseVideoStyle({ activeSplitItem, zoomScale, currentTime })

  // Caption typography parity: measure the CANVAS box's actual rendered
  // CSS pixel size so captions can be laid out once in canvas-space
  // (item.fontSize's own units — the exact same units render.py's FFmpeg
  // export uses) and scaled down with a single CSS transform, instead of
  // the old fixed `/3.0` divisor that had no relationship to the box's
  // real size. See captionLayout.js's module docstring.
  const canvasViewportRef = useRef(null)
  const [canvasViewportHeight, setCanvasViewportHeight] = useState(0)
  useEffect(() => {
    const el = canvasViewportRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setCanvasViewportHeight(rect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const canvasScale = canvasViewportHeight > 0 ? canvasViewportHeight / height : 0

  // One canonical layout per currently-active caption line — fetched
  // from POST /api/captions/layout (backend/app/caption_layout.py's
  // layout_caption(), the SAME function render.py's FFmpeg export calls
  // in-process). No wrapping/measurement happens in the browser any
  // more — see captionLayout.js's fetchCaptionLayout(). Computed
  // asynchronously (it loads whatever font files it needs first) and
  // cached by item id so re-entering the same caption's time range
  // doesn't re-fetch it.
  const activeCaptionItems = captionItems.filter(activeAt)
  const [captionLayouts, setCaptionLayouts] = useState({})
  const captionStyleKey = JSON.stringify(activeCaptionItems.map((it) => ({
    id: it.id, text: it.text, position: it.position, animation: it.animation, case: it.case,
    fontFamily: it.fontFamily, fontWeight: it.fontWeight, fontSize: it.fontSize,
    color: it.color, backgroundColor: it.backgroundColor,
    strokeColor: it.strokeColor, strokeWidth: it.strokeWidth,
    highlightColor: it.highlightColor, stressWordIndices: it.stressWordIndices,
    stressFontFamily: it.stressFontFamily, stressFontWeight: it.stressFontWeight,
    stressFontStyle: it.stressFontStyle, stressFontSize: it.stressFontSize,
    stressColor: it.stressColor, stressBackgroundColor: it.stressBackgroundColor,
    stressStrokeEnabled: it.stressStrokeEnabled, stressStrokeColor: it.stressStrokeColor,
    stressStrokeWidth: it.stressStrokeWidth, stressPadding: it.stressPadding,
    stressCornerRadius: it.stressCornerRadius,
  })))
  useEffect(() => {
    let cancelled = false
    activeCaptionItems.forEach((item) => {
      fetchCaptionLayout(item, width, height).then((layout) => {
        if (!cancelled) setCaptionLayouts((prev) => ({ ...prev, [item.id]: layout }))
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionStyleKey, width, height])

  // CTA pill font — resolved the SAME way render.py's CTA drawtext path
  // resolves it (resolve_font(item.fontFamily, item.fontWeight, "normal")
  // — CTAs have no separate fontStyle field on TimelineItem, so "normal"
  // is hardcoded here too, matching render.py exactly), loaded as the
  // exact physical font file via the same per-file FontFace mechanism
  // caption words use. Previously this pill only used Tailwind's
  // hardcoded font-extrabold class, which ignored the item's actual
  // fontFamily/fontWeight entirely and always looked like weight ~800
  // regardless of what Export would render.
  const activeCtaItems = ctaItems.filter(activeAt)
  const [ctaFonts, setCtaFonts] = useState({})
  const ctaStyleKey = JSON.stringify(activeCtaItems.map((it) => ({
    id: it.id, fontFamily: it.fontFamily, fontWeight: it.fontWeight,
  })))
  useEffect(() => {
    let cancelled = false
    activeCtaItems.forEach((item) => {
      resolveOverlayFont(item.fontFamily, item.fontWeight, 'normal').then((font) => {
        if (!cancelled) setCtaFonts((prev) => ({ ...prev, [item.id]: font }))
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctaStyleKey])

  function formatTime(s) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    const cs = Math.floor((s % 1) * 100)
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
  }

  return (
    <div className="flex h-full flex-col p-6 bg-dark-bg select-none overflow-y-auto">
      <div className="flex flex-1 flex-col overflow-hidden rounded-3xl bg-dark-panel p-5 shadow-2xl shadow-black/60">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between pb-3.5 mb-3.5 shadow-sm">
          <span className="text-xs font-black uppercase tracking-wider text-slate-300">
            LIVE CANVAS PREVIEW
          </span>

          <div className="flex items-center gap-2">
            {/* Filter Toggle Button */}
            <button className="flex h-8 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-purpleGlow hover:bg-primary-hover transition">
              <Sliders className="h-4 w-4" />
            </button>

            <button
              onClick={() => setPreviewTab('brand')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${previewTab === 'brand'
                ? 'bg-dark-panel2 text-slate-100 shadow-md'
                : 'bg-dark-panel3 text-slate-400 hover:bg-dark-panel2 hover:text-white shadow-sm'
                }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-slate-300" />
              Brand Kit
            </button>

            <button
              onClick={() => setPreviewTab('audio')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${previewTab === 'audio'
                ? 'bg-dark-panel2 text-slate-100 shadow-md'
                : 'bg-dark-panel3 text-slate-400 hover:bg-dark-panel2 hover:text-white shadow-sm'
                }`}
            >
              <Music className="h-3.5 w-3.5 text-slate-300" />
              Audio Track
            </button>

            <button
              onClick={() => setPreviewTab('cover')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${previewTab === 'cover'
                ? 'bg-dark-panel2 text-slate-100 shadow-md'
                : 'bg-dark-panel3 text-slate-400 hover:bg-dark-panel2 hover:text-white shadow-sm'
                }`}
            >
              <ImageIcon className="h-3.5 w-3.5 text-slate-300" />
              Cover Image
            </button>
          </div>
        </div>



        {/* Main 9:16 Video Phone Viewport */}
        <div className="flex flex-1 items-center justify-center relative min-h-0 py-2">
          <div
            ref={canvasViewportRef}
            className="relative overflow-hidden rounded-2xl bg-black shadow-2xl shadow-black/80"
            style={{ height: '100%', maxHeight: 460, aspectRatio: width / height }}
          >

            {/* Cover Image picker — scrubbing uses the same scrubber bar
                below (it just moves currentTime, which this whole canvas
                already reacts to), so "what's on screen right now" already
                reflects the main video or whatever b-roll/split layer is
                active at that instant. Save just freezes it. */}
            {previewTab === 'cover' && (
              <div className="absolute inset-x-0 top-0 z-30 flex flex-col gap-1.5 bg-gradient-to-b from-black/85 via-black/40 to-transparent p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold leading-tight text-white drop-shadow">
                    Scrub to a frame below, then save it as your cover
                  </p>
                  <button
                    onClick={async () => {
                      await saveCover(currentTime)
                      setJustSavedCover(true)
                      setTimeout(() => setJustSavedCover(false), 2000)
                    }}
                    disabled={isSavingCover}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[11px] font-extrabold text-white shadow-purpleGlow hover:bg-primary-hover transition disabled:opacity-50"
                  >
                    {isSavingCover ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : justSavedCover ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {isSavingCover ? 'Saving...' : justSavedCover ? 'Saved' : 'Save as Cover'}
                  </button>
                </div>
                {coverError && (
                  <p className="text-[10px] font-semibold text-rose-400 drop-shadow">{coverError}</p>
                )}
                {project?.coverImage && (
                  <div className="flex items-center gap-1.5 self-start rounded-lg bg-black/50 px-1.5 py-1 backdrop-blur-sm">
                    <img src={project.coverImage} alt="Current cover" className="h-8 w-5 rounded object-cover border border-white/20" />
                    <span className="text-[10px] font-semibold text-slate-200">Current cover</span>
                  </div>
                )}
              </div>
            )}

            {mainAsset ? (
              <video
                ref={videoRef}
                src={api.assetUrl(mainAsset)}
                className="transition-transform duration-200 ease-out"
                style={baseStyle}
                onTimeUpdate={onTimeUpdate}
                onEnded={() => setPlaying(false)}
                playsInline
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-950 text-slate-400 p-6 text-center">
                <Film className="h-10 w-10 stroke-[1.2] text-slate-600" />
                <span className="text-xs font-bold text-slate-200">No video loaded</span>
                <span className="text-[11px] text-slate-500">Upload a video clip in sidebar</span>
              </div>
            )}

            {/* Active Template Screen Blend Video Overlay (Light leaks, Grain, Sparkles, FX).
                Fallback only — once apply-template has written the template's
                burst-timed overlay items to the timeline (see routers/templates.py
                _apply_overlay_video), those items already render below via the
                B-roll & Overlay Track Items block and are the source of truth for
                *when* the effect shows. This must check whether any item exists at
                all, not whether one is active right now, or the overlay would
                render continuously here every time playback is between bursts —
                exactly the "runs the whole clip" behavior burst timing exists to
                avoid. */}
            {currentTemplate?.overlayVideoUrl && !overlayItems.some(it => it.sourceUrl === currentTemplate.overlayVideoUrl) && (
              <video
                src={currentTemplate.overlayVideoUrl}
                className="absolute inset-0 h-full w-full object-cover pointer-events-none z-10"
                style={{
                  mixBlendMode: currentTemplate.overlay?.blendMode || 'screen',
                  opacity: currentTemplate.overlay?.opacity ?? 0.85,
                }}
                autoPlay
                muted
                loop
                playsInline
              />
            )}

            {/* B-roll & Overlay Track Items */}
            {[...brollItems, ...genericOverlayItems].filter(activeAt).map((item) => {
              const asset = assets.find((a) => a.id === item.assetId)
              if (!asset) {
                if (item.sourceUrl) {
                  return <RawSourceOverlayVideo key={item.id} item={item} currentTime={currentTime} />
                }
                return null
              }
              return (
                <BrollAnimation
                  key={item.id}
                  item={item}
                  asset={asset}
                  currentTime={currentTime}
                  src={api.assetUrl(asset)}
                />
              )
            })}

            {/* Caption Overlays — the ONE canonical layout computed
                server-side by backend/app/caption_layout.py's
                layout_caption() (see routers/captions.py's
                POST /api/captions/layout and captionLayout.js's
                fetchCaptionLayout()), rendered here VERBATIM at 1:1
                canvas-space pixel coordinates inside a wrapper scaled
                down to the viewport's actual rendered size. No wrapping,
                no measurement, and no font-fallback decision happens in
                this component — every x/y/baseline/font/color/stroke
                value below is read directly off the API response, the
                SAME response shape render.py's FFmpeg export builds its
                drawtext filters from via the identical Python function,
                in-process (_build_caption_filters). The one exception is
                "legacy highlight" (item.highlightColor on the very first
                word, pre-dating the stress-word feature): a purely
                decorative color override with no effect on position,
                size or wrapping, so it stays a local rendering decision
                layered on top of the canonical word — never a second
                layout calculation. */}
            {activeCaptionItems.map((item) => {
              const layout = captionLayouts[item.id]
              if (!layout || !canvasScale) return null
              let globalWordIdx = -1
              return (
                <div
                  key={item.id}
                  className="absolute left-0 top-0 z-9 pointer-events-none"
                  style={{
                    width, height,
                    transform: `scale(${canvasScale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <div
                    key={`${item.id}-${item.start}`}
                    className={`absolute inset-0 caption-anim-${item.animation || 'fade'}`}
                  >
                    {layout.lines.map((line, li) => (
                      <div key={li}>
                        {line.background && (
                          <span
                            className="absolute rounded-xl"
                            style={{
                              left: line.background.x,
                              top: line.background.y,
                              width: line.background.width,
                              height: line.background.height,
                              backgroundColor: line.background.color,
                            }}
                          />
                        )}
                        {line.words.map((pw, wi) => {
                          if (!pw.text) return null
                          globalWordIdx += 1
                          // "Legacy highlight" — the older single-first-
                          // word highlightColor toggle that pre-dates AI
                          // Stress Text Highlighter. render.py's FFmpeg
                          // export has never rendered this (it isn't part
                          // of the canonical layout at all — see
                          // caption_layout.py's resolve_words()), so it
                          // stays exactly what it always was: a
                          // Preview-only decoration on word 0.
                          const isLegacyHighlight = !pw.isStress && globalWordIdx === 0 && !!item.highlightColor
                          const fontFamily = `${pw.cssFamily}, sans-serif`
                          // strokeWidth comes from caption_layout.py's resolve_words() and
                          // is the SAME value FFmpeg's `borderw=` uses — both stress and
                          // non-stress words must use it as-is. The previous code halved
                          // non-stress stroke (Math.round(strokeWidth / 2)), which made
                          // Preview render a thinner stroke than the export produced.
                          const strokeW = pw.strokeWidth || 0
                          const textStyle = {
                            position: 'absolute',
                            left: pw.x,
                            top: pw.y,
                            fontSize: pw.fontSize,
                            lineHeight: 1,
                            fontFamily,
                            // Weight/style are always 400/normal here —
                            // the actual boldness/italic-ness comes from
                            // WHICH FILE (pw.fontFile) was loaded under
                            // this synthetic family name, not from a CSS
                            // descriptor asking the browser to pick or
                            // synthesize a different face.
                            fontWeight: 400,
                            fontStyle: 'normal',
                            color: isLegacyHighlight ? '#0F172A' : pw.color,
                            // letterSpacingPx is pre-computed server-side
                            // (fontSize * 0.04 when item.case === 'upper')
                            // so the wrap decision already accounted for
                            // it — this is just rendering that same value.
                            letterSpacing: pw.letterSpacingPx ? `${pw.letterSpacingPx}px` : 0,
                            WebkitTextStroke: !isLegacyHighlight && strokeW > 0 ? `${strokeW}px ${pw.strokeColor || '#000000'}` : 'none',
                            paintOrder: 'stroke fill',
                            whiteSpace: 'pre',
                          }
                          if (!pw.isStress) {
                            const bgColor = isLegacyHighlight ? item.highlightColor : pw.backgroundColor
                            return (
                              <span key={wi}>
                                {bgColor && (
                                  <span
                                    className="absolute rounded"
                                    style={{
                                      left: pw.x - pw.padding,
                                      top: pw.y - pw.padding,
                                      width: pw.width + pw.padding * 2,
                                      height: pw.ascent + pw.descent + pw.padding * 2,
                                      backgroundColor: bgColor,
                                    }}
                                  />
                                )}
                                <span style={textStyle}>{pw.text}</span>
                              </span>
                            )
                          }
                          // Stress words: the background pill (if any) and
                          // the text must animate together as ONE visual
                          // unit (stress-anim-pop/pulse/glow scale/glow the
                          // whole highlighted word), so both live inside a
                          // shared wrapper that carries the animation class
                          // — animating only one of the two would desync
                          // them from each other.
                          const hasBg = !!pw.backgroundColor
                          const unitLeft = hasBg ? pw.x - pw.padding : pw.x
                          const unitTop = hasBg ? pw.y - pw.padding : pw.y
                          return (
                            <span
                              key={wi}
                              className={`absolute rounded-md stress-anim-${item.stressAnimation || 'none'}`}
                              style={{
                                left: unitLeft,
                                top: unitTop,
                                width: hasBg ? pw.width + pw.padding * 2 : undefined,
                                height: hasBg ? pw.ascent + pw.descent + pw.padding * 2 : undefined,
                                backgroundColor: hasBg ? pw.backgroundColor : 'transparent',
                                borderRadius: hasBg ? pw.cornerRadius : 0,
                              }}
                            >
                              <span style={{ ...textStyle, position: 'absolute', left: hasBg ? pw.padding : 0, top: hasBg ? pw.padding : 0 }}>
                                {pw.text}
                              </span>
                            </span>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Speaker PiP widget(s) — mirrors render.py's dedicated
                "speaker" branch: a small corner bubble of the main
                video's own footage, never the full-frame/split path. */}
            {speakerItems.filter(activeAt).map((item) => (
              <SpeakerPreview
                key={item.id}
                item={item}
                src={api.assetUrl(mainAsset)}
                currentTime={currentTime}
                projectWidth={width}
                projectHeight={height}
              />
            ))}

            {/* CTA pill overlays — mirrors render.py's drawtext box=1
                pill rendering: same position slots as captions, same
                icon-glyph-then-text layout. */}
            {activeCtaItems.map((item) => (
              <div
                key={item.id}
                className={`absolute left-0 right-0 flex justify-center px-6 z-30 ${item.position === 'top'
                  ? 'top-6'
                  : item.position === 'center'
                    ? 'top-[60%] -translate-y-1/2'
                    : 'bottom-8'
                  }`}
              >
                <span
                  className="flex items-center gap-2 rounded-full px-4 py-2 text-center shadow-lg shadow-black/40"
                  style={{
                    color: item.color || '#FFFFFF',
                    backgroundColor: item.backgroundColor || '#7C3AED',
                    fontSize: Math.max(14, (item.fontSize || 42) / 3.0),
                    // Same font render.py's CTA drawtext will use — see the
                    // ctaFonts effect above. Weight/style are pinned to
                    // 400/normal once the exact file has loaded, because
                    // (as with caption words) the real boldness/italic-ness
                    // comes from WHICH FILE was loaded, not a CSS
                    // descriptor asking the browser to synthesize one.
                    // Falls back to the raw family/weight until it loads.
                    fontFamily: ctaFonts[item.id]?.cssFamily || item.fontFamily || 'Inter',
                    fontWeight: ctaFonts[item.id] ? 400 : (item.fontWeight || 600),
                    fontStyle: 'normal',
                  }}
                >
                  {item.ctaIcon && CTA_ICON_GLYPHS[item.ctaIcon] && <span>{CTA_ICON_GLYPHS[item.ctaIcon]}</span>}
                  {item.text}
                </span>
              </div>
            ))}

            {/* Audio & SFX tracks — no visual, just kept in sync with
                playback (see TrackAudioPlayer above) so an attached sound
                effect is actually audible while scrubbing/playing here,
                not just in the exported file. */}
            {[...audioItems, ...sfxItems].filter(activeAt).map((item) => {
              const asset = item.assetId ? assets.find((a) => a.id === item.assetId) : null
              const src = asset ? api.assetUrl(asset) : item.sourceUrl
              if (!src) return null
              return (
                <TrackAudioPlayer
                  key={item.id}
                  item={item}
                  src={src}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  isMuted={isMuted}
                  volume={volume}
                />
              )
            })}
          </div>
        </div>

        {/* Frame Info & Ratio Pills */}
        <div className="flex items-center justify-center gap-4 text-xs font-bold text-slate-400 my-2">
          <button className="flex items-center gap-1.5 hover:text-white transition">
            <Eye className="h-3.5 w-3.5" /> Hidden
          </button>
          <button className="flex items-center gap-1.5 text-slate-200 hover:text-white transition">
            9:16 Shorts <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
          <button className="flex items-center gap-1.5 hover:text-white transition" title="Refresh">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Glowing Purple Scrubber Bar */}
        <div
          className="relative my-2.5 h-2 w-full cursor-pointer rounded-full bg-[#242D42] shadow-inner"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            setCurrentTime(pct * duration)
          }}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary-600 to-primary-500 shadow-purpleGlow transition-all duration-100"
            style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>

        {/* Playback Controls Footer */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => setPlaying(!isPlaying)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-purpleGlow hover:bg-primary-hover transition"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="h-4 w-4 fill-white" /> : <Play className="h-4 w-4 fill-white ml-0.5" />}
            </button>
            <span className="text-xs font-mono font-bold text-slate-300">
              {formatTime(currentTime)} <span className="text-slate-600 font-normal">/</span> {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <button
              onClick={() => setCurrentTime(Math.max(0, currentTime - 5))}
              className="p-1.5 rounded-lg hover:bg-dark-panel2 hover:text-white transition shadow-sm"
              title="Seek -5s"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentTime(0)}
              className="p-1.5 rounded-lg hover:bg-dark-panel2 hover:text-white transition shadow-sm"
              title="Restart"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-1.5 rounded-lg transition shadow-sm ${isMuted ? 'text-rose-400 hover:bg-dark-panel2' : 'hover:bg-dark-panel2 hover:text-white'
                }`}
              title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              className="p-1.5 rounded-lg hover:bg-dark-panel2 hover:text-white transition shadow-sm"
              title="Fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
