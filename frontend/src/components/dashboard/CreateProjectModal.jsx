import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  X,
  MessageSquare,
  Wand2,
  FileVideo,
  UploadCloud,
  Trash2,
  Sparkles,
  Globe,
  Layers,
  Loader2
} from 'lucide-react'
import { api } from '../../services/api'

const FLOWS = [
  {
    id: 'captions',
    title: 'Generate Captions',
    description: 'Upload a video clip and auto-generate styled AI subtitles.',
    Icon: MessageSquare,
  },
  {
    id: 'auto',
    title: 'AI Auto Edit',
    description: 'Pick a template — captions, auto zooms & stock B-roll get applied.',
    Icon: Wand2,
  },
  {
    id: 'blank',
    title: 'Blank Project',
    description: 'Start with a raw timeline and build your edits manually.',
    Icon: FileVideo,
  },
]

const LANGUAGES = [
  { code: 'en', label: '🇺🇸 English (US)' },
  { code: 'es', label: '🇪🇸 Spanish' },
  { code: 'fr', label: '🇫🇷 French' },
  { code: 'de', label: '🇩🇪 German' },
  { code: 'hi', label: '🇮🇳 Hindi' },
]

async function createProjectWithVideo(file, templateId) {
  const project = await api.createProject({ name: file.name.replace(/\.[^.]+$/, ''), templateId: templateId || undefined })
  const asset = await api.uploadAsset(project.id, file)

  const duration = asset.duration && asset.duration > 0 ? asset.duration : 3
  const item = {
    id: `item_${Math.random().toString(36).slice(2, 9)}`,
    type: 'video',
    assetId: asset.id,
    start: 0,
    duration,
    sourceStart: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    opacity: 1,
    zIndex: 1,
  }
  const timeline = {
    ...project.timeline,
    project: { ...project.timeline.project, duration },
    tracks: project.timeline.tracks.map((t) => (t.type === 'video' ? { ...t, items: [item] } : t)),
  }
  await api.saveTimeline(project.id, timeline)
  return { projectId: project.id, assetId: asset.id }
}

export default function CreateProjectModal({ open, onClose }) {
  const navigate = useNavigate()
  const [step, setStep] = useState('pick')
  const [flow, setFlow] = useState(null)
  const [templateId, setTemplateId] = useState(null)
  const [templates, setTemplates] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [error, setError] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null)
  const [language, setLanguage] = useState('en')
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setStep('pick')
      setFlow(null)
      setTemplateId(null)
      setError(null)
      setSelectedFile(null)
      setVideoPreviewUrl(null)
      setLanguage('en')
    }
  }, [open])

  useEffect(() => {
    if (step === 'template' && templates.length === 0) {
      api.listTemplates().then(setTemplates).catch(() => setTemplates([]))
    }
  }, [step])

  useEffect(() => {
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile)
      setVideoPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [selectedFile])

  if (!open) return null

  function pickFlow(id) {
    setFlow(id)
    setStep(id === 'auto' ? 'template' : 'upload')
  }

  function handleFileSelect(file) {
    if (!file) return
    setSelectedFile(file)
  }

  async function handleSubmit() {
    if (!selectedFile) return
    setStep('processing')
    setError(null)
    try {
      setProgressMsg('Uploading clip...')
      const { projectId, assetId } = await createProjectWithVideo(selectedFile, flow === 'auto' ? templateId : null)

      if (flow === 'captions') {
        setProgressMsg('Transcribing audio with AI...')
        await api.transcribe(projectId, assetId, language)
        setProgressMsg('Generating styled captions...')
        await api.generateCaptions(projectId, 'clean_bottom', null, true)
      } else if (flow === 'auto') {
        setProgressMsg('Transcribing audio...')
        await api.transcribe(projectId, assetId, language)
        setProgressMsg('Applying theme template...')
        await api.applyTemplate(projectId, templateId, true)
        setProgressMsg('Planning AI zooms & B-roll footage...')
        await api.runAutoEdit(projectId).catch(() => null)
      }

      navigate(`/editor/${projectId}`)
    } catch (e) {
      setError(String(e))
      setStep('upload')
    }
  }

  const appliedTemplateName = templates.find((t) => t.id === templateId)?.name || templateId

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 transition-all">
      <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-dark-panel shadow-2xl shadow-black/80">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            {step !== 'pick' && step !== 'processing' && (
              <button
                onClick={() => {
                  if (step === 'upload') {
                    setStep(flow === 'auto' ? 'template' : 'pick')
                    setSelectedFile(null)
                    setVideoPreviewUrl(null)
                  } else if (step === 'template') {
                    setStep('pick')
                  }
                }}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-dark-panel2 hover:text-white transition"
                title="Go back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-tight">
                {step === 'pick' && 'Create New Video Project'}
                {step === 'template' && 'Select Video Template'}
                {step === 'upload' && 'Upload Video & Configure'}
                {step === 'processing' && 'Processing Video'}
              </h2>
              <p className="text-xs text-slate-400">
                {step === 'pick' && 'Select how you want to build your short'}
                {step === 'template' && 'Choose layout & typography style'}
                {step === 'upload' && 'Upload source media file'}
                {step === 'processing' && 'Please wait while AI builds your project'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-dark-panel2 hover:text-white transition"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {step === 'pick' && (
            <div className="flex flex-col gap-3">
              {FLOWS.map(({ id, title, description, Icon }) => (
                <button
                  key={id}
                  onClick={() => pickFlow(id)}
                  className="flex items-start gap-4 rounded-2xl bg-dark-panel2 p-4 text-left shadow-md hover:bg-dark-panel3 hover:shadow-purpleGlow transition-all group"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-dark-panel3 text-primary group-hover:scale-105 transition shadow-sm">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-100 group-hover:text-primary transition">
                      {title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 'template' && (
            <div className="grid max-h-80 grid-cols-3 gap-3 overflow-y-auto pr-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTemplateId(t.id)
                    setStep('upload')
                  }}
                  className="group flex flex-col overflow-hidden rounded-2xl bg-dark-panel2 text-left shadow-md hover:shadow-purpleGlow transition-all"
                >
                  <div
                    className="aspect-[9/12] w-full relative flex items-center justify-center"
                    style={{ background: `radial-gradient(120% 120% at 50% 0%, ${t.accentColor}33, #0D111A 65%)` }}
                  >
                    {t.thumbnailUrl ? (
                      <img src={t.thumbnailUrl} alt={t.name} className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <span className="relative rounded-lg bg-dark-panel/90 px-2.5 py-1 text-[11px] font-bold text-slate-200 shadow-md">
                        {t.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between p-2.5 shadow-sm">
                    <span className="text-xs font-semibold text-slate-200 truncate">{t.name}</span>
                    <span className="h-2 w-2 rounded-full shadow-sm" style={{ backgroundColor: t.accentColor }} />
                  </div>
                </button>
              ))}
              {templates.length === 0 && (
                <div className="col-span-3 flex items-center justify-center py-12 text-xs text-slate-500">
                  Loading available templates...
                </div>
              )}
            </div>
          )}

          {step === 'upload' && (
            <div className="flex flex-col gap-4">
              {/* Dropzone / Preview */}
              {videoPreviewUrl ? (
                <div className="relative overflow-hidden rounded-2xl bg-black shadow-2xl">
                  <button
                    onClick={() => {
                      setSelectedFile(null)
                      setVideoPreviewUrl(null)
                    }}
                    className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-dark-bg/80 text-white hover:bg-red-600 transition shadow"
                    title="Remove Video"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <video
                    src={videoPreviewUrl}
                    className="w-full rounded-2xl"
                    controls
                    style={{ maxHeight: 260 }}
                  />
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    handleFileSelect(e.dataTransfer.files?.[0])
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl p-8 text-center transition-all shadow-lg ${dragOver
                      ? 'bg-primary/20 shadow-purpleGlow'
                      : 'bg-dark-panel2/90 hover:bg-dark-panel3'
                    }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary shadow-purpleGlow">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-100">Click to upload or drag & drop</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">MP4, MOV, WebM video files supported</p>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />

              {/* Form Options */}
              <div className="flex flex-col gap-3 rounded-2xl bg-dark-panel2/90 p-4 shadow-lg shadow-black/40">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-bold text-slate-200">
                    <Globe className="h-4 w-4 text-slate-400" />
                    Speech Language
                  </span>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="rounded-xl bg-[#1E273C] px-3.5 py-2 text-xs font-bold text-slate-100 outline-none shadow-md cursor-pointer hover:bg-[#25304A] transition"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>

                {templateId && (
                  <div className="flex items-center justify-between text-xs pt-2.5">
                    <span className="flex items-center gap-2 font-bold text-slate-200">
                      <Layers className="h-4 w-4 text-slate-400" />
                      Applied Template
                    </span>
                    <span className="rounded-lg bg-[#1E273C] px-3 py-1.5 text-xs font-extrabold text-slate-100 shadow-sm">
                      {appliedTemplateName}
                    </span>
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-danger font-semibold">{error}</p>}

              {/* CTA Button */}
              <button
                onClick={handleSubmit}
                disabled={!selectedFile}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-xs font-bold text-white shadow-purpleGlow hover:bg-primary-hover transition-all disabled:opacity-40"
              >
                <Sparkles className="h-4 w-4" />
                Create AI Auto Edit Video
              </button>
            </div>
          )}

          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div>
                <h3 className="text-sm font-bold text-slate-100">Processing Video</h3>
                <p className="text-xs text-slate-400 mt-1">{progressMsg}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}