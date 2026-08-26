import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useEditorStore } from '../stores/editorStore'
import Toolbar from '../components/editor/Toolbar'
import Sidebar from '../components/editor/Sidebar'
import VideoPreview from '../components/editor/VideoPreview'
import TemplateLibrary from '../components/editor/TemplateLibrary'
import BrollPicker from '../components/editor/BrollPicker'
import SfxPicker from '../components/editor/SfxPicker'
import CtaPicker from '../components/editor/CtaPicker'
import ExportPanel from '../components/editor/ExportPanel'

export default function EditorPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { status, error, init, timeline } = useEditorStore()
  const [activeTab, setActiveTab] = useState('captions')

  useEffect(() => {
    init(projectId)
  }, [projectId])

  if (status === 'loading' || !timeline) {
    return (
      <div className="flex h-screen items-center justify-center bg-dark-bg text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-9 w-9 animate-spin text-primary" />
          <span className="text-xs font-semibold text-slate-400">Loading editor studio...</span>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-dark-bg text-slate-400">
        <span className="text-danger text-sm font-semibold">Couldn't reach the backend server.</span>
        <span className="text-xs text-slate-500">{error}</span>
        <span className="text-xs text-slate-500">Is the API running at http://localhost:8000 ?</span>
        <button onClick={() => navigate('/')} className="mt-2 text-xs font-bold text-primary hover:underline">
          ← Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-dark-bg text-slate-100 overflow-hidden font-body">
      {/* Top Navbar */}
      <Toolbar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Studio Workspace */}
      <div className="flex min-h-0 flex-1">
        {/* Left Edit Controls Panel */}
        <div className="w-[410px] shrink-0 overflow-y-auto bg-dark-panel shadow-2xl shadow-black/50 z-10">
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* Right Live Canvas Video Preview Area */}
        <main className="flex min-h-0 flex-1 flex-col p-5 bg-dark-bg overflow-hidden">
          <VideoPreview />
        </main>
      </div>

      <TemplateLibrary />
      <BrollPicker />
      <SfxPicker />
      <CtaPicker />
      <ExportPanel />
    </div>
  )
}
