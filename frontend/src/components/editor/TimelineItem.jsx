const COLORS = {
  video: 'bg-slate-500/70 border-slate-300',
  broll: 'bg-accent2/60 border-accent2',
  caption: 'bg-accent/60 border-accent',
  audio: 'bg-indigo-500/60 border-indigo-300',
  sfx: 'bg-amber-500/60 border-amber-300',
  zoom: 'bg-fuchsia-500/60 border-fuchsia-300',
}

export default function TimelineItem({ item, pxPerSecond, selected, onSelect }) {
  const left = item.start * pxPerSecond
  const width = Math.max(item.duration * pxPerSecond, 6)
  const isSuggestion = item.type === 'broll' && !item.assetId && item.keyword

  const label = item.text || (isSuggestion ? `🔍 ${item.keyword}` : item.type === 'zoom' ? 'zoom' : item.type)

  return (
    <div
      onClick={() => onSelect(item.id)}
      className={`absolute top-1 bottom-1 cursor-pointer rounded-md border px-2 py-1 text-[11px] font-medium text-white/90 shadow-sm transition ${
        COLORS[item.type] || 'bg-slate-600'
      } ${isSuggestion ? 'border-dashed opacity-80' : ''} ${selected ? 'ring-2 ring-white' : ''}`}
      style={{ left, width }}
      title={item.text || item.keyword || item.assetId || item.type}
    >
      <span className="truncate block">{label}</span>
    </div>
  )
}
