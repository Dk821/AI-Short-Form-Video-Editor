import { useEffect, useRef, useState } from 'react'
import {
  MessageSquare,
  Film,
  Scissors,
  Sparkles,
  Wand2,
  Volume2,
  Mic,
  Eye,
  EyeOff,
  Type,
  Palette,
  Check,
  Trash2,
  Plus,
  RotateCcw,
  Sliders,
  ZoomIn,
  ArrowLeft,
  Edit3,
  Zap,
  LayoutGrid,
  MoreHorizontal,
  Anchor,
  CornerDownLeft,
  X,
  XCircle,
} from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import Scenes from './Scenes'
import RevealAnimationModal from './animations/RevealAnimationModal'
import { REVEAL_ANIMATIONS } from './animations/RevealAnimationPicker'
import StressHighlightModal from './animations/StressHighlightModal'

function Toggle({ active, onToggle, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className={`toggle-switch ${active ? 'active' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      title={disabled ? 'Working…' : active ? 'Enabled' : 'Disabled'}
    />
  )
}

function BoostCard({ icon: Icon, iconBg, title, description, active, onToggle, actions, disabled }) {
  return (
    <div className={`flex items-center justify-between p-3.5 rounded-2xl bg-dark-panel2 shadow-md shadow-black/40 hover:shadow-lg hover:shadow-black/60 transition-all ${disabled ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${iconBg || 'bg-dark-panel3'}`}>
          <Icon className="h-4 w-4 stroke-[2.2]" />
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-bold text-slate-100 truncate">{title}</h4>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">{description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {actions?.map((a, i) => (
          <button
            key={i}
            onClick={a.onClick}
            className="rounded-lg bg-dark-panel3 px-2.5 py-1 text-[11px] font-bold text-slate-300 shadow-sm hover:bg-dark-panel hover:text-white transition"
          >
            {a.label}
          </button>
        ))}
        <Toggle active={active} onToggle={onToggle} disabled={disabled} />
      </div>
    </div>
  )
}

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-xl bg-dark-panel3 p-0.5 shadow-inner">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
            value === opt
              ? 'bg-primary text-white shadow-purpleGlow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

const FONTS = ['Inter', 'Montserrat', 'Roboto', 'Poppins', 'Open Sans', 'Lato', 'Oswald', 'Space Grotesk']
const WEIGHTS = ['Regular', 'Medium', 'Semibold', 'Bold', 'Heavy']

const EDIT_TABS = [
  { id: 'captions', label: 'Captions', Icon: MessageSquare },
  { id: 'scenes', label: 'Edit Scenes', Icon: LayoutGrid },
  { id: 'trim', label: 'Trim Video', Icon: Scissors },
]

const STYLE_CATEGORIES = ['All', 'Trend', 'New', 'Premium', 'Emoji', 'Speakers']

const STYLE_PRESETS = [
  { id: 'matt', name: 'Matt', category: 'New', isNew: true, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: null, strokeWidth: 0, fontFamily: 'Inter', case: 'none' },
  { id: 'jess', name: 'JESS', category: 'New', isNew: true, isPremium: true, color: '#FF5722', backgroundColor: null, strokeColor: '#000000', strokeWidth: 2, fontFamily: 'Montserrat', case: 'upper', fontStyle: 'italic' },
  { id: 'jack', name: 'Jack', category: 'New', isNew: true, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: null, strokeWidth: 0, fontFamily: 'Georgia', case: 'none' },
  { id: 'nick', name: 'Nick', category: 'New', isNew: true, isPremium: false, color: '#FFFFFF', backgroundColor: '#334155AA', strokeColor: null, strokeWidth: 0, fontFamily: 'Inter', case: 'none' },
  { id: 'laura', name: 'Laura', category: 'Trend', isNew: false, isPremium: false, color: '#000000', backgroundColor: '#FACC15', strokeColor: null, strokeWidth: 0, fontFamily: 'Space Grotesk', case: 'none' },
  { id: 'kelly2', name: 'Kelly 2', category: 'Trend', isNew: false, isPremium: true, color: '#FFFFFF', backgroundColor: null, strokeColor: '#000000', strokeWidth: 3, fontFamily: 'Montserrat', case: 'none' },
  { id: 'caleb', name: 'Caleb', category: 'Trend', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: '#000000', strokeColor: null, strokeWidth: 0, fontFamily: 'Inter', case: 'none' },
  { id: 'kendrick', name: 'Kendrick', category: 'Trend', isNew: false, isPremium: false, color: '#000000', backgroundColor: '#22c55e', strokeColor: null, strokeWidth: 0, fontFamily: 'Space Grotesk', case: 'none' },
  { id: 'lewis', name: 'Lewis', category: 'Trend', isNew: false, isPremium: true, color: '#FFFFFF', backgroundColor: null, strokeColor: '#000000', strokeWidth: 2, fontFamily: 'Montserrat', case: 'none' },
  { id: 'doug', name: 'DOUG', category: 'All', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: '#000000', strokeWidth: 3, fontFamily: 'Space Grotesk', case: 'upper' },
  { id: 'carlos', name: 'CARLOS', category: 'All', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: '#000000', strokeWidth: 2, fontFamily: 'Montserrat', case: 'upper' },
  { id: 'luke', name: 'LUKE', category: 'All', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: '#38BDF8', strokeWidth: 2, fontFamily: 'Inter', case: 'upper' },
  { id: 'mark', name: 'MARK', category: 'Premium', isNew: false, isPremium: true, color: '#FFFFFF', backgroundColor: null, strokeColor: '#6366F1', strokeWidth: 2, fontFamily: 'Montserrat', case: 'upper' },
  { id: 'sara', name: 'Sara', category: 'Premium', isNew: false, isPremium: true, color: '#FFFFFF', backgroundColor: null, strokeColor: '#000000', strokeWidth: 1, fontFamily: 'Georgia', case: 'none', fontStyle: 'italic' },
  { id: 'daniel', name: 'Daniel', category: 'Premium', isNew: false, isPremium: true, color: '#FFFFFF', backgroundColor: null, strokeColor: '#000000', strokeWidth: 2, fontFamily: 'Inter', case: 'none' },
  { id: 'dan2', name: 'DAN 2', category: 'Trend', isNew: false, isPremium: false, color: '#000000', backgroundColor: '#FACC15', strokeColor: null, strokeWidth: 0, fontFamily: 'Space Grotesk', case: 'upper' },
  { id: 'hormozi4', name: 'HORMOZI 4', category: 'Trend', isNew: false, isPremium: true, color: '#FACC15', backgroundColor: null, strokeColor: '#000000', strokeWidth: 3, fontFamily: 'Space Grotesk', case: 'upper' },
  { id: 'dan', name: 'DAN', category: 'Trend', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: '#000000', strokeWidth: 3, fontFamily: 'Montserrat', case: 'upper', fontStyle: 'italic' },
  { id: 'devin', name: 'DEVIN', category: 'All', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: '#000000', strokeWidth: 2, fontFamily: 'Inter', case: 'upper' },
  { id: 'tayo', name: 'Tayo', category: 'All', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: null, strokeWidth: 0, fontFamily: 'Inter', case: 'none' },
  { id: 'ella', name: 'ELLA', category: 'All', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: '#EC4899', strokeWidth: 1, fontFamily: 'Space Grotesk', case: 'upper' },
  { id: 'tracy', name: 'TRACY', category: 'All', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: null, strokeWidth: 0, fontFamily: 'Montserrat', case: 'upper' },
  { id: 'hormozi1', name: 'HORMOZI 1', category: 'Trend', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: '#00000099', strokeColor: null, strokeWidth: 0, fontFamily: 'Space Grotesk', case: 'upper' },
  { id: 'hormozi2', name: 'HORMOZI 2', category: 'Trend', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: '#000000CC', strokeColor: null, strokeWidth: 0, fontFamily: 'Space Grotesk', case: 'upper' },
  { id: 'hormozi3', name: 'HORMOZI 3', category: 'Trend', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: '#000000', strokeWidth: 3, fontFamily: 'Space Grotesk', case: 'upper' },
  { id: 'hormozi5', name: 'Hormozi 5', category: 'Trend', isNew: false, isPremium: true, color: '#FACC15', backgroundColor: null, strokeColor: null, strokeWidth: 0, fontFamily: 'Inter', case: 'none' },
  { id: 'william', name: 'WILLIAM', category: 'All', isNew: false, isPremium: false, color: '#000000', backgroundColor: '#FACC15', strokeColor: null, strokeWidth: 0, fontFamily: 'Space Grotesk', case: 'upper' },
  { id: 'leon', name: 'LEON', category: 'All', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: '#FF6B00', strokeColor: null, strokeWidth: 0, fontFamily: 'Montserrat', case: 'upper' },
  { id: 'ali', name: 'Ali', category: 'All', isNew: false, isPremium: false, color: '#000000', backgroundColor: '#FFFFFF', strokeColor: null, strokeWidth: 0, fontFamily: 'Inter', case: 'none' },
  { id: 'beast', name: 'BEAST', category: 'Trend', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: '#000000', strokeWidth: 2, fontFamily: 'Space Grotesk', case: 'upper', fontStyle: 'italic' },
  { id: 'maya', name: 'Maya', category: 'All', isNew: false, isPremium: false, color: '#FB923C', backgroundColor: null, strokeColor: '#000000', strokeWidth: 1, fontFamily: 'Georgia', case: 'none' },
  { id: 'karl', name: 'KARL', category: 'All', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: null, strokeWidth: 0, fontFamily: 'Oswald', case: 'upper' },
  { id: 'iman', name: 'Iman', category: 'All', isNew: false, isPremium: false, color: '#E2E8F0', backgroundColor: null, strokeColor: null, strokeWidth: 0, fontFamily: 'Inter', case: 'none' },
  { id: 'noah', name: 'NOAH', category: 'All', isNew: false, isPremium: false, color: '#FFFFFF', backgroundColor: null, strokeColor: '#000000', strokeWidth: 2, fontFamily: 'Space Grotesk', case: 'upper', fontStyle: 'italic' },
]

function CaptionsTab({ mode, setMode, onTabChange }) {
  const {
    mainAsset,
    transcript,
    isTranscribing,
    transcribeError,
    transcribeMain,
    captionTemplates,
    isGeneratingCaptions,
    generateCaptions,
    addCaption,
    timeline,
    updateItem,
    removeItem,
    selectItem,
    selectedItemId,
    setCurrentTime,
    runAutoEdit,
    isAutoEditing,
    autoEditResult,
    splitCaptionItem,
    mergeCaptionPair,
    removeAutoEditItems,
    setAllCaptionsHidden,
    enableAiCaptions,
    setStressHighlightEnabled,
    isSettingStressHighlight,
  } = useEditorStore()

  const [stressModalOpen, setStressModalOpen] = useState(false)

  const currentTemplate = useEditorStore((s) => (typeof s?.currentTemplate === 'function' ? s.currentTemplate() : null))

  // Style State
  const [activeCategory, setActiveCategory] = useState('All')
  const [selectedPresetId, setSelectedPresetId] = useState('doug')
  const [showCustomStyle, setShowCustomStyle] = useState(false)
  const [themeName, setThemeName] = useState('Custom Theme')
  const [isRenamingTheme, setIsRenamingTheme] = useState(false)
  const [fontFamily, setFontFamily] = useState('Inter')
  const [fontWeight, setFontWeight] = useState('Bold')
  const [uppercase, setUppercase] = useState(true)
  const [fontSize, setFontSize] = useState(28)
  const [fontColor, setFontColor] = useState('#FFFFFF')
  const [strokeWeight, setStrokeWeight] = useState('Small')
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [shadow, setShadow] = useState('Medium')
  const [displayWords, setDisplayWords] = useState(3)
  const [positionY, setPositionY] = useState(73)
  const [animation, setAnimation] = useState(true)
  const [punctuation, setPunctuation] = useState(false)
  const [autoEmoji, setAutoEmoji] = useState('Auto')
  const [emojiAnimation, setEmojiAnimation] = useState(true)
  const [mainColor, setMainColor] = useState('#8B5CF6')
  const [secondColor, setSecondColor] = useState('#FFFFFF')
  const [thirdColor, setThirdColor] = useState('#1E293B')

  // Feature Toggles
  const [boostState, setBoostState] = useState({
    // "captions", "zooms" and "broll" used to live here as cosmetic-only
    // flags, disconnected from whether the timeline actually had any
    // AI-added content — a project could show a toggle "on" with zero
    // matching items, or "off" with items still sitting on the timeline.
    // All three now derive their on/off display straight from real
    // timeline data instead (see captionsEnabled/zoomsEnabled/
    // brollEnabled below), and their onToggle handlers act on that same
    // real state, so what a switch is doing to the project is exactly
    // what a switch is currently doing to the project.
    silences: true,
    cleanAudio: false,
    eyeContact: false,
  })

  // Synchronize state when an active template is present or changed
  useEffect(() => {
    if (!currentTemplate) return
    const cap = currentTemplate.caption || {}
    if (cap.fontFamily) setFontFamily(cap.fontFamily)
    if (cap.color) setFontColor(cap.color)
    if (cap.strokeColor) setStrokeColor(cap.strokeColor)
    if (cap.strokeWidth !== undefined) {
      setStrokeWeight(cap.strokeWidth >= 3 ? 'Large' : cap.strokeWidth === 2 ? 'Medium' : cap.strokeWidth === 1 ? 'Small' : 'None')
    }
    if (cap.case) setUppercase(cap.case === 'upper')
    if (cap.position) {
      setPositionY(cap.position === 'top' ? 15 : cap.position === 'center' ? 50 : 73)
    }
    if (cap.wordsPerCaption) setDisplayWords(cap.wordsPerCaption)
    if (cap.animation) setAnimation(cap.animation !== 'none')
    // zooms/broll used to be force-set here from the template's config
    // flag — but applying a template never actually adds zoom/b-roll
    // items by itself (see routers/templates.py's apply_template — it
    // only stores brollStyle/zoomStyle preferences), so this was setting
    // the switch "on" before anything AI-added existed to back it up.
    // zoomsEnabled/brollEnabled below read real timeline content instead,
    // which is also what apply_edit_decisions actually tags (source:
    // "auto_edit") once a real auto-edit pass runs — from the "AI Auto
    // Edit" project-creation flow or either boost toggle right below.
  }, [currentTemplate?.id])

  // Hidden caption items set & active options popup menu
  const [editingItemId, setEditingItemId] = useState(null)
  const [activeOptionMenuId, setActiveOptionMenuId] = useState(null)
  const [selectedWordInfo, setSelectedWordInfo] = useState(null)

  const toggleBoost = (key) => setBoostState((s) => ({ ...s, [key]: !s[key] }))
  // Persisted per-line hide (models.py's `hidden`) — real, not just a
  // dimmed-in-the-sidebar illusion: render.py and VideoPreview.jsx both
  // skip a hidden caption item entirely.
  const toggleHideItem = (item) => updateItem(item.id, { hidden: !item.hidden })

  const hasMainVideo = !!mainAsset()
  const hasTranscript = !!transcript?.words?.length

  const captionTrack = timeline?.tracks?.find((t) => t.type === 'caption')
  const captionItems = captionTrack?.items || []
  // Real, timeline-derived state for the "AI Subtitles & Captions" boost
  // toggle — true once captions exist AND at least one line isn't hidden
  // (matches how "AI Auto B-rolls"/"AI Auto Zooms" derive their own
  // on/off state from actual track contents rather than a local flag).
  const captionsEnabled = captionItems.length > 0 && captionItems.some((it) => !it.hidden)

  // Same idea for "AI Auto Zooms"/"AI Auto B-rolls" — on only when the
  // matching track actually has AI-added content (source: "auto_edit"),
  // never a locally-tracked flag that can drift from what's really there.
  // A manually-placed zoom (a scene's Zoom toggle) or manually-attached
  // b-roll clip has no `source` tag, so it never makes these read "on".
  const zoomItems = timeline?.tracks?.find((t) => t.type === 'zoom')?.items || []
  const brollItems = timeline?.tracks?.find((t) => t.type === 'broll')?.items || []
  const zoomsEnabled = zoomItems.some((it) => it.source === 'auto_edit')
  const brollEnabled = brollItems.some((it) => it.source === 'auto_edit')

  // "AI Stress Text Highlighter" — same real-data-derived pattern as the
  // three above: on only once at least one caption line actually has
  // detected stress words, never a locally-tracked flag. The style
  // fields are bulk-shared across every caption item (see
  // updateAllCaptions below and models.py's stress* fields), so the
  // first item's values represent the one shared style the modal edits.
  const stressHighlightEnabled = captionItems.some((it) => it.stressWordIndices?.length > 0)
  const stressStyleValue = {
    stressColor: captionItems[0]?.stressColor,
    stressBackgroundColor: captionItems[0]?.stressBackgroundColor,
    stressStrokeEnabled: captionItems[0]?.stressStrokeEnabled,
    stressStrokeColor: captionItems[0]?.stressStrokeColor,
    stressStrokeWidth: captionItems[0]?.stressStrokeWidth,
    stressFontFamily: captionItems[0]?.stressFontFamily,
    stressFontSize: captionItems[0]?.stressFontSize,
    stressFontWeight: captionItems[0]?.stressFontWeight,
    stressFontStyle: captionItems[0]?.stressFontStyle,
    stressPadding: captionItems[0]?.stressPadding,
    stressCornerRadius: captionItems[0]?.stressCornerRadius,
    stressAnimation: captionItems[0]?.stressAnimation,
  }

  // Live update timeline captions
  function updateAllCaptions(patch) {
    if (!captionTrack) return
    captionTrack.items.forEach((item) => {
      updateItem(item.id, patch)
    })
  }

  function handleFontFamilyChange(val) {
    setFontFamily(val)
    updateAllCaptions({ fontFamily: val })
  }
  function handleFontWeightChange(val) {
    setFontWeight(val)
    const weightNum = val === 'Regular' ? 400 : val === 'Medium' ? 500 : val === 'Semibold' ? 600 : val === 'Bold' ? 700 : 900
    updateAllCaptions({ fontWeight: weightNum })
  }
  function handleFontSizeChange(val) {
    setFontSize(val)
    updateAllCaptions({ fontSize: Math.round(val * 2.3) })
  }
  function handleFontColorChange(val) {
    setFontColor(val)
    updateAllCaptions({ color: val })
  }
  function handleStrokeColorChange(val) {
    setStrokeColor(val)
    updateAllCaptions({ strokeColor: val })
  }
  function handleStrokeWeightChange(val) {
    setStrokeWeight(val)
    const sw = val === 'Large' ? 4 : val === 'Medium' ? 2.5 : val === 'Small' ? 1 : 0
    updateAllCaptions({ strokeWidth: sw })
  }
  function handlePositionYChange(val) {
    setPositionY(val)
    const pos = val > 66 ? 'bottom' : val < 33 ? 'top' : 'center'
    updateAllCaptions({ position: pos })
  }
  function handleUppercaseChange(val) {
    setUppercase(val)
    updateAllCaptions({ case: val ? 'upper' : 'none' })
  }
  function handleAnimationChange(val) {
    setAnimation(val)
    updateAllCaptions({ animation: val ? 'pop' : 'none' })
  }

  // 1. CAPTION STYLE MODE (Matches reference screenshot interface)
  if (mode === 'style_captions') {
    const activePreset = STYLE_PRESETS.find((p) => p.id === selectedPresetId) || STYLE_PRESETS[9]
    const filteredPresets = activeCategory === 'All'
      ? STYLE_PRESETS
      : STYLE_PRESETS.filter((p) => p.category === activeCategory || (activeCategory === 'New' && p.isNew) || (activeCategory === 'Premium' && p.isPremium))

    const applyPreset = (preset) => {
      setSelectedPresetId(preset.id)
      setFontFamily(preset.fontFamily || 'Inter')
      setFontColor(preset.color || '#FFFFFF')
      setStrokeColor(preset.strokeColor || '#000000')
      setStrokeWeight(preset.strokeWidth === 3 ? 'Large' : preset.strokeWidth === 2 ? 'Medium' : preset.strokeWidth === 1 ? 'Small' : 'None')
      setUppercase(preset.case === 'upper')
      
      // Wipe away all old style attributes & apply clean preset style
      updateAllCaptions({
        fontFamily: preset.fontFamily || 'Inter',
        color: preset.color || '#FFFFFF',
        backgroundColor: preset.backgroundColor !== undefined ? preset.backgroundColor : null,
        strokeColor: preset.strokeColor !== undefined ? preset.strokeColor : null,
        strokeWidth: preset.strokeWidth !== undefined ? preset.strokeWidth : 0,
        highlightColor: preset.highlightColor !== undefined ? preset.highlightColor : null,
        case: preset.case || 'none',
        animation: preset.animation || 'pop',
      })
    }

    return (
      <div className="flex flex-col h-full bg-dark-panel text-slate-100 font-body select-none">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-dark-border px-4 py-3 bg-dark-panel">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl bg-dark-panel3 p-0.5 shadow-inner">
              <button
                onClick={() => {
                  setShowCustomStyle(false)
                  setMode('style_captions')
                }}
                className={`px-3.5 py-1 text-xs font-bold rounded-lg transition ${
                  !showCustomStyle
                    ? 'bg-primary text-white shadow-purpleGlow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Choose Style
              </button>
              <button
                onClick={() => setMode('edit_captions')}
                className="px-3.5 py-1 text-xs font-bold rounded-lg text-slate-400 hover:text-slate-200 transition"
              >
                Edit Captions
              </button>
            </div>
          </div>

          <button
            onClick={() => setShowCustomStyle(!showCustomStyle)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition shadow-sm ${
              showCustomStyle
                ? 'border-primary bg-primary text-white shadow-purpleGlow'
                : 'border-dark-border bg-dark-panel2 text-slate-200 hover:bg-dark-panel3 hover:border-primary/50'
            }`}
          >
            <Palette className="h-3.5 w-3.5" />
            <span>Customize {activePreset.name}</span>
          </button>
        </div>

        {/* 1. CUSTOMIZE VIEW (Shown exclusively when Customize is active) */}
        {showCustomStyle ? (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-dark-border pb-2.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCustomStyle(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-xl bg-dark-panel2 text-slate-300 hover:bg-dark-panel3 hover:text-white transition shadow-sm"
                  title="Back to Presets"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="font-extrabold text-slate-100 text-sm">Customize "{activePreset.name}"</span>
              </div>
              <button
                onClick={() => setShowCustomStyle(false)}
                className="rounded-lg bg-dark-panel2 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:bg-dark-panel3 transition"
              >
                Back to Presets
              </button>
            </div>

            {/* Typography Controls */}
            <div className="flex flex-col gap-3 rounded-2xl bg-dark-panel2 p-4 shadow-md">
              <span className="font-extrabold uppercase text-[10px] tracking-wider text-slate-400">Typography & Color</span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 mb-1 block">Font Family</label>
                  <select
                    value={fontFamily}
                    onChange={(e) => handleFontFamilyChange(e.target.value)}
                    className="w-full rounded-xl border border-dark-border bg-dark-panel3 px-3 py-2 text-xs font-bold text-slate-100 outline-none focus:border-primary cursor-pointer"
                  >
                    {FONTS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 mb-1 block">Font Weight</label>
                  <select
                    value={fontWeight}
                    onChange={(e) => handleFontWeightChange(e.target.value)}
                    className="w-full rounded-xl border border-dark-border bg-dark-panel3 px-3 py-2 text-xs font-bold text-slate-100 outline-none focus:border-primary cursor-pointer"
                  >
                    {WEIGHTS.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Uppercase Toggle */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-semibold text-slate-300">Uppercase Text</span>
                <div className="inline-flex rounded-xl bg-dark-panel3 p-0.5 shadow-inner">
                  <button
                    onClick={() => handleUppercaseChange(true)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                      uppercase ? 'bg-primary text-white shadow-purpleGlow' : 'text-slate-400'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => handleUppercaseChange(false)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                      !uppercase ? 'bg-primary text-white shadow-purpleGlow' : 'text-slate-400'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {/* Font Color & Stroke Color */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Font Color</span>
                  <input
                    type="color"
                    value={fontColor}
                    onChange={(e) => handleFontColorChange(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded-xl border border-dark-border bg-dark-panel3 p-0.5 shadow-sm"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Stroke Color</span>
                  <input
                    type="color"
                    value={strokeColor}
                    onChange={(e) => handleStrokeColorChange(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded-xl border border-dark-border bg-dark-panel3 p-0.5 shadow-sm"
                  />
                </div>
              </div>

              {/* Stroke Weight */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-semibold text-slate-300">Stroke Weight</span>
                <SegmentedControl
                  options={['None', 'Small', 'Medium', 'Large']}
                  value={strokeWeight}
                  onChange={handleStrokeWeightChange}
                />
              </div>
            </div>

            {/* Layout & Animation Controls */}
            <div className="flex flex-col gap-4 rounded-2xl bg-dark-panel2 p-4 shadow-md">
              <span className="font-extrabold uppercase text-[10px] tracking-wider text-slate-400">Layout & Animation</span>

              {/* Text Animation Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Text Animation</span>
                <div className="inline-flex rounded-xl bg-dark-panel3 p-0.5 shadow-inner">
                  <button
                    onClick={() => handleAnimationChange(true)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                      animation ? 'bg-primary text-white shadow-purpleGlow' : 'text-slate-400'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => handleAnimationChange(false)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                      !animation ? 'bg-primary text-white shadow-purpleGlow' : 'text-slate-400'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {/* Words per caption */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-300">Words per caption</span>
                  <span className="rounded-lg bg-dark-panel3 px-2 py-0.5 text-xs font-bold text-slate-100 shadow-inner">
                    {displayWords} words
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={displayWords}
                  onChange={(e) => setDisplayWords(Number(e.target.value))}
                  className="w-full h-1.5 cursor-pointer accent-primary"
                />
              </div>

              {/* Position Y */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-300">Position Y</span>
                  <span className="rounded-lg bg-dark-panel3 px-2 py-0.5 text-xs font-bold text-slate-100 shadow-inner">
                    {positionY}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={positionY}
                  onChange={(e) => handlePositionYChange(Number(e.target.value))}
                  className="w-full h-1.5 cursor-pointer accent-primary"
                />
              </div>
            </div>

            {/* Save & Back Button */}
            <button
              onClick={() => setShowCustomStyle(false)}
              className="w-full rounded-2xl bg-primary py-3 text-xs font-bold text-white shadow-purpleGlow hover:bg-primary-hover transition"
            >
              Done Customizing & Return to Presets
            </button>
          </div>
        ) : (
          /* 2. PRESET GALLERY VIEW (Shown exclusively when Choose Style is active) */
          <>
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 px-4 py-2.5 overflow-x-auto border-b border-dark-border bg-dark-panel">
              {STYLE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition shrink-0 ${
                    activeCategory === cat
                      ? 'bg-primary text-white shadow-purpleGlow'
                      : 'text-slate-400 hover:bg-dark-panel2 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Preset Cards Grid (3 Columns) */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-3 gap-3">
                {filteredPresets.map((preset) => {
                  const isSelected = selectedPresetId === preset.id
                  const strokeStyle = preset.strokeWidth
                    ? `-${preset.strokeWidth}px 0 ${preset.strokeColor}, 0 ${preset.strokeWidth}px ${preset.strokeColor}, ${preset.strokeWidth}px 0 ${preset.strokeColor}, 0 -${preset.strokeWidth}px ${preset.strokeColor}`
                    : 'none'

                  return (
                    <div
                      key={preset.id}
                      onClick={() => applyPreset(preset)}
                      className={`group relative flex h-14 cursor-pointer items-center justify-center rounded-xl p-2 transition-all border ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/40 bg-dark-panel3 shadow-purpleGlow scale-[1.02]'
                          : 'border-dark-border bg-dark-panel2/80 hover:bg-dark-panel2 hover:border-dark-borderLight'
                      }`}
                    >
                      {/* New / Premium Badges */}
                      {preset.isNew && (
                        <span className="absolute top-1 left-1 rounded bg-orange-600 px-1 py-0.2 text-[9px] font-black text-white leading-none shadow-sm">
                          New
                        </span>
                      )}
                      {preset.isPremium && (
                        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/20 text-[10px] text-amber-300 font-extrabold border border-amber-400/30 shadow-sm">
                          ⚡
                        </span>
                      )}
                      {isSelected && (
                        <span className="absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white p-0.5 shadow-sm">
                          <Edit3 className="h-2.5 w-2.5" />
                        </span>
                      )}

                      {/* Preset Sample Text Preview */}
                      <span
                        className={`text-center font-black leading-none ${preset.case === 'upper' ? 'uppercase' : ''}`}
                        style={{
                          color: preset.color,
                          backgroundColor: preset.backgroundColor || 'transparent',
                          padding: preset.backgroundColor ? '2px 6px' : 0,
                          borderRadius: preset.backgroundColor ? '4px' : 0,
                          fontFamily: preset.fontFamily === 'Space Grotesk' ? "'Space Grotesk', sans-serif" : `'${preset.fontFamily}', sans-serif`,
                          fontSize: '13px',
                          textShadow: strokeStyle,
                          fontStyle: preset.fontStyle || 'normal',
                        }}
                      >
                        {preset.name}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Bottom Fixed Controls Bar (Position, Font Size, Palette Quick Controls) */}
            <div className="border-t border-dark-border bg-dark-panel p-3.5 flex items-center justify-between gap-3 text-xs font-semibold text-slate-200 shadow-2xl">
              {/* Caption Position */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 shrink-0">Caption Position</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={positionY}
                    onChange={(e) => handlePositionYChange(Number(e.target.value))}
                    className="w-10 rounded-lg border border-dark-border bg-dark-panel3 px-1.5 py-1 text-center font-bold text-xs text-slate-100 outline-none focus:border-primary"
                  />
                  <span className="text-slate-400 font-bold">%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={positionY}
                  onChange={(e) => handlePositionYChange(Number(e.target.value))}
                  className="w-16 h-1 cursor-pointer accent-primary"
                />
              </div>

              {/* Font Size */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 shrink-0">Font size</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={12}
                    max={80}
                    value={fontSize}
                    onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                    className="w-10 rounded-lg border border-dark-border bg-dark-panel3 px-1.5 py-1 text-center font-bold text-xs text-slate-100 outline-none focus:border-primary"
                  />
                  <span className="text-slate-400 font-bold">px</span>
                </div>
                <input
                  type="range"
                  min={12}
                  max={80}
                  value={fontSize}
                  onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                  className="w-16 h-1 cursor-pointer accent-primary"
                />
              </div>

              {/* Colors Swatches */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-bold text-slate-400">Font</span>
                  <input
                    type="color"
                    value={fontColor}
                    onChange={(e) => handleFontColorChange(e.target.value)}
                    className="h-6 w-6 cursor-pointer rounded border border-dark-border bg-dark-panel3 p-0 shadow-sm"
                  />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-bold text-slate-400">Main</span>
                  <input
                    type="color"
                    value={mainColor}
                    onChange={(e) => {
                      setMainColor(e.target.value)
                      updateAllCaptions({ highlightColor: e.target.value })
                    }}
                    className="h-6 w-6 cursor-pointer rounded border border-dark-border bg-dark-panel3 p-0 shadow-sm"
                  />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-bold text-slate-400">Second</span>
                  <input
                    type="color"
                    value={secondColor}
                    onChange={(e) => {
                      setSecondColor(e.target.value)
                      updateAllCaptions({ backgroundColor: e.target.value })
                    }}
                    className="h-6 w-6 cursor-pointer rounded border border-dark-border bg-dark-panel3 p-0 shadow-sm"
                  />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-bold text-slate-400">Third</span>
                  <input
                    type="color"
                    value={thirdColor}
                    onChange={(e) => {
                      setThirdColor(e.target.value)
                      handleStrokeColorChange(e.target.value)
                    }}
                    className="h-6 w-6 cursor-pointer rounded border border-dark-border bg-dark-panel3 p-0 shadow-sm"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // 2. LINE-BY-LINE SUBTITLE EDITOR MODE (Matches reference screenshot)
  if (mode === 'edit_captions') {
    return (
      <div className="flex flex-col h-full bg-dark-panel font-body select-none">
        {/* Top Header Bar with Sub-nav tabs */}
        <div className="flex items-center justify-between border-b border-dark-border px-4 py-3 bg-dark-panel">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('dashboard')}
              className="flex h-7 w-7 items-center justify-center rounded-xl bg-dark-panel2 text-slate-300 hover:bg-dark-panel3 hover:text-white transition shadow-sm"
              title="Back to AI Tools"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            {/* Sub-nav tabs: Captions | Scenes */}
            <div className="inline-flex rounded-xl bg-dark-panel3 p-0.5 shadow-inner">
              <button className="px-3.5 py-1 text-xs font-bold rounded-lg bg-primary text-white shadow-purpleGlow">
                Captions
              </button>
              <button
                onClick={() => onTabChange('scenes')}
                className="px-3.5 py-1 text-xs font-bold rounded-lg text-slate-400 hover:text-slate-200 transition"
              >
                Scenes
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMode('style_captions')}
              className="flex items-center gap-1.5 rounded-xl border border-dark-border bg-dark-panel2 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-dark-panel3 hover:border-primary/50 transition shadow-sm"
            >
              <Palette className="h-3.5 w-3.5 text-primary" />
              Caption Style
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-400 hover:bg-dark-panel2 hover:text-white transition">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* AI Hook Title Banner */}
        <div className="p-4 pb-2">
          <button
            onClick={() => {
              if (autoEditResult?.hook) {
                setCurrentTime(0)
                addCaption(autoEditResult.hook)
              } else {
                runAutoEdit()
              }
            }}
            className="relative flex w-full items-center justify-center gap-2 rounded-2xl border border-dark-border bg-dark-panel2 py-3 px-4 text-xs font-bold text-slate-100 shadow-md hover:border-primary/50 hover:bg-dark-panel3 transition group"
          >
            <Anchor className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
            <span>{autoEditResult?.hook ? `Hook: ${autoEditResult.hook.slice(0, 32)}...` : 'AI Hook Title'}</span>
            <span className="absolute -top-1.5 -right-1 text-xs">⚡</span>
          </button>
        </div>

        {/* Subtitle Line Items List */}
        <div className="flex-1 overflow-y-auto p-4 pt-2 flex flex-col gap-2.5">
          {!captionItems.length ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <MessageSquare className="h-8 w-8 text-slate-600" />
              <p className="text-xs font-bold text-slate-300">No subtitles generated yet</p>
              <button
                onClick={() => transcribeMain()}
                disabled={!hasMainVideo || isTranscribing}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-purpleGlow hover:bg-primary-hover transition disabled:opacity-40"
              >
                {isTranscribing ? 'Transcribing...' : 'Transcribe Video to Generate Subtitles'}
              </button>
            </div>
          ) : (
            captionItems.map((item, idx) => {
              const isHidden = !!item.hidden
              const isSelected = selectedItemId === item.id
              const words = (item.text || '').split(' ')
              const nextItem = captionItems[idx + 1]

              return (
                <div key={item.id} className="flex flex-col gap-1">
                  {/* Current Subtitle Layer Card */}
                  <div
                    onClick={() => {
                      selectItem(item.id)
                      setCurrentTime(item.start)
                    }}
                    className={`group relative flex flex-col gap-1.5 rounded-2xl p-3.5 transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-dark-panel2 border-primary ring-1 ring-primary/40 shadow-purpleGlow'
                        : 'bg-dark-panel2/60 border-dark-border hover:bg-dark-panel2 hover:border-dark-borderLight'
                    } ${isHidden ? 'opacity-40' : ''}`}
                  >
                    {/* Time Range Header & Action Icons */}
                    <div className="flex items-center justify-between text-[11px] font-bold font-mono text-slate-400">
                      <span>
                        {item.start.toFixed(2)} - {(item.start + item.duration).toFixed(2)}
                      </span>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveOptionMenuId(activeOptionMenuId === item.id ? null : item.id)
                          }}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                            activeOptionMenuId === item.id
                              ? 'bg-primary text-white shadow-purpleGlow'
                              : 'bg-dark-panel3 text-slate-400 hover:text-white'
                          }`}
                          title="Caption options"
                        >
                          <Sliders className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleHideItem(item)
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-dark-panel3 text-slate-400 hover:text-white transition"
                          title={isHidden ? 'Show subtitle' : 'Hide subtitle'}
                        >
                          {isHidden ? (
                            <EyeOff className="h-3.5 w-3.5 text-rose-400" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Caption Options Floating Popup Menu (Matches reference screenshot) */}
                    {activeOptionMenuId === item.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-3 top-10 z-50 flex w-72 flex-col gap-2.5 rounded-2xl border border-dark-border bg-dark-panel p-3.5 shadow-2xl backdrop-blur-md text-xs font-medium text-slate-200 animate-in fade-in zoom-in-95 duration-150 select-none"
                      >
                        {/* 1. Mark as corrected */}
                        <button
                          onClick={() => {
                            updateItem(item.id, { corrected: true })
                            setActiveOptionMenuId(null)
                          }}
                          className="flex items-center justify-between rounded-xl border border-dark-border bg-dark-panel2 px-3 py-2 text-xs font-bold text-slate-100 hover:bg-dark-panel3 transition shadow-sm"
                        >
                          <span className="flex items-center gap-2">
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            Mark as corrected
                          </span>
                          <kbd className="rounded bg-dark-panel3 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 border border-dark-border">
                            ⌘+M
                          </kbd>
                        </button>

                        <div className="h-px bg-dark-border" />

                        {/* 2. Start & End Time Inputs */}
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold font-mono text-slate-400 tracking-wider">
                            {item.start.toFixed(2)} — {(item.start + item.duration).toFixed(2)}
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] text-slate-400 font-semibold">Start</span>
                              <input
                                type="number"
                                step="0.05"
                                value={item.start}
                                onChange={(e) => {
                                  const start = parseFloat(e.target.value) || 0
                                  updateItem(item.id, { start })
                                }}
                                className="w-full rounded-xl border border-dark-border bg-dark-panel3 px-2.5 py-1.5 text-xs font-bold font-mono text-slate-100 outline-none focus:ring-1 focus:ring-primary shadow-inner"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] text-slate-400 font-semibold">End</span>
                              <input
                                type="number"
                                step="0.05"
                                value={parseFloat((item.start + item.duration).toFixed(2))}
                                onChange={(e) => {
                                  const end = parseFloat(e.target.value) || item.start + 0.1
                                  const duration = Math.max(0.1, end - item.start)
                                  updateItem(item.id, { duration })
                                }}
                                className="w-full rounded-xl border border-dark-border bg-dark-panel3 px-2.5 py-1.5 text-xs font-bold font-mono text-slate-100 outline-none focus:ring-1 focus:ring-primary shadow-inner"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="h-px bg-dark-border" />

                        {/* 3. Action options */}
                        <div className="flex flex-col gap-1">
                          {/* Remove line break */}
                          <button
                            onClick={() => {
                              updateItem(item.id, { text: (item.text || '').replace(/\n/g, ' ') })
                              setActiveOptionMenuId(null)
                            }}
                            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-slate-300 hover:bg-dark-panel2 hover:text-white transition"
                          >
                            <span className="flex items-center gap-2 text-xs font-semibold">
                              <X className="h-3.5 w-3.5 text-slate-400" />
                              Remove line break
                            </span>
                            <kbd className="rounded bg-dark-panel3 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 border border-dark-border">
                              ⌘+B
                            </kbd>
                          </button>

                          {/* Split into new line */}
                          <button
                            onClick={() => {
                              const words = (item.text || '').split(' ')
                              if (words.length > 1) {
                                splitCaptionItem(item.id, Math.ceil(words.length / 2))
                              }
                              setActiveOptionMenuId(null)
                            }}
                            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-slate-300 hover:bg-dark-panel2 hover:text-white transition"
                          >
                            <span className="flex items-center gap-2 text-xs font-semibold">
                              <Scissors className="h-3.5 w-3.5 text-slate-400" />
                              Split into new line
                            </span>
                            <kbd className="rounded bg-dark-panel3 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 border border-dark-border">
                              ⌘+L
                            </kbd>
                          </button>

                          {/* Add sound */}
                          <button
                            onClick={() => {
                              setActiveOptionMenuId(null)
                            }}
                            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-slate-300 hover:bg-dark-panel2 hover:text-white transition"
                          >
                            <span className="flex items-center gap-2 text-xs font-semibold">
                              <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                              Add sound
                            </span>
                            <span className="text-slate-400 text-xs">›</span>
                          </button>

                          {/* Add word */}
                          <button
                            onClick={() => {
                              const newText = (item.text || '') + ' word'
                              updateItem(item.id, { text: newText })
                              setActiveOptionMenuId(null)
                            }}
                            className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-slate-300 hover:bg-dark-panel2 hover:text-white transition"
                          >
                            <span className="flex items-center gap-2 text-xs font-semibold">
                              <Edit3 className="h-3.5 w-3.5 text-slate-400" />
                              Add word
                            </span>
                            <kbd className="rounded bg-dark-panel3 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 border border-dark-border">
                              ⌘+I
                            </kbd>
                          </button>
                        </div>

                        <div className="h-px bg-dark-border" />

                        {/* 4. Remove / Delete Word */}
                        <button
                          onClick={() => {
                            removeItem(item.id)
                            setActiveOptionMenuId(null)
                          }}
                          className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition"
                        >
                          <span className="flex items-center gap-2 text-xs font-bold">
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove word
                          </span>
                          <kbd className="rounded bg-dark-panel3 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 border border-dark-border">
                            ⌘+D
                          </kbd>
                        </button>
                      </div>
                    )}

                    {/* Caption line text with return arrow ↩ phrase separators */}
                    <div className="flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-100 pt-0.5">
                      {editingItemId === item.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={item.text}
                          onChange={(e) => updateItem(item.id, { text: e.target.value })}
                          onBlur={() => setEditingItemId(null)}
                          onKeyDown={(e) => e.key === 'Enter' && setEditingItemId(null)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full rounded-lg bg-dark-panel3 px-2 py-1 text-xs font-bold text-slate-100 outline-none ring-2 ring-primary"
                        />
                      ) : (
                        <div
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingItemId(item.id)
                          }}
                          className="flex flex-wrap items-center gap-1 leading-relaxed hover:text-primary transition"
                        >
                          {words.map((w, wIdx) => {
                            const isSelectedWord = selectedWordInfo?.itemId === item.id && selectedWordInfo?.wordIndex === wIdx
                            const isHighlighted = (wIdx === 0 && item.highlightColor) || isSelectedWord
                            return (
                              <span key={wIdx} className="inline-flex items-center gap-1">
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    selectItem(item.id)
                                    setCurrentTime(item.start)
                                    if (isSelectedWord) {
                                      setSelectedWordInfo(null)
                                    } else {
                                      setSelectedWordInfo({ itemId: item.id, wordIndex: wIdx, word: w })
                                    }
                                  }}
                                  className={`cursor-pointer rounded px-1.5 py-0.5 transition-all hover:scale-105 ${
                                    isSelectedWord
                                      ? 'ring-2 ring-primary ring-offset-1 ring-offset-dark-panel2 bg-primary text-white font-extrabold shadow-purpleGlow scale-105'
                                      : isHighlighted
                                      ? 'text-slate-900 font-extrabold shadow-sm'
                                      : 'text-slate-100 hover:bg-dark-panel3'
                                  }`}
                                  style={{
                                    backgroundColor: isSelectedWord
                                      ? undefined
                                      : isHighlighted
                                      ? item.highlightColor || '#22D3EE'
                                      : undefined,
                                  }}
                                  title={`Click to open options for "${w}"`}
                                >
                                  {w}
                                </span>
                                {wIdx < words.length - 1 && (
                                  <CornerDownLeft className="h-3 w-3 text-slate-500 stroke-[1.8] inline mx-0.5" />
                                )}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Particular Word Options Panel */}
                    {selectedWordInfo && selectedWordInfo.itemId === item.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2.5 flex flex-col gap-2.5 rounded-xl border border-primary/50 bg-dark-panel3 p-3 shadow-2xl text-xs select-none animate-in fade-in zoom-in-95 duration-150"
                      >
                        {/* Header with Selected Word title and close button */}
                        <div className="flex items-center justify-between pb-1.5 border-b border-dark-border">
                          <div className="flex items-center gap-1.5 font-bold text-slate-200">
                            <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                            <span className="text-[11px] text-slate-400">Word Options:</span>
                            <span className="rounded bg-primary/20 px-2 py-0.5 font-extrabold text-primary border border-primary/30 text-xs">
                              "{selectedWordInfo.word}"
                            </span>
                          </div>
                          <button
                            onClick={() => setSelectedWordInfo(null)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-dark-panel2 hover:text-white transition"
                            title="Close options"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* 1. Quick Inline Word Edit */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 shrink-0">Edit Word:</span>
                          <input
                            type="text"
                            value={selectedWordInfo.word}
                            onChange={(e) => {
                              const newWord = e.target.value
                              const newWords = [...words]
                              newWords[selectedWordInfo.wordIndex] = newWord
                              const newText = newWords.join(' ')
                              updateItem(item.id, { text: newText })
                              setSelectedWordInfo({ ...selectedWordInfo, word: newWord })
                            }}
                            className="flex-1 rounded-lg bg-dark-panel2 px-2.5 py-1 text-xs font-bold text-slate-100 outline-none border border-dark-border focus:border-primary ring-1 focus:ring-primary/40"
                          />
                        </div>

                        {/* 2. Word Highlight Color */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-400">Highlight Color:</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {[
                              { label: 'Yellow', color: '#FACC15' },
                              { label: 'Cyan', color: '#22D3EE' },
                              { label: 'Pink', color: '#F472B6' },
                              { label: 'Emerald', color: '#10B981' },
                              { label: 'Orange', color: '#FB923C' },
                              { label: 'Red', color: '#EF4444' },
                              { label: 'White', color: '#FFFFFF' },
                            ].map((c) => (
                              <button
                                key={c.color}
                                onClick={() => {
                                  updateItem(item.id, { highlightColor: c.color })
                                }}
                                style={{ backgroundColor: c.color }}
                                className={`h-5 w-5 rounded-full border border-black/40 shadow-sm transition hover:scale-125 ${
                                  item.highlightColor === c.color ? 'ring-2 ring-white ring-offset-1 ring-offset-dark-panel3 scale-110' : ''
                                }`}
                                title={`Set ${c.label} highlight`}
                              />
                            ))}
                            <button
                              onClick={() => updateItem(item.id, { highlightColor: null })}
                              className="text-[10px] font-bold text-slate-400 hover:text-white underline ml-1"
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        {/* 3. Text Background Effect Color */}
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-slate-400">Text Background Box:</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {[
                              { label: 'Dark Glass', color: '#000000AA' },
                              { label: 'Slate', color: '#0B0D12CC' },
                              { label: 'Yellow Box', color: '#FACC15' },
                              { label: 'Cyan Box', color: '#22D3EE' },
                              { label: 'Pink Box', color: '#F472B6' },
                            ].map((bg) => (
                              <button
                                key={bg.color}
                                onClick={() => {
                                  updateItem(item.id, { backgroundColor: bg.color })
                                }}
                                style={{ backgroundColor: bg.color }}
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold text-white border border-white/20 shadow-sm transition hover:scale-105 ${
                                  item.backgroundColor === bg.color ? 'ring-2 ring-primary ring-offset-1 ring-offset-dark-panel3' : ''
                                }`}
                                title={bg.label}
                              >
                                {bg.label.split(' ')[0]}
                              </button>
                            ))}
                            <button
                              onClick={() => updateItem(item.id, { backgroundColor: null })}
                              className="text-[10px] font-bold text-slate-400 hover:text-white underline ml-1"
                            >
                              None
                            </button>
                          </div>
                        </div>

                        {/* 4. Word Casing & Split / Delete Actions */}
                        <div className="flex items-center gap-1.5 pt-1.5 border-t border-dark-border/80 flex-wrap">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                const newWords = [...words]
                                newWords[selectedWordInfo.wordIndex] = selectedWordInfo.word.toUpperCase()
                                const newText = newWords.join(' ')
                                updateItem(item.id, { text: newText })
                                setSelectedWordInfo({ ...selectedWordInfo, word: newWords[selectedWordInfo.wordIndex] })
                              }}
                              className="rounded-lg bg-dark-panel2 px-2 py-1 text-[10px] font-extrabold text-slate-200 hover:bg-dark-panel border border-dark-border hover:border-primary/50 transition"
                              title="UPPERCASE"
                            >
                              AA
                            </button>
                            <button
                              onClick={() => {
                                const newWords = [...words]
                                newWords[selectedWordInfo.wordIndex] = selectedWordInfo.word.toLowerCase()
                                const newText = newWords.join(' ')
                                updateItem(item.id, { text: newText })
                                setSelectedWordInfo({ ...selectedWordInfo, word: newWords[selectedWordInfo.wordIndex] })
                              }}
                              className="rounded-lg bg-dark-panel2 px-2 py-1 text-[10px] font-extrabold text-slate-200 hover:bg-dark-panel border border-dark-border hover:border-primary/50 transition"
                              title="lowercase"
                            >
                              aa
                            </button>
                            <button
                              onClick={() => {
                                const newWords = [...words]
                                const w = selectedWordInfo.word
                                newWords[selectedWordInfo.wordIndex] = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                                const newText = newWords.join(' ')
                                updateItem(item.id, { text: newText })
                                setSelectedWordInfo({ ...selectedWordInfo, word: newWords[selectedWordInfo.wordIndex] })
                              }}
                              className="rounded-lg bg-dark-panel2 px-2 py-1 text-[10px] font-extrabold text-slate-200 hover:bg-dark-panel border border-dark-border hover:border-primary/50 transition"
                              title="Title Case"
                            >
                              Aa
                            </button>
                          </div>

                          {/* Split at Word */}
                          {selectedWordInfo.wordIndex > 0 && selectedWordInfo.wordIndex < words.length && (
                            <button
                              onClick={() => {
                                splitCaptionItem(item.id, selectedWordInfo.wordIndex)
                                setSelectedWordInfo(null)
                              }}
                              className="flex items-center gap-1 rounded-lg bg-amber-950/40 px-2 py-1 text-[10px] font-bold text-amber-300 hover:bg-amber-900/60 border border-amber-500/40 transition ml-auto"
                              title="Split subtitle at this word"
                            >
                              <Scissors className="h-3 w-3" />
                              Split here
                            </button>
                          )}

                          {/* Delete Word */}
                          <button
                            onClick={() => {
                              const newWords = words.filter((_, idx) => idx !== selectedWordInfo.wordIndex)
                              if (newWords.length === 0) {
                                removeItem(item.id)
                              } else {
                                updateItem(item.id, { text: newWords.join(' ') })
                              }
                              setSelectedWordInfo(null)
                            }}
                            className="flex items-center gap-1 rounded-lg bg-rose-950/40 px-2 py-1 text-[10px] font-bold text-rose-300 hover:bg-rose-900/60 border border-rose-500/40 transition ml-auto"
                            title="Remove this word"
                          >
                            <Trash2 className="h-3 w-3" />
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Inter-layer Plus Merge Button (between current layer and layer below) */}
                  {idx < captionItems.length - 1 && nextItem && (
                    <div className="relative flex items-center justify-center -my-1.5 py-1 z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          mergeCaptionPair(item.id, nextItem.id)
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-dark-border bg-dark-panel2 text-slate-400 shadow-md hover:scale-110 hover:border-primary/60 hover:bg-primary hover:text-white transition-all group/plus"
                        title="Merge current subtitle layer with layer below"
                      >
                        <Plus className="h-3 w-3 stroke-[2.5]" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-6">
      {/* 1. AI BOOST FEATURES SECTION */}
      <section className="flex flex-col gap-3">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
          AI BOOST FEATURES
        </h3>

        <div className="flex flex-col gap-2.5">
          <BoostCard
            icon={Wand2}
            title="AI Subtitles & Captions"
            description={currentTemplate ? `Preset: ${currentTemplate.name}` : 'Auto-generate styled subtitles'}
            active={captionsEnabled}
            onToggle={() => {
              if (captionItems.length === 0) {
                // Nothing generated yet — transcribe (if needed) and
                // generate styled captions from scratch.
                enableAiCaptions()
              } else if (captionsEnabled) {
                // Hide every caption line from preview + export without
                // deleting them (see setAllCaptionsHidden).
                setAllCaptionsHidden(true)
              } else {
                // Previously hidden — restore them exactly as they were.
                setAllCaptionsHidden(false)
              }
            }}
            actions={[
              { label: 'Style', onClick: () => setMode('style_captions') },
              { label: 'Edit', onClick: () => setMode('edit_captions') },
            ]}
          />

          <BoostCard
            icon={Scissors}
            title="Remove Pause Silences"
            description="Cut silent gaps to tighten video pacing"
            active={boostState.silences}
            onToggle={() => toggleBoost('silences')}
          />

          <BoostCard
            icon={ZoomIn}
            title="AI Auto Zooms"
            description="Auto-zoom key talking moments"
            active={zoomsEnabled}
            disabled={isAutoEditing}
            onToggle={async () => {
              // Blocks a second click while a runAutoEdit request is still
              // in flight — without this, toggling rapidly (or toggling
              // Zooms while a B-roll request is running, since both share
              // one isAutoEditing flag, same as the Scenes.jsx Magic
              // buttons) could resolve out of order and leave the switch
              // showing one state while the timeline has the other.
              if (isAutoEditing) return
              if (zoomsEnabled) {
                // Turning it back off removes only what THIS feature added
                // (source: "auto_edit") — any zoom the user placed by hand
                // via a scene's Zoom toggle is left alone.
                await removeAutoEditItems('zoom')
              } else if (hasTranscript) {
                // mode: 'zoom' — the AI call always returns b-roll
                // suggestions too, but this tells the backend to only
                // apply the zoom ones, so turning Zooms on never also
                // drops a fresh, unrequested batch of b-roll on the
                // timeline (see routers/auto_edit.py).
                await runAutoEdit('zoom')
              }
            }}
            actions={[{ label: 'Edit', onClick: () => onTabChange('scenes') }]}
          />

          <BoostCard
            icon={Film}
            title="AI Auto B-rolls"
            description="Swap moments with stock B-roll footage"
            active={brollEnabled}
            disabled={isAutoEditing}
            onToggle={async () => {
              if (isAutoEditing) return
              if (brollEnabled) {
                // Same as Zooms above — clears only the AI-added b-roll
                // clips, not anything manually attached from Scenes.jsx.
                await removeAutoEditItems('broll')
              } else if (hasTranscript) {
                // mode: 'broll' — same reasoning as AI Auto Zooms above,
                // scoped the other way: only b-roll gets applied, zoom is
                // never touched.
                await runAutoEdit('broll')
              }
            }}
            actions={[{ label: 'Edit', onClick: () => onTabChange('scenes') }]}
          />
        </div>
      </section>

      {/* 2. ADVANCED AI TOOLS SECTION */}
      <section className="flex flex-col gap-3">
        <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
          ADVANCED AI TOOLS
        </h3>

        <div className="flex flex-col gap-2.5">
          <BoostCard
            icon={Volume2}
            iconBg="bg-emerald-600"
            title="AI Clean Audio"
            description="Denoise and enhance speaker voice"
            active={boostState.cleanAudio}
            onToggle={() => toggleBoost('cleanAudio')}
          />

          <BoostCard
            icon={Eye}
            iconBg="bg-blue-600"
            title="Correct Eye Contact"
            description="Adjust eyes to face the camera"
            active={boostState.eyeContact}
            onToggle={() => toggleBoost('eyeContact')}
          />

          <BoostCard
            icon={Type}
            iconBg="bg-amber-500"
            title="AI Stress Text Highlighter"
            description="Auto-detect and style important words in captions"
            active={stressHighlightEnabled}
            disabled={isSettingStressHighlight}
            onToggle={async () => {
              if (isSettingStressHighlight) return
              if (captionItems.length === 0) return
              await setStressHighlightEnabled(!stressHighlightEnabled)
            }}
            actions={[{ label: 'Edit', onClick: () => setStressModalOpen(true) }]}
          />
        </div>
      </section>

      {stressModalOpen && (
        <StressHighlightModal
          value={stressStyleValue}
          onChange={(patch) => updateAllCaptions(patch)}
          onClose={() => setStressModalOpen(false)}
        />
      )}
    </div>
  )
}

function TrimTab() {
  const { timeline, selectedItemId, updateItem, removeItem } = useEditorStore()
  const selectedItem = timeline?.tracks?.flatMap((t) => t.items).find((it) => it.id === selectedItemId)
  const [transitionModalOpen, setTransitionModalOpen] = useState(false)

  return (
    <div className="p-4">
      {!selectedItem ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-dark-panel2/80 shadow-md shadow-black/40 py-16 text-center">
          <Scissors className="h-8 w-8 text-slate-600 stroke-[1.5]" />
          <p className="text-xs font-bold text-slate-200">No clip selected</p>
          <p className="text-[11px] text-slate-400">Select a video, B-roll, or caption item on the timeline.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 rounded-2xl bg-dark-panel2 p-4 shadow-lg shadow-black/40">
          <div className="flex items-center justify-between">
            <span className="rounded-lg bg-primary/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/30">
              Type: {selectedItem.type}
            </span>
            <span className="text-[11px] font-mono font-bold text-slate-400">
              End: {(selectedItem.start + selectedItem.duration).toFixed(2)}s
            </span>
          </div>

          {selectedItem.type === 'caption' && (
            <textarea
              value={selectedItem.text}
              onChange={(e) => updateItem(selectedItem.id, { text: e.target.value })}
              rows={2}
              className="w-full resize-none rounded-xl bg-dark-panel3 px-3 py-2 text-xs font-bold text-slate-100 outline-none focus:ring-2 focus:ring-primary shadow-inner"
            />
          )}

          <label className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-300">
            Start Time (s)
            <input
              type="number"
              step="0.1"
              value={selectedItem.start}
              onChange={(e) => updateItem(selectedItem.id, { start: Math.max(0, parseFloat(e.target.value) || 0) })}
              className="w-24 rounded-xl bg-dark-panel3 px-2.5 py-1 text-xs font-bold text-slate-100 outline-none shadow-inner border border-dark-border"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-300">
              <span>Duration (s)</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={selectedItem.duration}
                onChange={(e) => updateItem(selectedItem.id, { duration: Math.max(0.1, parseFloat(e.target.value) || 0.1) })}
                className="w-24 rounded-xl bg-dark-panel3 px-2.5 py-1 text-xs font-bold text-slate-100 outline-none shadow-inner border border-dark-border"
              />
            </label>

            {/* Quick Duration Increase & Extension Buttons */}
            <div className="flex flex-col gap-1 pt-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Quick Increase / Adjust</span>
              <div className="grid grid-cols-5 gap-1">
                <button
                  type="button"
                  onClick={() => updateItem(selectedItem.id, { duration: Math.max(0.1, Number((selectedItem.duration - 0.5).toFixed(2))) })}
                  className="rounded-lg bg-dark-panel3 px-1.5 py-1 text-[10px] font-bold text-slate-300 hover:bg-dark-panel hover:text-white transition border border-dark-border text-center"
                  title="Decrease 0.5s"
                >
                  -0.5s
                </button>
                <button
                  type="button"
                  onClick={() => updateItem(selectedItem.id, { duration: Number((selectedItem.duration + 0.5).toFixed(2)) })}
                  className="rounded-lg bg-dark-panel3 px-1.5 py-1 text-[10px] font-bold text-slate-300 hover:bg-primary/20 hover:text-primary transition border border-dark-border text-center"
                  title="Increase 0.5s"
                >
                  +0.5s
                </button>
                <button
                  type="button"
                  onClick={() => updateItem(selectedItem.id, { duration: Number((selectedItem.duration + 1.0).toFixed(2)) })}
                  className="rounded-lg bg-dark-panel3 px-1.5 py-1 text-[10px] font-bold text-slate-300 hover:bg-primary/20 hover:text-primary transition border border-dark-border text-center"
                  title="Increase 1s"
                >
                  +1.0s
                </button>
                <button
                  type="button"
                  onClick={() => updateItem(selectedItem.id, { duration: Number((selectedItem.duration + 2.0).toFixed(2)) })}
                  className="rounded-lg bg-dark-panel3 px-1.5 py-1 text-[10px] font-bold text-slate-300 hover:bg-primary/20 hover:text-primary transition border border-dark-border text-center"
                  title="Increase 2s"
                >
                  +2.0s
                </button>
                <button
                  type="button"
                  onClick={() => updateItem(selectedItem.id, { duration: Number((selectedItem.duration + 5.0).toFixed(2)) })}
                  className="rounded-lg bg-dark-panel3 px-1.5 py-1 text-[10px] font-bold text-slate-300 hover:bg-primary/20 hover:text-primary transition border border-dark-border text-center"
                  title="Increase 5s"
                >
                  +5.0s
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1 mt-1">
                <button
                  type="button"
                  onClick={() => updateItem(selectedItem.id, { duration: 3.0 })}
                  className="rounded-lg bg-dark-panel3 px-1.5 py-1 text-[10px] font-bold text-slate-400 hover:bg-dark-panel hover:text-white transition border border-dark-border text-center"
                >
                  3.0s
                </button>
                <button
                  type="button"
                  onClick={() => updateItem(selectedItem.id, { duration: 5.0 })}
                  className="rounded-lg bg-dark-panel3 px-1.5 py-1 text-[10px] font-bold text-slate-400 hover:bg-dark-panel hover:text-white transition border border-dark-border text-center"
                >
                  5.0s
                </button>
                <button
                  type="button"
                  onClick={() => updateItem(selectedItem.id, { duration: 8.0 })}
                  className="rounded-lg bg-dark-panel3 px-1.5 py-1 text-[10px] font-bold text-slate-400 hover:bg-dark-panel hover:text-white transition border border-dark-border text-center"
                >
                  8.0s
                </button>
                <button
                  type="button"
                  onClick={() => updateItem(selectedItem.id, { duration: 10.0 })}
                  className="rounded-lg bg-dark-panel3 px-1.5 py-1 text-[10px] font-bold text-slate-400 hover:bg-dark-panel hover:text-white transition border border-dark-border text-center"
                >
                  10.0s
                </button>
              </div>
            </div>
          </div>

          {/* Manual Effect & Animation Controls */}
          {(selectedItem.type === 'broll' || selectedItem.type === 'overlay') && (
            <div className="flex flex-col gap-2.5 pt-2 border-t border-dark-border">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Transition</span>
              <button
                type="button"
                onClick={() => setTransitionModalOpen(true)}
                className="flex items-center gap-3 rounded-xl bg-dark-panel3 p-2 border border-dark-border hover:border-primary/60 transition-all text-left"
              >
                <div className="relative h-14 w-9 shrink-0 overflow-hidden rounded-lg bg-dark-bg">
                  <img
                    src={`/reveal-thumbnails/${selectedItem.revealAnimation || 'slide_down'}.jpg`}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(e) => { e.currentTarget.style.opacity = 0 }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-100 truncate">
                    {REVEAL_ANIMATIONS.find((a) => a.id === (selectedItem.revealAnimation || 'slide_down'))?.label || 'Slide Down'}
                  </p>
                  <p className="text-[10px] text-slate-400">Edit Transition & Layout</p>
                </div>
                <Wand2 className="h-4 w-4 text-primary shrink-0" />
              </button>

              {transitionModalOpen && (
                <RevealAnimationModal
                  value={selectedItem.revealAnimation || 'slide_down'}
                  onChange={(id) => updateItem(selectedItem.id, { revealAnimation: id })}
                  layoutValue={selectedItem.layout || 'full'}
                  onLayoutChange={(id) => updateItem(selectedItem.id, { layout: id })}
                  onClose={() => setTransitionModalOpen(false)}
                />
              )}

              <label className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-300 mt-1">
                <span>Reveal Speed (s)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="2.0"
                  value={selectedItem.revealDuration !== undefined ? selectedItem.revealDuration : 0.5}
                  onChange={(e) => updateItem(selectedItem.id, { revealDuration: Math.max(0.1, parseFloat(e.target.value) || 0.5) })}
                  className="w-20 rounded-xl bg-dark-panel3 px-2 py-1 text-xs font-bold text-slate-100 outline-none border border-dark-border"
                />
              </label>
            </div>
          )}

          {selectedItem.type === 'caption' && (
            <div className="flex flex-col gap-2.5 pt-2 border-t border-dark-border">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Caption Animation Effect</span>
              <div className="grid grid-cols-3 gap-1 bg-dark-panel3 p-1.5 rounded-xl border border-dark-border">
                {[
                  { id: 'none', label: 'None' },
                  { id: 'fade', label: 'Fade' },
                  { id: 'pop', label: 'Pop' },
                  { id: 'bounce', label: 'Bounce' },
                  { id: 'karaoke', label: 'Karaoke' },
                  { id: 'word_by_word', label: 'Word' },
                  { id: 'slide_up', label: 'Slide Up' },
                ].map((anim) => {
                  const currentAnim = selectedItem.animation || 'fade'
                  const isActive = currentAnim === anim.id
                  return (
                    <button
                      key={anim.id}
                      type="button"
                      onClick={() => updateItem(selectedItem.id, { animation: anim.id })}
                      className={`rounded-lg px-2 py-1 text-[10px] font-bold transition-all text-center ${
                        isActive ? 'bg-primary text-white shadow-purpleGlow' : 'text-slate-400 hover:bg-dark-panel2 hover:text-slate-200'
                      }`}
                    >
                      {anim.label}
                    </button>
                  )
                })}
              </div>

              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mt-1">Caption Position</span>
              <div className="grid grid-cols-3 gap-1 bg-dark-panel3 p-1 rounded-xl border border-dark-border">
                {[
                  { id: 'top', label: 'Top' },
                  { id: 'center', label: 'Center' },
                  { id: 'bottom', label: 'Bottom' },
                ].map((pos) => {
                  const currentPos = selectedItem.position || 'bottom'
                  const isActive = currentPos === pos.id
                  return (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => updateItem(selectedItem.id, { position: pos.id })}
                      className={`rounded-lg px-2 py-1 text-[10px] font-bold transition-all text-center ${
                        isActive ? 'bg-primary text-white shadow-purpleGlow' : 'text-slate-400 hover:bg-dark-panel2 hover:text-slate-200'
                      }`}
                    >
                      {pos.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {selectedItem.type === 'zoom' && (
            <div className="flex flex-col gap-2 pt-2 border-t border-dark-border">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Zoom Scale Factor</span>
              <div className="flex items-center gap-1.5">
                {[1.15, 1.25, 1.4, 1.6, 2.0].map((s) => {
                  const currentScale = selectedItem.transform?.scale || 1.3
                  const isActive = Math.abs(currentScale - s) < 0.05
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => updateItem(selectedItem.id, { transform: { ...(selectedItem.transform || {}), scale: s } })}
                      className={`flex-1 rounded-lg py-1 text-[10px] font-bold border transition ${
                        isActive ? 'bg-primary text-white border-primary shadow-purpleGlow' : 'bg-dark-panel3 text-slate-400 border-dark-border hover:text-white'
                      }`}
                    >
                      {s}x
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <button
            onClick={() => removeItem(selectedItem.id)}
            className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-red-950/60 py-2 text-xs font-bold text-danger hover:bg-red-900 transition shadow-sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Item
          </button>
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ activeTab, onTabChange }) {
  const [localTab, setLocalTab] = useState('captions')
  const tab = activeTab !== undefined ? activeTab : localTab
  const setTab = onTabChange || setLocalTab
  const [captionMode, setCaptionMode] = useState('dashboard') // dashboard | edit_captions | style_captions
  const contentRef = useRef(null)

  // Switching tabs should feel instant: skip the no-op click when the tab
  // is already active (avoids a pointless re-render + captionMode reset),
  // and don't let the previous tab's scroll offset carry into the next one
  // — without this a panel you land on can render pre-scrolled and look
  // like it's missing its top content.
  function switchTab(id) {
    if (id === tab) return
    setTab(id)
    setCaptionMode('dashboard')
  }

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [tab])

  return (
    <div className="flex h-full flex-col bg-dark-panel select-none">
      {/* Hide main top tabs header when inside sub-panels (edit_captions or style_captions) so the sub-panel top bar takes over */}
      {tab === 'captions' && captionMode !== 'dashboard' ? null : (
        <div className="flex bg-dark-panel px-3 pt-2 shadow-sm">
          {EDIT_TABS.map(({ id, label, Icon }) => {
            const isActive = tab === id
            return (
              <button
                key={id}
                onClick={() => switchTab(id)}
                className={`flex flex-1 items-center justify-center gap-2 py-3 text-xs font-bold transition-all border-b-2 ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            )
          })}
        </div>
      )}

      {/* Main Tab Content — every panel stays mounted and is only hidden via
          CSS (never unmounted). Switching back and forth is then a cheap
          style toggle instead of a full remount, and each panel keeps its
          own in-progress state (selected scene, open b-roll menu, trim
          selection, caption sub-mode) instead of losing it every time you
          tab away and back. */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <div className={tab === 'captions' ? '' : 'hidden'}>
          <CaptionsTab
            mode={captionMode}
            setMode={setCaptionMode}
            onTabChange={(t) => {
              setTab(t)
              setCaptionMode('dashboard')
            }}
          />
        </div>
        <div className={tab === 'scenes' ? '' : 'hidden'}>
          <Scenes />
        </div>
        <div className={tab === 'trim' ? '' : 'hidden'}>
          <TrimTab />
        </div>
      </div>
    </div>
  )
}
