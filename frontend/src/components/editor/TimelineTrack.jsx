import TimelineItem from './TimelineItem'

const LABELS = { video: 'Video', broll: 'B-roll', caption: 'Captions', audio: 'Audio', sfx: 'SFX', zoom: 'Zoom' }

export default function TimelineTrack({ track, pxPerSecond, selectedItemId, onSelectItem, widthPx }) {
  return (
    <div className="flex border-b border-line/70">
      <div className="w-20 shrink-0 border-r border-line/70 bg-panel2 px-2 py-2 text-[11px] font-display uppercase tracking-wide text-slate-400">
        {LABELS[track.type] || track.type}
      </div>
      <div className="relative h-10 flex-1" style={{ width: widthPx }}>
        {track.items.map((item) => (
          <TimelineItem
            key={item.id}
            item={item}
            pxPerSecond={pxPerSecond}
            selected={item.id === selectedItemId}
            onSelect={onSelectItem}
          />
        ))}
      </div>
    </div>
  )
}
