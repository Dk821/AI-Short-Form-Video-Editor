import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Home,
  Calendar,
  BarChart3,
  Link2,
  Image as ImageIcon,
  Search,
  Plus,
  ChevronDown,
  UserPlus,
  Edit3,
  MoreHorizontal,
  Trash2,
  Film,
  Sparkles,
  FolderPlus,
  Video,
  Clock
} from 'lucide-react'
import { api } from '../services/api'
import CreateProjectModal from '../components/dashboard/CreateProjectModal'

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good Morning'
  if (h < 17) return 'Good Afternoon'
  return 'Good Evening'
}

const NAV_ITEMS = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'calendar', label: 'Calendar', Icon: Calendar },
  { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
  { id: 'api', label: 'API & Integrations', Icon: Link2 },
  { id: 'thumbnails', label: 'AI Thumbnails', Icon: ImageIcon },
]

function DashboardSidebar() {
  const [activeNav, setActiveNav] = useState('home')

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-dark-rail shadow-2xl shadow-black/50 z-10">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-5 py-5 shadow-sm">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-primary-600 to-primary-500 shadow-purpleGlow text-white font-black text-base">
          C
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-black text-slate-100 tracking-tight">Clipforge</span>
          <span className="text-[10px] font-bold text-primary">Pro Studio AI</span>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex flex-col gap-1 px-3 py-4">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveNav(id)}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all ${
              activeNav === id
                ? 'bg-primary text-white shadow-purpleGlow'
                : 'text-slate-400 hover:bg-dark-panel hover:text-slate-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {/* Folders Section */}
      <div className="mt-4 px-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Folders</span>
          <button className="text-slate-400 hover:text-primary transition p-1" title="New Folder">
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>
        <button className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-primary py-1.5 transition">
          <Plus className="h-3.5 w-3.5" />
          <span>Create folder</span>
        </button>
      </div>

    </aside>
  )
}

function ProjectCard({ project, onOpen, onRename, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(project.name)
  const mainAsset = project.assets?.find((a) => a.kind === 'video')
  const duration = project.timeline?.project?.duration

  return (
    <div
      onClick={() => !renaming && onOpen(project.id)}
      className="group relative flex cursor-pointer flex-col rounded-2xl bg-dark-panel shadow-xl shadow-black/40 transition-all duration-200 hover:-translate-y-1.5 hover:bg-dark-panel2 hover:shadow-2xl hover:shadow-primary/25"
    >
      <div className="relative aspect-[9/14] w-full overflow-hidden rounded-t-2xl bg-dark-panel2">
        {mainAsset ? (
          <video src={api.assetUrl(mainAsset)} className="h-full w-full object-cover opacity-90 group-hover:opacity-100 transition duration-300" muted preload="metadata" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-500">
            <Film className="h-8 w-8 stroke-[1.5]" />
            <span className="text-xs font-semibold text-slate-400">No video media</span>
          </div>
        )}

        {/* Badges */}
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 z-10">
          <span className="inline-flex items-center gap-1 rounded-md bg-black/80 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
            <Video className="h-3 w-3" />
            1 Clip
          </span>
        </div>

        {duration ? (
          <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-black/80 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-purple-400 shadow-md">
            <Clock className="h-3 w-3" />
            {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
          </span>
        ) : null}

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center gap-2.5 bg-black/60 backdrop-blur-[2px] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); setRenaming(true) }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/90 text-slate-100 shadow-lg hover:bg-primary hover:text-white hover:shadow-purpleGlow transition-all"
            title="Rename"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(true) }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/90 text-slate-100 shadow-lg hover:bg-primary hover:text-white hover:shadow-purpleGlow transition-all"
            title="Options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2 p-3.5">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setRenaming(false)
              if (name.trim() && name !== project.name) onRename(project.id, name.trim())
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-full rounded-lg bg-dark-panel3 px-2 py-1 text-xs font-bold text-slate-100 outline-none shadow-inner"
          />
        ) : (
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xs font-bold text-slate-100 group-hover:text-purple-300 transition-colors">
              {project.name}
            </h3>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{formatDate(project.createdAt)}</p>
          </div>
        )}

        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-dark-panel3 hover:text-slate-100 transition"
            title="Menu"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-30 w-36 overflow-hidden rounded-xl bg-dark-panel border border-dark-border p-1 shadow-2xl shadow-black/90">
              <button
                onClick={() => {
                  setMenuOpen(false)
                  setRenaming(true)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-300 hover:bg-dark-panel2 transition"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Rename
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  if (confirm(`Delete "${project.name}"? This can't be undone.`)) onDelete(project.id)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-danger hover:bg-red-950/40 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  async function refresh() {
    try {
      const list = await api.listProjects()
      setProjects(list)
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleRename(id, name) {
    await api.renameProject(id, name)
    refresh()
  }

  async function handleDelete(id) {
    await api.deleteProject(id)
    refresh()
  }

  const filteredProjects = projects?.filter((p) =>
    !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-screen bg-dark-bg text-slate-100 font-body">
      <DashboardSidebar />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between bg-dark-bg px-8 py-4 shadow-md shadow-black/30">
          <div>
            <h1 className="text-lg font-black tracking-tight text-slate-100">{getGreeting()}</h1>
            <p className="text-xs text-slate-400 mt-0.5">Manage and edit your viral AI video shorts</p>
          </div>

          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 rounded-xl bg-dark-panel px-4 py-2 text-xs font-bold text-slate-300 shadow-md hover:bg-dark-panel2 transition">
              <UserPlus className="h-4 w-4" />
              Invite Members
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-purpleGlow hover:bg-primary-hover transition-all"
            >
              <Plus className="h-4 w-4 stroke-[3]" />
              Create Project
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-8 py-6">
          {/* Controls & Search */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h2 className="text-base font-extrabold text-slate-100 tracking-tight">Your Projects</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="rounded-xl bg-dark-panel py-2 pl-9 pr-4 text-xs font-semibold text-slate-100 outline-none shadow-md focus:ring-2 focus:ring-primary transition w-56"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {['Type', 'Status', 'Newest'].map((f) => (
                <button
                  key={f}
                  className="flex items-center gap-1.5 rounded-xl bg-dark-panel px-3 py-1.5 text-xs font-semibold text-slate-300 shadow-sm hover:bg-dark-panel2 transition"
                >
                  {f} <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                </button>
              ))}
              <button className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary shadow-sm hover:bg-primary/20 transition">
                <Sparkles className="h-3.5 w-3.5" />
                Add Brand Kit
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-xl bg-red-950/60 p-4 text-xs text-danger shadow-md">
              {error}
            </div>
          )}

          {!projects ? (
            <div className="flex flex-col items-center justify-center py-28">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-border border-t-primary" />
              <span className="mt-3 text-xs font-semibold text-slate-500">Loading studio projects...</span>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div
              onClick={() => setCreateOpen(true)}
              className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl bg-dark-panel/60 py-24 text-center hover:bg-primary/10 transition-all group shadow-xl shadow-black/40"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 text-primary group-hover:scale-110 transition shadow-purpleGlow">
                <Film className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-200">No projects found</h3>
                <p className="text-xs text-slate-500 mt-1">Create a new project to start editing viral videos</p>
              </div>
              <button className="mt-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-purpleGlow hover:bg-primary-hover transition">
                + Create First Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {filteredProjects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onOpen={(id) => navigate(`/editor/${id}`)}
                  onRename={handleRename}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
