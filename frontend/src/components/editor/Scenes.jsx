import { useEffect, useRef, useState } from 'react'
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
  Trash2,
  ArrowLeft,
  ChevronRight,
  Check,
} from 'lucide-react'

// Kept in sync with BrollPicker.jsx's attach-time options so editing an
// already-placed b-roll's transition offers the exact same choices.
const REVEAL_ANIMATIONS = [
  { id: 'none', label: 'None' },
  { id: 'slide_down', label: 'Slide Down' },
  { id: 'slide_up', label: 'Slide Up' },
  { id: 'slide_left', label: 'Slide Left' },
  { id: 'slide_right', label: 'Slide Right' },
  { id: 'fade_in', label: 'Fade In' },
  { id: 'zoom_in', label: 'Zoom In' },
  { id: 'wipe_down', label: 'Wipe Down' },
  { id: 'bounce_in', label: 'Bounce In' },
]

const LAYOUTS = [
  { id: 'full', label: 'Full Screen' },
  { id: 'split_top', label: 'Top Split' },
  { id: 'split_bottom', label: 'Bottom Split' },
]

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
    updateItem,
    removeItem,
  } = useEditorStore()

  const sceneList = scenes()
  const hasTranscript = !!transcript?.words?.length
  const [activeSceneId, setActiveSceneId] = useState(null)

  // Dropdown shown when clicking an already-attached b-roll indicator:
  // 'menu' = the 3-option list, 'transition' = the inline animation/layout editor.
  const [brollMenuSceneId, setBrollMenuSceneId] = useState(null)
  const [brollMenuView, setBrollMenuView] = useState('menu')
  const brollMenuRef = useRef(null)

  useEffect(() => {
    if (!brollMenuSceneId) return
    function handleClickOutside(e) {
      if (brollMenuRef.current && !brollMenuRef.current.contains(e.target)) {
        setBrollMenuSceneId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [brollMenuSceneId])

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
                  <div className="relative w-full">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (broll.length) {
                          setBrollMenuView('menu')
                          setBrollMenuSceneId((cur) => (cur === scene.id ? null : scene.id))
                        } else {
                          openBrollLibraryForScene(scene)
                        }
                      }}
                      className={`flex w-full aspect-square items-center justify-center rounded-xl border transition shadow-sm relative ${
                        broll.length
                          ? 'bg-primary/20 border-primary/50 text-primary shadow-purpleGlow'
                          : 'bg-dark-panel3 border-dark-border text-slate-400 hover:border-primary/40 hover:text-slate-200'
                      }`}
                      title={broll.length ? `${broll.length} B-roll attached — click to edit` : 'Add B-roll'}
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

                    {brollMenuSceneId === scene.id && (
                      <BrollOptionsMenu
                        menuRef={brollMenuRef}
                        view={brollMenuView}
                        setView={setBrollMenuView}
                        item={broll[0]}
                        onAddNew={() => {
                          setBrollMenuSceneId(null)
                          openBrollLibraryForScene(scene)
                        }}
                        onDelete={() => {
                          broll.forEach((it) => removeItem(it.id))
                          setBrollMenuSceneId(null)
                        }}
                        onUpdate={(patch) => broll[0] && updateItem(broll[0].id, patch)}
                        onClose={() => setBrollMenuSceneId(null)}
                      />
                    )}
                  </div>

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

// Floating popup shown when clicking an already-attached b-roll indicator.
// Mirrors the activeOptionMenuId popup convention used elsewhere in the
// editor (absolute positioning, stopPropagation, fade/zoom-in entrance,
// dark-panel/dark-border/shadow-2xl styling) — with click-outside-to-close
// added on top via the parent's mousedown listener.
function BrollOptionsMenu({ menuRef, view, setView, item, onAddNew, onDelete, onUpdate, onClose }) {
  return (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      className="absolute left-full top-0 ml-2 z-50 w-64 rounded-2xl border border-dark-border bg-dark-panel p-1.5 shadow-2xl shadow-black/60 animate-in fade-in zoom-in-95 duration-150"
    >
      {view === 'menu' ? (
        <div className="flex flex-col gap-0.5">
          <button
            onClick={onAddNew}
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-bold text-slate-200 hover:bg-dark-panel3 transition"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Plus className="h-3.5 w-3.5" />
            </span>
            Add New B-roll
          </button>

          <button
            onClick={() => setView('transition')}
            disabled={!item}
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-bold text-slate-200 hover:bg-dark-panel3 transition disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-dark-panel3 text-slate-300">
              <Wand2 className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1">Edit Transition</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
          </button>

          <div className="my-1 h-px bg-dark-border" />

          <button
            onClick={onDelete}
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-bold text-danger hover:bg-red-950/40 transition"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-950/50 text-danger">
              <Trash2 className="h-3.5 w-3.5" />
            </span>
            Delete B-roll
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 p-1">
          <button
            onClick={() => setView('menu')}
            className="flex w-fit items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-slate-200 transition"
          >
            <ArrowLeft className="h-3 w-3" />
            Back
          </button>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Reveal Animation
            </p>
            <div className="grid grid-cols-2 gap-1">
              {REVEAL_ANIMATIONS.map((anim) => (
                <button
                  key={anim.id}
                  onClick={() => onUpdate({ revealAnimation: anim.id })}
                  className={`flex items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${
                    item?.revealAnimation === anim.id
                      ? 'border-primary/60 bg-primary/20 text-primary'
                      : 'border-dark-border bg-dark-panel3 text-slate-300 hover:border-primary/30'
                  }`}
                >
                  {anim.label}
                  {item?.revealAnimation === anim.id && <Check className="h-3 w-3 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Screen Layout
            </p>
            <div className="grid grid-cols-1 gap-1">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onUpdate({ layout: l.id })}
                  className={`flex items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${
                    item?.layout === l.id
                      ? 'border-primary/60 bg-primary/20 text-primary'
                      : 'border-dark-border bg-dark-panel3 text-slate-300 hover:border-primary/30'
                  }`}
                >
                  {l.label}
                  {item?.layout === l.id && <Check className="h-3 w-3 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Reveal Speed (s)
            </p>
            <input
              type="number"
              min="0.1"
              max="3"
              step="0.1"
              value={item?.revealDuration ?? 0.5}
              onChange={(e) => onUpdate({ revealDuration: parseFloat(e.target.value) || 0.5 })}
              className="w-full rounded-lg border border-dark-border bg-dark-panel3 px-2 py-1.5 text-xs font-bold text-slate-200 outline-none focus:border-primary/60"
            />
          </div>

          <button
            onClick={onClose}
            className="mt-1 rounded-xl bg-primary px-2.5 py-1.5 text-[11px] font-bold text-white shadow-purpleGlow hover:bg-primary-hover transition"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
