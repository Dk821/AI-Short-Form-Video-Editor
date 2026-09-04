import { useEffect, useState } from 'react'
import { X, KeyRound, Loader2, Check, ExternalLink, FolderOpen } from 'lucide-react'
import { api } from '../../services/api'

/**
 * API key / model settings.
 *
 * Why this exists: in the dev checkout every key lives in backend/.env. An
 * installed Windows app can't work that way — the install directory is
 * read-only, and baking keys into the installer hands them to everyone who
 * downloads it. The backend stores them per-user instead (settings.json in
 * the user's own data directory) and this is the screen that writes it.
 *
 * Keys are write-only from here: the backend reports whether each one is
 * configured plus its last four characters, never the value. An untouched
 * field is omitted from the PUT entirely, which is what lets a masked
 * placeholder stay put instead of blanking the key it stands for.
 */

const SECRET_FIELDS = [
  {
    key: 'GROQ_API_KEY',
    label: 'Groq',
    hint: 'Whisper transcription — required for captions.',
    href: 'https://console.groq.com',
  },
  {
    key: 'GEMINI_API_KEY',
    label: 'Google Gemini',
    hint: 'AI Auto Edit — required for auto-edit. Gemini is the sole AI provider.',
    href: 'https://aistudio.google.com/apikey',
  },
  {
    key: 'PEXELS_API_KEY',
    label: 'Pexels',
    hint: 'Stock B-roll search. Optional — auto-edit still runs without it.',
    href: 'https://www.pexels.com/api/',
  },
]

const PLAIN_FIELDS = [
  { key: 'WHISPER_MODEL', label: 'Whisper model', placeholder: 'whisper-large-v3-turbo' },
  { key: 'GEMINI_MODEL', label: 'Gemini model', placeholder: 'gemini-3.8-flash' },
]

export default function SettingsModal({ open, onClose }) {
  const [state, setState] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    setSaved(false)
    setDrafts({})
    api
      .getSettings()
      .then(setState)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const setDraft = (key, value) => {
    setSaved(false)
    setDrafts((d) => ({ ...d, [key]: value }))
  }

  const handleSave = async () => {
    // Only fields the user actually typed into are sent — see the note at
    // the top of this file.
    const payload = Object.fromEntries(
      Object.entries(drafts).filter(([, v]) => v !== undefined)
    )
    if (Object.keys(payload).length === 0) {
      onClose()
      return
    }
    setSaving(true)
    setError('')
    try {
      const next = await api.updateSettings(payload)
      setState(next)
      setDrafts({})
      setSaved(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const secretState = (key) => state?.secrets?.find((s) => s.key === key)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-dark-panel shadow-2xl shadow-black/60 ring-1 ring-dark-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dark-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-light text-primary">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight text-slate-100">API &amp; Integrations</h2>
              <p className="text-[11px] font-semibold text-slate-500">
                Stored on this computer only. Never sent anywhere but the service it belongs to.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-dark-panel2 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-xs font-semibold text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading settings…
            </div>
          )}

          {!loading && state && (
            <div className="flex flex-col gap-5">
              {SECRET_FIELDS.map(({ key, label, hint, href }) => {
                const info = secretState(key)
                return (
                  <div key={key} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-200">
                        {label}
                        {info?.configured && (
                          <span className="flex items-center gap-1 rounded-md bg-success/15 px-1.5 py-0.5 text-[10px] font-extrabold text-success">
                            <Check className="h-3 w-3" /> set
                          </span>
                        )}
                      </label>
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[10px] font-bold text-slate-500 transition-colors hover:text-primary"
                      >
                        get a key <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={drafts[key] ?? ''}
                      onChange={(e) => setDraft(key, e.target.value)}
                      placeholder={
                        info?.configured ? `saved — ${info.masked} (leave blank to keep)` : 'not set'
                      }
                      className="w-full rounded-xl bg-dark-panel3 px-3.5 py-2.5 text-xs font-semibold text-slate-100 placeholder:text-slate-500 outline-none ring-1 ring-transparent transition-all focus:ring-primary-border"
                    />
                    <p className="text-[10px] font-semibold text-slate-500">{hint}</p>
                  </div>
                )
              })}

              <div className="mt-1 border-t border-dark-border pt-5">
                <h3 className="mb-3 text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Models
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {PLAIN_FIELDS.map(({ key, label, placeholder }) => (
                    <div key={key} className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-200">{label}</label>
                      <input
                        type="text"
                        spellCheck={false}
                        value={drafts[key] ?? state.values?.[key] ?? ''}
                        onChange={(e) => setDraft(key, e.target.value)}
                        placeholder={placeholder}
                        className="w-full rounded-xl bg-dark-panel3 px-3.5 py-2.5 text-xs font-semibold text-slate-100 placeholder:text-slate-500 outline-none ring-1 ring-transparent transition-all focus:ring-primary-border"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {state.dataDir && (
                <p className="flex items-start gap-2 rounded-xl bg-dark-panel2 px-3.5 py-2.5 text-[10px] font-semibold leading-relaxed text-slate-500">
                  <FolderOpen className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>
                    Projects, media and settings live in
                    <span className="ml-1 break-all font-mono text-slate-400">{state.dataDir}</span>
                  </span>
                </p>
              )}
            </div>
          )}

          {error && <p className="mt-4 text-xs font-semibold text-danger">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-dark-border px-6 py-4">
          <span className="text-[11px] font-semibold text-slate-500">
            {saved ? 'Saved — changes apply immediately.' : 'Changes apply without restarting.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-400 transition-colors hover:bg-dark-panel2 hover:text-slate-200"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-purpleGlow transition-all hover:bg-primary-hover disabled:opacity-40"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
