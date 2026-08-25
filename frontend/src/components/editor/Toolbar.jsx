import { Link } from 'react-router-dom'
import {
  Home,
  Scissors,
  MessageSquare,
  Dices,
  Undo2,
  Redo2,
  Save,
  Download,
  Loader2,
  Sparkles
} from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

export default function Toolbar({ activeTab, onTabChange }) {
  const { project, isPlaying, setPlaying, openExportPanel, exportJob } = useEditorStore()

  const jobStatus = exportJob?.status
  const label =
    jobStatus === 'processing' || jobStatus === 'queued'
      ? 'Rendering...'
      : jobStatus === 'failed'
      ? 'Export failed'
      : 'Export'

  return (
    <header className="flex h-14 items-center justify-between bg-dark-bg px-5 select-none z-20 shadow-lg shadow-black/40">
      {/* Left: Home Button & Project Title */}
      <div className="flex items-center gap-3 min-w-0 max-w-[38%]">
        <Link
          to="/"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-dark-panel text-slate-300 shadow-md hover:bg-dark-panel2 hover:text-white transition"
          title="Back to Dashboard"
        >
          <Home className="h-4 w-4" />
        </Link>
        <span className="truncate text-xs font-bold text-slate-200 tracking-tight" title={project?.name}>
          {project?.name || 'Saveinta.com_AONSKQuO6tJvgUp3n3FrmB0ltwBzZdxpBf58A9NKWJCDDHFI-...'}
        </span>
      </div>

      {/* Center: Workflow Tabs */}
      <div className="flex items-center gap-1.5 rounded-2xl bg-dark-panel p-1 shadow-md shadow-black/30">
        <button
          onClick={() => onTabChange?.('trim')}
          className={`flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${
            activeTab === 'trim'
              ? 'bg-primary text-white shadow-purpleGlow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Trim Video Clips"
        >
          <Scissors className="h-3.5 w-3.5" />
          Trim
        </button>
        <button
          onClick={() => onTabChange?.('captions')}
          className={`flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${
            activeTab === 'captions'
              ? 'bg-primary text-white shadow-purpleGlow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Captions & Subtitle Styling"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Caption
        </button>
        <button
          onClick={() => onTabChange?.('scenes')}
          className={`flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${
            activeTab === 'scenes'
              ? 'bg-primary text-white shadow-purpleGlow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="B-roll Footage & Scenes"
        >
          <Dices className="h-3.5 w-3.5" />
          B-roll & Scenes
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-dark-panel hover:text-white transition shadow-sm"
          title="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-dark-panel hover:text-white transition shadow-sm"
          title="Redo"
        >
          <Redo2 className="h-4 w-4" />
        </button>

        <div className="mx-1 h-4 w-px bg-slate-800" />

        <button
          onClick={() => setPlaying(!isPlaying)}
          className="flex items-center gap-1.5 rounded-xl bg-dark-panel px-3.5 py-1.5 text-xs font-bold text-slate-200 shadow-md hover:bg-dark-panel2 hover:text-white transition"
          title="Save project"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </button>

        <button
          onClick={openExportPanel}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-white shadow-purpleGlow hover:bg-primary-hover transition"
          title="Export Video"
        >
          {jobStatus === 'processing' || jobStatus === 'queued' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {label}
        </button>

        {jobStatus === 'done' && exportJob.outputUrl && (
          <a
            href={exportJob.outputUrl}
            className="flex items-center gap-1.5 rounded-xl bg-primary/20 px-3.5 py-1.5 text-xs font-bold text-primary shadow-sm hover:bg-primary/30 transition"
            download
            title={`Download rendered ${(exportJob.format || 'mp4').toUpperCase()}`}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        )}
      </div>
    </header>
  )
}
