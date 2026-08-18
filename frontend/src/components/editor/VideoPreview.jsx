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
  Sliders
} from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import { api } from '../../services/api'

export default function VideoPreview() {
  const { timeline, assets, currentTime, isPlaying, setCurrentTime, setPlaying } = useEditorStore()
  const videoRef = useRef(null)
  const [previewTab, setPreviewTab] = useState('brand')
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)

  const videoTrack = timeline?.tracks?.find((t) => t.type === 'video')
  const mainItem = videoTrack?.items?.[0]
  const mainAsset = mainItem && assets.find((a) => a.id === mainItem.assetId)

  const brollItems = timeline?.tracks?.find((t) => t.type === 'broll')?.items || []
  const overlayItems = timeline?.tracks?.find((t) => t.type === 'overlay')?.items || []
  const captionItems = timeline?.tracks?.find((t) => t.type === 'caption')?.items || []
  const zoomItems = timeline?.tracks?.find((t) => t.type === 'zoom')?.items || []

  const currentTemplateId = useEditorStore((s) => s.project?.templateId)
  const templates = useEditorStore((s) => s.templates)
  const currentTemplate = templates.find((t) => t.id === currentTemplateId)

  const { width, height } = timeline?.project || { width: 1080, height: 1920 }
  const duration = timeline?.project?.duration || 14.18

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (isPlaying) {
      v.muted = isMuted
      v.volume = isMuted ? 0 : volume
      v.play().catch(() => {
        // Fallback for strict browser autoplay policy
        v.muted = true
        v.play().catch(() => { })
      })
    } else {
      v.pause()
    }
  }, [isPlaying])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = isMuted
    v.volume = isMuted ? 0 : volume
  }, [isMuted, volume])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (Math.abs(v.currentTime - currentTime) > 0.3) {
      v.currentTime = currentTime
    }
  }, [currentTime])

  function onTimeUpdate(e) {
    if (isPlaying) setCurrentTime(e.target.currentTime)
  }

  function activeAt(item) {
    return currentTime >= item.start && currentTime <= item.start + item.duration
  }

  const activeZoom = zoomItems.find(activeAt)
  const zoomScale = activeZoom ? activeZoom.transform.scale : 1

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
            className="relative overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/80"
            style={{ height: '100%', maxHeight: 460, aspectRatio: width / height }}
          >


            {mainAsset ? (
              <video
                ref={videoRef}
                src={api.assetUrl(mainAsset)}
                className="h-full w-full object-cover transition-transform duration-200 ease-out"
                style={{ transform: `scale(${zoomScale})` }}
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

            {/* Active Template Screen Blend Video Overlay (Light leaks, Grain, Sparkles, FX) */}
            {currentTemplate?.overlayVideoUrl && (
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
            {[...brollItems, ...overlayItems].filter(activeAt).map((item) => {
              const asset = assets.find((a) => a.id === item.assetId)
              if (!asset) {
                return (
                  <div
                    key={item.id}
                    className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-slate-950/90 backdrop-blur-md px-3.5 py-1 text-xs font-bold text-primary shadow-lg"
                  >
                    🔍 {item.type === 'overlay' ? 'Overlay' : 'B-roll'}: {item.keyword}
                  </div>
                )
              }
              const isVideo = asset.kind === 'video'
              const blendMode = item.blendMode || (item.type === 'overlay' ? 'screen' : 'normal')
              const style = {
                left: (item.transform.x / width) * 100 + '%',
                top: (item.transform.y / height) * 100 + '%',
                width: (item.type === 'overlay' ? 100 : 50 * item.transform.scale) + '%',
                opacity: item.opacity,
                mixBlendMode: blendMode !== 'normal' ? blendMode : undefined,
              }
              return isVideo ? (
                <video key={item.id} src={api.assetUrl(asset)} className="absolute rounded-xl shadow-2xl z-10" style={style} autoPlay muted loop />
              ) : (
                <img key={item.id} src={api.assetUrl(asset)} className="absolute rounded-xl shadow-2xl z-10" style={style} />
              )
            })}

            {/* Caption Overlays */}
            {captionItems.filter(activeAt).map((item) => {
              const strokeW = item.strokeWidth || 0
              const textShadow = strokeW
                ? `-${strokeW}px 0 ${item.strokeColor}, 0 ${strokeW}px ${item.strokeColor}, ${strokeW}px 0 ${item.strokeColor}, 0 -${strokeW}px ${item.strokeColor}`
                : 'none'
              const words = (item.text || '').split(' ')
              return (
                <div
                  key={item.id}
                  className={`absolute left-0 right-0 flex justify-center px-6 z-10 ${item.position === 'top' ? 'top-6' : item.position === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-8'
                    }`}
                >
                  <span
                    key={`${item.id}-${item.start}`}
                    className={`rounded-xl px-3.5 py-1 text-center font-black leading-tight caption-anim-${item.animation || 'fade'}`}
                    style={{
                      color: item.color || '#E11D48',
                      fontSize: Math.max(16, (item.fontSize || 64) / 3.0),
                      fontFamily: item.fontFamily === 'Space Grotesk'
                        ? "'Space Grotesk', sans-serif"
                        : item.fontFamily === 'Montserrat'
                          ? "'Montserrat', sans-serif"
                          : `'${item.fontFamily || 'Inter'}', sans-serif`,
                      fontWeight: 900,
                      backgroundColor: item.backgroundColor || 'transparent',
                      textShadow,
                      letterSpacing: item.case === 'upper' ? '0.04em' : 0,
                    }}
                  >
                    {words.map((w, wIdx) => {
                      const isHighlighted = wIdx === 0 && item.highlightColor
                      return (
                        <span
                          key={wIdx}
                          className={isHighlighted ? 'rounded px-1.5 py-0.5 shadow-sm' : ''}
                          style={{
                            backgroundColor: isHighlighted ? item.highlightColor : undefined,
                            color: isHighlighted ? '#0F172A' : undefined,
                            marginRight: wIdx < words.length - 1 ? '0.25em' : 0,
                          }}
                        >
                          {w}
                        </span>
                      )
                    })}
                  </span>
                </div>
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
