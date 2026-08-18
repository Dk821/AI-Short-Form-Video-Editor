import { useRef, useState } from 'react'
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

function Toggle({ active, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`toggle-switch ${active ? 'active' : ''}`}
      title={active ? 'Enabled' : 'Disabled'}
    />
  )
}

function BoostCard({ icon: Icon, iconBg, title, description, active, onToggle, actions }) {
  return (
    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-dark-panel2 shadow-md shadow-black/40 hover:shadow-lg hover:shadow-black/60 transition-all">
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
        <Toggle active={active} onToggle={onToggle} />
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
    autoEditResult,
  } = useEditorStore()

  // Style State
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
    captions: true,
    silences: true,
    zooms: true,
    broll: true,
    hookTitle: false,
    cleanAudio: false,
    badTakes: false,
    eyeContact: false,
  })

  // Hidden caption items set & active options popup menu
  const [hiddenItems, setHiddenItems] = useState(new Set())
  const [editingItemId, setEditingItemId] = useState(null)
  const [activeOptionMenuId, setActiveOptionMenuId] = useState(null)

  const toggleBoost = (key) => setBoostState((s) => ({ ...s, [key]: !s[key] }))
  const toggleHideItem = (id) => {
    setHiddenItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hasMainVideo = !!mainAsset()
  const hasTranscript = !!transcript?.words?.length

  const captionTrack = timeline?.tracks?.find((t) => t.type === 'caption')
  const captionItems = captionTrack?.items || []

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

  // 1. CAPTION STYLE MODE
  if (mode === 'style_captions') {
    return (
      <div className="p-5 flex flex-col gap-5 select-none">
        {/* Style Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('edit_captions')}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-dark-panel2 text-slate-300 hover:bg-dark-panel3 hover:text-white transition shadow-sm"
              title="Back to Subtitles"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            {isRenamingTheme ? (
              <input
                autoFocus
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
                onBlur={() => setIsRenamingTheme(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsRenamingTheme(false)}
                className="rounded-lg bg-dark-panel3 px-2 py-1 text-xs font-bold text-slate-100 outline-none shadow-inner"
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-slate-100">{themeName}</span>
                <button
                  onClick={() => setIsRenamingTheme(true)}
                  className="text-slate-500 hover:text-slate-300 p-0.5"
                  title="Rename Theme"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              if (captionItems.length) {
                updateAllCaptions({
                  fontFamily,
                  fontWeight: fontWeight === 'Regular' ? 400 : fontWeight === 'Medium' ? 500 : fontWeight === 'Semibold' ? 600 : fontWeight === 'Bold' ? 700 : 900,
                  fontSize: Math.round(fontSize * 2.3),
                  color: fontColor,
                  strokeColor,
                  strokeWidth: strokeWeight === 'Large' ? 4 : strokeWeight === 'Medium' ? 2.5 : strokeWeight === 'Small' ? 1 : 0,
                  position: positionY > 66 ? 'bottom' : positionY < 33 ? 'top' : 'center',
                  case: uppercase ? 'upper' : 'none',
                  animation: animation ? 'pop' : 'none',
                })
              } else {
                generateCaptions('clean_bottom', displayWords)
              }
              setMode('edit_captions')
            }}
            className="rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-white shadow-purpleGlow hover:bg-primary-hover transition flex items-center gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" /> Save Style
          </button>
        </div>

        {/* 1. TYPOGRAPHY SECTION */}
        <div className="flex flex-col gap-4 rounded-2xl bg-dark-panel2 p-4 shadow-md">
          <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Typography</h4>
          
          {/* Font Family & Weight */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Font Family</label>
              <select
                value={fontFamily}
                onChange={(e) => handleFontFamilyChange(e.target.value)}
                className="w-full rounded-xl bg-dark-panel3 px-3 py-2 text-xs font-bold text-slate-100 outline-none shadow-inner cursor-pointer"
              >
                {FONTS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Font Weight</label>
              <select
                value={fontWeight}
                onChange={(e) => handleFontWeightChange(e.target.value)}
                className="w-full rounded-xl bg-dark-panel3 px-3 py-2 text-xs font-bold text-slate-100 outline-none shadow-inner cursor-pointer"
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

          {/* Font Size Slider */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">Font Size</label>
              <span className="rounded-lg bg-dark-panel3 px-2 py-0.5 text-xs font-bold text-slate-100 shadow-inner">
                {fontSize}px
              </span>
            </div>
            <input
              type="range"
              min={12}
              max={80}
              value={fontSize}
              onChange={(e) => handleFontSizeChange(Number(e.target.value))}
              className="w-full h-1.5 cursor-pointer"
            />
          </div>

          {/* Font Color Picker */}
          <div className="flex items-center justify-between pt-1">
            <label className="text-xs font-semibold text-slate-300">Font Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={fontColor}
                onChange={(e) => handleFontColorChange(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-xl bg-dark-panel3 p-0.5 shadow-sm shrink-0"
              />
              <input
                type="text"
                value={fontColor}
                onChange={(e) => handleFontColorChange(e.target.value)}
                className="w-24 rounded-xl bg-dark-panel3 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-100 outline-none shadow-inner"
              />
            </div>
          </div>

          {/* Stroke Weight */}
          <div className="flex items-center justify-between pt-1">
            <label className="text-xs font-semibold text-slate-300">Stroke Weight</label>
            <SegmentedControl
              options={['None', 'Small', 'Medium', 'Large']}
              value={strokeWeight}
              onChange={handleStrokeWeightChange}
            />
          </div>

          {/* Stroke Color */}
          <div className="flex items-center justify-between pt-1">
            <label className="text-xs font-semibold text-slate-300">Stroke Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={strokeColor}
                onChange={(e) => handleStrokeColorChange(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-xl bg-dark-panel3 p-0.5 shadow-sm shrink-0"
              />
              <input
                type="text"
                value={strokeColor}
                onChange={(e) => handleStrokeColorChange(e.target.value)}
                className="w-24 rounded-xl bg-dark-panel3 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-100 outline-none shadow-inner"
              />
            </div>
          </div>

          {/* Drop Shadow */}
          <div className="flex items-center justify-between pt-1">
            <label className="text-xs font-semibold text-slate-300">Drop Shadow</label>
            <SegmentedControl
              options={['None', 'Small', 'Medium', 'Large']}
              value={shadow}
              onChange={setShadow}
            />
          </div>
        </div>

        {/* 2. CAPTION LAYOUT & ANIMATIONS SECTION */}
        <div className="flex flex-col gap-4 rounded-2xl bg-dark-panel2 p-4 shadow-md">
          <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Caption Layout & Animation</h4>

          {/* Words per caption */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">Words per caption</label>
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
              className="w-full h-1.5 cursor-pointer"
            />
          </div>

          {/* Position Y */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">Position Y</label>
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
              className="w-full h-1.5 cursor-pointer"
            />
          </div>

          {/* Text Animation */}
          <div className="flex items-center justify-between pt-1">
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

          {/* Punctuation */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-semibold text-slate-300">Punctuation</span>
            <div className="inline-flex rounded-xl bg-dark-panel3 p-0.5 shadow-inner">
              <button
                onClick={() => setPunctuation(true)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                  punctuation ? 'bg-primary text-white shadow-purpleGlow' : 'text-slate-400'
                }`}
              >
                Yes
              </button>
              <button
                onClick={() => setPunctuation(false)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                  !punctuation ? 'bg-primary text-white shadow-purpleGlow' : 'text-slate-400'
                }`}
              >
                No
              </button>
            </div>
          </div>

          {/* Auto Emojis */}
          <div className="flex items-center justify-between pt-1">
            <label className="text-xs font-semibold text-slate-300">Auto Emojis</label>
            <SegmentedControl
              options={['Auto', 'Top', 'None']}
              value={autoEmoji}
              onChange={setAutoEmoji}
            />
          </div>

          {/* Emoji Animation */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-semibold text-slate-300">Emoji Animation</span>
            <div className="inline-flex rounded-xl bg-dark-panel3 p-0.5 shadow-inner">
              <button
                onClick={() => setEmojiAnimation(true)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                  emojiAnimation ? 'bg-primary text-white shadow-purpleGlow' : 'text-slate-400'
                }`}
              >
                Yes
              </button>
              <button
                onClick={() => setEmojiAnimation(false)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                  !emojiAnimation ? 'bg-primary text-white shadow-purpleGlow' : 'text-slate-400'
                }`}
              >
                No
              </button>
            </div>
          </div>

          {/* Accent Colors Palette */}
          <div className="pt-2">
            <label className="text-xs font-semibold text-slate-300 mb-2 block">Theme Colors</label>
            <div className="grid grid-cols-3 gap-2.5">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400">Accent</span>
                <input
                  type="color"
                  value={mainColor}
                  onChange={(e) => setMainColor(e.target.value)}
                  className="h-9 w-full cursor-pointer rounded-xl bg-dark-panel3 p-0.5 shadow-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400">Secondary</span>
                <input
                  type="color"
                  value={secondColor}
                  onChange={(e) => setSecondColor(e.target.value)}
                  className="h-9 w-full cursor-pointer rounded-xl bg-dark-panel3 p-0.5 shadow-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400">Background</span>
                <input
                  type="color"
                  value={thirdColor}
                  onChange={(e) => setThirdColor(e.target.value)}
                  className="h-9 w-full cursor-pointer rounded-xl bg-dark-panel3 p-0.5 shadow-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Apply / Save Custom Theme Button */}
        <div>
          {!hasTranscript ? (
            <button
              onClick={() => transcribeMain()}
              disabled={!hasMainVideo || isTranscribing}
              className="w-full rounded-2xl bg-primary py-3 text-xs font-bold text-white shadow-purpleGlow hover:bg-primary-hover transition disabled:opacity-40"
            >
              {isTranscribing ? 'Transcribing Video...' : 'Transcribe Video to Apply Subtitles'}
            </button>
          ) : (
            <button
              onClick={() => {
                if (captionItems.length) {
                  updateAllCaptions({
                    fontFamily,
                    fontWeight: fontWeight === 'Regular' ? 400 : fontWeight === 'Medium' ? 500 : fontWeight === 'Semibold' ? 600 : fontWeight === 'Bold' ? 700 : 900,
                    fontSize: Math.round(fontSize * 2.3),
                    color: fontColor,
                    strokeColor,
                    strokeWidth: strokeWeight === 'Large' ? 4 : strokeWeight === 'Medium' ? 2.5 : strokeWeight === 'Small' ? 1 : 0,
                    position: positionY > 66 ? 'bottom' : positionY < 33 ? 'top' : 'center',
                    case: uppercase ? 'upper' : 'none',
                    animation: animation ? 'pop' : 'none',
                  })
                } else {
                  generateCaptions('clean_bottom', displayWords)
                }
                setMode('edit_captions')
              }}
              disabled={isGeneratingCaptions}
              className="w-full rounded-2xl bg-primary py-3 text-xs font-bold text-white shadow-purpleGlow hover:bg-primary-hover transition disabled:opacity-40"
            >
              {isGeneratingCaptions ? 'Applying Custom Captions...' : 'Apply & Save Custom Theme'}
            </button>
          )}
        </div>
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
              const isHidden = hiddenItems.has(item.id)
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
                            toggleHideItem(item.id)
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
                                const mid = Math.ceil(words.length / 2)
                                const firstHalf = words.slice(0, mid).join(' ')
                                const secondHalf = words.slice(mid).join(' ')
                                const halfDur = item.duration / 2
                                updateItem(item.id, { text: firstHalf, duration: halfDur })
                                addCaption(secondHalf)
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
                            const isHighlighted = wIdx === 0 && item.highlightColor
                            return (
                              <span key={wIdx} className="inline-flex items-center gap-1">
                                <span
                                  className={
                                    isHighlighted
                                      ? 'rounded px-1.5 py-0.5 text-slate-900 font-extrabold shadow-sm'
                                      : 'text-slate-100'
                                  }
                                  style={{
                                    backgroundColor: isHighlighted ? item.highlightColor || '#22D3EE' : undefined,
                                  }}
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
                  </div>

                  {/* Inter-layer Plus Merge Button (between current layer and layer below) */}
                  {idx < captionItems.length - 1 && nextItem && (
                    <div className="relative flex items-center justify-center -my-1.5 py-1 z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const mergedText = `${item.text || ''} ${nextItem.text || ''}`.trim()
                          const mergedDuration = Math.max(0.1, (nextItem.start + nextItem.duration) - item.start)
                          updateItem(item.id, { text: mergedText, duration: mergedDuration })
                          removeItem(nextItem.id)
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
            description="Auto-generate styled subtitles"
            active={boostState.captions}
            onToggle={() => toggleBoost('captions')}
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
            active={boostState.zooms}
            onToggle={() => {
              toggleBoost('zooms')
              if (!boostState.zooms && hasTranscript) runAutoEdit()
            }}
            actions={[{ label: 'Edit', onClick: () => setMode('edit_captions') }]}
          />

          <BoostCard
            icon={Film}
            title="AI Auto B-rolls"
            description="Swap moments with stock B-roll footage"
            active={boostState.broll}
            onToggle={() => {
              toggleBoost('broll')
              if (!boostState.broll && hasTranscript) runAutoEdit()
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
            icon={Sparkles}
            iconBg="bg-primary/90"
            title="AI Hook Intro Title"
            description="Generate an engaging opening title"
            active={boostState.hookTitle}
            onToggle={() => toggleBoost('hookTitle')}
          />

          <BoostCard
            icon={Volume2}
            iconBg="bg-emerald-600"
            title="AI Clean Audio"
            description="Denoise and enhance speaker voice"
            active={boostState.cleanAudio}
            onToggle={() => toggleBoost('cleanAudio')}
          />

          <BoostCard
            icon={Trash2}
            iconBg="bg-rose-600"
            title="Remove Bad Takes"
            description="Detect and cut repeated sentence takes"
            active={boostState.badTakes}
            onToggle={() => toggleBoost('badTakes')}
          />

          <BoostCard
            icon={Eye}
            iconBg="bg-blue-600"
            title="Correct Eye Contact"
            description="Adjust eyes to face the camera"
            active={boostState.eyeContact}
            onToggle={() => toggleBoost('eyeContact')}
          />
        </div>
      </section>
    </div>
  )
}

function TrimTab() {
  const { timeline, selectedItemId, updateItem, removeItem } = useEditorStore()
  const selectedItem = timeline?.tracks?.flatMap((t) => t.items).find((it) => it.id === selectedItemId)

  return (
    <div className="p-4">
      {!selectedItem ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-dark-panel2/80 shadow-md shadow-black/40 py-16 text-center">
          <Scissors className="h-8 w-8 text-slate-600 stroke-[1.5]" />
          <p className="text-xs font-bold text-slate-200">No clip selected</p>
          <p className="text-[11px] text-slate-400">Select a video, B-roll, or caption item on the timeline.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl bg-dark-panel2 p-4 shadow-lg shadow-black/40">
          <span className="rounded-lg bg-dark-panel3 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300 w-fit">
            Type: {selectedItem.type}
          </span>

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
              onChange={(e) => updateItem(selectedItem.id, { start: parseFloat(e.target.value) || 0 })}
              className="w-24 rounded-xl bg-dark-panel3 px-2.5 py-1 text-xs font-bold text-slate-100 outline-none shadow-inner"
            />
          </label>

          <label className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-300">
            Duration (s)
            <input
              type="number"
              step="0.1"
              value={selectedItem.duration}
              onChange={(e) => updateItem(selectedItem.id, { duration: parseFloat(e.target.value) || 0.1 })}
              className="w-24 rounded-xl bg-dark-panel3 px-2.5 py-1 text-xs font-bold text-slate-100 outline-none shadow-inner"
            />
          </label>

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
                onClick={() => {
                  setTab(id)
                  setCaptionMode('dashboard')
                }}
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

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'captions' && (
          <CaptionsTab
            mode={captionMode}
            setMode={setCaptionMode}
            onTabChange={(t) => {
              setTab(t)
              setCaptionMode('dashboard')
            }}
          />
        )}
        {tab === 'scenes' && <Scenes />}
        {tab === 'trim' && <TrimTab />}
      </div>
    </div>
  )
}
