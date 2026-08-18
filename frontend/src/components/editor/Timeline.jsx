import { useMemo, useRef, useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import TimelineTrack from './TimelineTrack'

export default function Timeline() {
  const { timeline, currentTime, setCurrentTime, selectedItemId, selectItem } = useEditorStore()
  const [pxPerSecond, setPxPerSecond] = useState(60)
  const containerRef = useRef(null)

  const duration = Math.max(timeline.project.duration, 8)
  const widthPx = duration * pxPerSecond

  function seekFromClientX(clientX) {
    const rect = containerRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const t = Math.min(Math.max(x / pxPerSecond, 0), duration)
    setCurrentTime(t)
  }

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex items-center justify-between border-b border-line/70 px-3 py-1.5">
        <span className="font-display text-xs uppercase tracking-wide text-slate-400">Timeline</span>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{currentTime.toFixed(1)}s</span>
          <button
            className="rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent"
            onClick={() => setPxPerSecond((p) => Math.max(20, p - 20))}
          >
            −
          </button>
          <button
            className="rounded border border-line px-2 py-0.5 hover:border-accent hover:text-accent"
            onClick={() => setPxPerSecond((p) => Math.min(220, p + 20))}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden" ref={containerRef}>
        <div className="relative" style={{ width: widthPx + 80 }}>
          {/* ruler */}
          <div
            className="sticky top-0 z-10 flex h-6 cursor-pointer border-b border-line/70 bg-panel2 pl-20"
            onMouseDown={(e) => seekFromClientX(e.clientX)}
          >
            {Array.from({ length: Math.ceil(duration) + 1 }).map((_, s) => (
              <div key={s} className="relative shrink-0 text-[10px] text-slate-500" style={{ width: pxPerSecond }}>
                <span className="absolute left-1 top-0.5">{s % 5 === 0 ? `${s}s` : ''}</span>
                <span className="absolute bottom-0 left-0 h-1.5 border-l border-line" />
              </div>
            ))}
          </div>

          <div className="relative" onMouseDown={(e) => e.target === e.currentTarget && selectItem(null)}>
            {timeline.tracks.map((track) => (
              <TimelineTrack
                key={track.id}
                track={track}
                pxPerSecond={pxPerSecond}
                widthPx={widthPx}
                selectedItemId={selectedItemId}
                onSelectItem={selectItem}
              />
            ))}

            {/* playhead */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent"
              style={{ left: 80 + currentTime * pxPerSecond }}
            >
              <div className="absolute -left-1.5 -top-0.5 h-2.5 w-2.5 rotate-45 bg-accent" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
