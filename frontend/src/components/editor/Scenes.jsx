import { useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import {
  Wand2,
  ZoomIn,
  Plus,
  Film,
  Image as ImageIcon,
  Music,
  Repeat2,
  MoreHorizontal,
  Sparkles,
  Video,
} from 'lucide-react'

export default function Scenes() {
  const {
    scenes,
    brollItemsInRange,
    zoomItemsInRange,
    openBrollLibraryForScene,
    toggleZoomForScene,
    runAutoEdit,
    isAutoEditing,
    autoEditResult,
    autoEditError,
    transcript,
    addCaption,
    setCurrentTime,
  } = useEditorStore()

  const sceneList = scenes()
  const hasTranscript = !!transcript?.words?.length
  const [activeSceneId, setActiveSceneId] = useState(null)

  if (!hasTranscript) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dark-panel2 text-slate-500 shadow-md">
          <Film className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-xs font-bold text-slate-200">No scenes generated yet</h3>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Transcribe your main video first. Scene segments will be auto-generated from your speech transcript.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-dark-panel font-body text-slate-100 select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-panel">
        <span className="text-xs font-bold tracking-tight text-slate-200 uppercase">Scenes</span>
        <div className="flex items-center gap-2">
          {/* Magic B-rolls button */}
          <button
            onClick={() => runAutoEdit()}
            disabled={isAutoEditing}
            className="relative flex items-center gap-1.5 rounded-full bg-dark-panel2 border border-dark-border px-3 py-1.5 text-xs font-bold text-slate-200 shadow-sm hover:bg-dark-panel3 hover:border-primary/50 transition disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            {isAutoEditing ? 'Planning...' : 'Magic B-rolls'}
            <span className="absolute -top-1 -right-0.5 text-[9px]">⚡</span>
          </button>

          {/* Magic Zooms button */}
          <button
            onClick={() => runAutoEdit()}
            disabled={isAutoEditing}
            className="relative flex items-center gap-1.5 rounded-full bg-dark-panel2 border border-dark-border px-3 py-1.5 text-xs font-bold text-slate-200 shadow-sm hover:bg-dark-panel3 hover:border-primary/50 transition disabled:opacity-40"
          >
            <ZoomIn className="h-3.5 w-3.5 text-primary-500" />
            {isAutoEditing ? 'Planning...' : 'Magic Zooms'}
            <span className="absolute -top-1 -right-0.5 text-[9px]">⚡</span>
          </button>

          {/* More options button */}
          <button className="flex h-7 w-7 items-center justify-center rounded-full border border-dark-border bg-dark-panel2 text-slate-400 hover:bg-dark-panel3 hover:text-white transition shadow-sm">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Auto edit error banner */}
      {autoEditError && (
        <div className="border-b border-danger/30 bg-red-950/40 px-4 py-2 text-[11px] font-semibold text-danger">
          {autoEditError}
        </div>
      )}

      {/* AI result hook summary card */}
      {autoEditResult && autoEditResult.hook && (
        <div className="flex items-start justify-between gap-3 border-b border-dark-border bg-primary/10 px-4 py-3">
          <p className="text-[11px] font-medium text-slate-200">
            <span className="font-bold text-primary">Hook Title: </span>
            {autoEditResult.hook}
          </p>
          <button
            onClick={() => {
              setCurrentTime(0)
              addCaption(autoEditResult.hook)
            }}
            className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-[10px] font-bold text-white shadow-purpleGlow hover:bg-primary-hover transition"
          >
            Use Hook
          </button>
        </div>
      )}

      {/* Scene list container */}
      <div className="flex-1 overflow-y-auto">
        {sceneList.map((scene, idx) => {
          const broll = brollItemsInRange(scene.start, scene.end)
          const zoomed = zoomItemsInRange(scene.start, scene.end).length > 0
          const isActive = activeSceneId === scene.id

          return (
            <div key={scene.id}>
              {/* Scene row */}
              <div
                className={`flex items-stretch border-b border-dark-border transition-colors cursor-pointer ${
                  isActive ? 'bg-dark-panel2' : 'bg-dark-panel hover:bg-dark-panel2/60'
                }`}
                onClick={() => {
                  setActiveSceneId(isActive ? null : scene.id)
                  setCurrentTime(scene.start)
                }}
              >
                {/* Left thumbnail & control column */}
                <div className="flex flex-col items-center justify-between gap-1.5 border-r border-dark-border px-2 py-3 w-[68px] shrink-0 bg-dark-panel2/40">
                  {/* Thumbnail / Add B-roll placeholder */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openBrollLibraryForScene(scene)
                    }}
                    className={`flex w-full aspect-square items-center justify-center rounded-xl border transition shadow-sm relative ${
                      broll.length
                        ? 'bg-primary/20 border-primary/50 text-primary shadow-purpleGlow'
                        : 'bg-dark-panel3 border-dark-border text-slate-400 hover:border-primary/40 hover:text-slate-200'
                    }`}
                    title={broll.length ? `${broll.length} B-roll attached` : 'Add B-roll'}
                  >
                    {broll.length ? (
                      <Film className="h-4 w-4 text-primary" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {broll.length > 0 && (
                      <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-black text-white flex items-center justify-center leading-none shadow-sm">
                        {broll.length}
                      </span>
                    )}
                  </button>

                  {/* Zoom toggle button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleZoomForScene(scene)
                    }}
                    className={`flex h-7 w-7 items-center justify-center rounded-xl border transition shadow-sm ${
                      zoomed
                        ? 'bg-primary border-primary text-white shadow-purpleGlow'
                        : 'bg-dark-panel3 border-dark-border text-slate-400 hover:border-primary/40 hover:text-slate-200'
                    }`}
                    title={zoomed ? 'Zoom active (click to remove)' : 'Add Zoom'}
                  >
                    <Repeat2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Right content column */}
                <div className="flex flex-1 flex-col justify-center px-4 py-3 min-w-0">
                  {/* Timestamp range */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold font-mono text-slate-400 tabular-nums">
                      {scene.start.toFixed(2)} — {scene.end.toFixed(2)}s
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500">
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Transcript text snippet */}
                  <p className="text-xs font-medium leading-relaxed text-slate-200 line-clamp-3">
                    {scene.text}
                  </p>

                  {/* Active scene inline quick actions */}
                  {isActive && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openBrollLibraryForScene(scene)
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-dark-border bg-dark-panel3 px-2.5 py-1 text-[11px] font-bold text-slate-300 shadow-sm hover:bg-dark-panel hover:text-white transition"
                      >
                        <ImageIcon className="h-3 w-3 text-primary" />
                        Add Image
                      </button>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 rounded-lg border border-dark-border bg-dark-panel3 px-2.5 py-1 text-[11px] font-bold text-slate-300 shadow-sm hover:bg-dark-panel hover:text-white transition"
                      >
                        <Music className="h-3 w-3 text-emerald-400" />
                        Add Sound
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        <div className="h-6" />
      </div>
    </div>
  )
}
