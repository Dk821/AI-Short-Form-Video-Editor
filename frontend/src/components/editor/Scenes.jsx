import { useState } from 'react'
import {
  ZoomIn, Film, Plus, Wand2, Trash2, MessageSquare, Check, Music, MousePointerClick, User, RefreshCw, Scissors,
  Sparkles, Loader2,
} from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import RevealAnimationModal from './animations/RevealAnimationModal'

/**
 * Sentence-level scene view. One row per sentence-ish chunk of the
 * video's transcript (see utils/transcript.js's segmentTranscriptIntoScenes,
 * driven by store.scenes()).
 *
 * Layout: a stacked header (time range, then the sentence text) followed
 * by a row of LABELED icon+text pill chips — Zoom and Speaker are plain
 * on/off toggles, B-roll/Sound/CTA are the same chip in two states (an
 * outlined "not attached yet" chip that attaches directly on click, or a
 * filled "attached" chip that opens a small Replace/Delete-style menu on
 * click) — plus a trailing "+" chip that opens the same categorized menu
 * as before for whichever of B-roll/Sound/CTA isn't attached. Scene cards
 * are separated by a thin divider with a small scissors badge, standing
 * in for the cut between the two sentences/shots.
 */
export default function Scenes() {
  const {
    timeline, scenes, zoomItemsInRange, brollItemsInRange, sfxItemsInRange, ctaItemsInRange,
    speakerItemsInRange, toggleZoomForScene, toggleSpeakerForScene,
    openBrollLibraryForScene, openSfxPickerForScene, openCtaPickerForScene,
    removeItem, updateItem, transcribeMain, isTranscribing, mainAsset,
    runAutoEdit, isAutoEditingBroll, isAutoEditingZoom, autoEditError, removeAutoEditItems,
  } = useEditorStore()

  const [openMenuKey, setOpenMenuKey] = useState(null) // `${sceneId}:${'broll'|'sfx'|'cta'|'add'}`
  const [transitionItemId, setTransitionItemId] = useState(null)
  // Derived fresh from `timeline` on every render (not a snapshot) — so
  // after updateItem() applies a pick, the modal's own checkmark moves to
  // the new selection immediately instead of staying pinned to whatever
  // was selected when the menu was first opened.
  const transitionItem = transitionItemId
    ? timeline?.tracks?.flatMap((t) => t.items).find((it) => it.id === transitionItemId)
    : null

  const sceneList = scenes()
  const hasMainVideo = !!mainAsset()

  if (!sceneList.length) {
    return (
      <div className="p-4">
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-dark-panel2/80 shadow-md shadow-black/40 py-16 text-center px-6">
          <MessageSquare className="h-8 w-8 text-slate-600 stroke-[1.5]" />
          <p className="text-xs font-bold text-slate-200">No scenes yet</p>
          <p className="text-[11px] text-slate-400 max-w-[240px]">
            Scenes come from your video's transcript — transcribe it first, then
            each sentence shows up here for quick zoom, b-roll, sound, and widget edits.
          </p>
          <button
            onClick={() => transcribeMain()}
            disabled={!hasMainVideo || isTranscribing}
            className="mt-1 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-purpleGlow hover:bg-primary-hover transition disabled:opacity-40"
          >
            {isTranscribing ? 'Transcribing...' : 'Transcribe Video'}
          </button>
        </div>
      </div>
    )
  }

  function closeMenus() {
    setOpenMenuKey(null)
  }

  function addNewBroll(scene, existingItems) {
    // Replace rather than stack — leaving the old clip in place while a
    // second one is attached to the same time range would just overlap
    // two b-roll layers on top of each other.
    existingItems.forEach((it) => removeItem(it.id))
    openBrollLibraryForScene(scene)
    closeMenus()
  }

  function deleteItems(items) {
    items.forEach((it) => removeItem(it.id))
    closeMenus()
  }

  function replaceSfx(scene, existingItems) {
    existingItems.forEach((it) => removeItem(it.id))
    openSfxPickerForScene(scene)
    closeMenus()
  }

  function replaceCta(scene, existingItems) {
    existingItems.forEach((it) => removeItem(it.id))
    openCtaPickerForScene(scene)
    closeMenus()
  }

  // "Magic B-rolls" / "Magic Zooms" at the top of the panel — a reroll
  // button for the whole video at once, instead of scene-by-scene. Each
  // one is scoped to ONLY its own track: runAutoEdit(mode) tells the
  // backend to apply just that type of AI decision (see
  // routers/auto_edit.py's _MODE_MOMENT_TYPE), so clicking "Magic Zooms"
  // never also drops a fresh batch of b-roll on the timeline, and vice
  // versa. Clearing that track's existing `source: "auto_edit"` items
  // first (see models.py / removeAutoEditItems) is what makes this "a NEW
  // set" instead of piling a second batch on top of whatever the last
  // click (or the matching AI Boost toggle in Sidebar.jsx) already added —
  // a manually placed zoom/b-roll (no `source` tag) is never touched, and
  // the OTHER track is left completely alone either way.
  async function regenerateMagicBroll() {
    if (isAutoEditingBroll) return
    // Awaited — removeAutoEditItems' own save must land on the server
    // BEFORE the next /auto-edit call, or the backend applies the fresh
    // batch on top of a copy that still has the old items, stacking
    // duplicates instead of replacing them (removeAutoEditItems is now
    // async for exactly this reason — see editorStore.js).
    await removeAutoEditItems('broll')
    await runAutoEdit('broll')
  }
  async function regenerateMagicZoom() {
    if (isAutoEditingZoom) return
    await removeAutoEditItems('zoom')
    await runAutoEdit('zoom')
  }

  // Shared look for every pill in the row — active (attached / toggled on)
  // vs. idle, so Zoom/Speaker toggles and B-roll/Sound/CTA chips read as
  // one consistent family instead of two different button styles.
  const pillBase =
    'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap transition'
  const pillActive = 'bg-primary text-white shadow-purpleGlow'
  const pillIdle = 'bg-dark-panel3 text-slate-400 border border-dark-border hover:bg-dark-panel hover:text-slate-200'

  return (
    <div className="flex flex-col">
      {/* Magic B-rolls / Magic Zooms — sticky at the top of the panel so
          they're always reachable while scrolling a long scene list,
          instead of scrolling out of view at the bottom. Regenerates a
          fresh AI edit pass for the whole video, rather than one scene's
          pill row at a time. */}
      <div className="sticky top-0 z-20 flex flex-col gap-2 border-b border-dark-border bg-dark-panel px-4 pb-3 pt-4 shadow-md shadow-black/20">
        {autoEditError && (
          <div className="rounded-xl border border-danger/30 bg-red-950/40 p-2.5 text-[11px] font-semibold text-danger">
            {autoEditError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={regenerateMagicBroll}
            disabled={isAutoEditingBroll}
            title="Get a fresh set of AI b-rolls — zooms are left as they are"
            className="flex items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/15 px-3 py-3 text-xs font-extrabold text-primary transition hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAutoEditingBroll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
            Magic B-rolls
          </button>
          <button
            type="button"
            onClick={regenerateMagicZoom}
            disabled={isAutoEditingZoom}
            title="Get a fresh set of AI zooms — b-rolls are left as they are"
            className="flex items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/15 px-3 py-3 text-xs font-extrabold text-primary transition hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAutoEditingZoom ? <Loader2 className="h-4 w-4 animate-spin" /> : <ZoomIn className="h-4 w-4" />}
            Magic Zooms
          </button>
        </div>
        <p className="flex items-center gap-1 px-0.5 text-[10px] text-slate-500">
          <Sparkles className="h-2.5 w-2.5" />
          Each button only refreshes its own effect — anything you placed by hand, or the other effect, stays put.
        </p>
      </div>

      <div className="flex flex-col p-4">
      {sceneList.map((scene, idx) => {
        const zoomActive = zoomItemsInRange(scene.start, scene.end).length > 0
        const speakerActive = speakerItemsInRange(scene.start, scene.end).length > 0
        const brollItems = brollItemsInRange(scene.start, scene.end)
        const sfxItems = sfxItemsInRange(scene.start, scene.end)
        const ctaItems = ctaItemsInRange(scene.start, scene.end)
        const hasBroll = brollItems.length > 0
        const hasSfx = sfxItems.length > 0
        const hasCta = ctaItems.length > 0
        const nothingLeftToAdd = hasBroll && hasSfx && hasCta

        const brollMenuOpen = openMenuKey === `${scene.id}:broll`
        const sfxMenuOpen = openMenuKey === `${scene.id}:sfx`
        const ctaMenuOpen = openMenuKey === `${scene.id}:cta`
        const addMenuOpen = openMenuKey === `${scene.id}:add`

        return (
          <div key={scene.id}>
            <div className="flex flex-col gap-3 rounded-2xl bg-dark-panel2 p-3.5 shadow-md shadow-black/30 border border-dark-border">
              {/* Header — time range on its own line, sentence text below */}
              <div className="flex flex-col gap-1">
                <span className="w-fit rounded-lg bg-dark-panel3 px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-500">
                  {scene.start.toFixed(1)}s – {scene.end.toFixed(1)}s
                </span>
                <p className="text-xs font-semibold leading-snug text-slate-200">
                  {scene.text}
                </p>
              </div>

              {/* Pill row — labeled icon+text chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Zoom — always-on simple toggle, no further config */}
                <button
                  type="button"
                  onClick={() => toggleZoomForScene(scene)}
                  title={zoomActive ? 'Remove zoom' : 'Add zoom'}
                  className={`${pillBase} ${zoomActive ? pillActive : pillIdle}`}
                >
                  <ZoomIn className="h-3 w-3" />
                  Zoom
                </button>

                {/* Speaker PiP — always-on simple toggle, mirrors the main
                    video's own footage in a corner bubble (see models.py) */}
                <button
                  type="button"
                  onClick={() => toggleSpeakerForScene(scene)}
                  title={speakerActive ? 'Remove speaker widget' : 'Add speaker widget'}
                  className={`${pillBase} ${speakerActive ? pillActive : pillIdle}`}
                >
                  <User className="h-3 w-3" />
                  Speaker
                </button>

                {/* B-roll — idle chip attaches directly; attached chip opens
                    Add New/Edit Transition/Delete */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => (hasBroll
                      ? setOpenMenuKey(brollMenuOpen ? null : `${scene.id}:broll`)
                      : openBrollLibraryForScene(scene))}
                    title={hasBroll ? 'B-roll attached' : 'Add b-roll'}
                    className={`${pillBase} ${hasBroll ? pillActive : pillIdle}`}
                  >
                    <Film className="h-3 w-3" />
                    B-roll
                    {hasBroll && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                  </button>
                  {brollMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={closeMenus} />
                      <div className="absolute left-0 top-8 z-50 flex w-44 flex-col overflow-hidden rounded-xl border border-dark-border bg-dark-panel3 shadow-modal">
                        <button
                          type="button"
                          onClick={() => addNewBroll(scene, brollItems)}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-dark-panel2 transition text-left"
                        >
                          <Plus className="h-3.5 w-3.5 text-primary" />
                          Add New B-roll
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTransitionItemId(brollItems[0].id)
                            closeMenus()
                          }}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-dark-panel2 transition text-left border-t border-dark-border"
                        >
                          <Wand2 className="h-3.5 w-3.5 text-primary" />
                          Edit Transition
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteItems(brollItems)}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-400 hover:bg-dark-panel2 transition text-left border-t border-dark-border"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete B-roll
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Sound — idle chip attaches directly; attached chip opens
                    Replace/Delete */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => (hasSfx
                      ? setOpenMenuKey(sfxMenuOpen ? null : `${scene.id}:sfx`)
                      : openSfxPickerForScene(scene))}
                    title={hasSfx ? 'Sound attached' : 'Add sound'}
                    className={`${pillBase} ${hasSfx ? pillActive : pillIdle}`}
                  >
                    <Music className="h-3 w-3" />
                    Sound
                    {hasSfx && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                  </button>
                  {sfxMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={closeMenus} />
                      <div className="absolute left-0 top-8 z-50 flex w-40 flex-col overflow-hidden rounded-xl border border-dark-border bg-dark-panel3 shadow-modal">
                        <button
                          type="button"
                          onClick={() => replaceSfx(scene, sfxItems)}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-dark-panel2 transition text-left"
                        >
                          <RefreshCw className="h-3.5 w-3.5 text-primary" />
                          Replace Sound
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteItems(sfxItems)}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-400 hover:bg-dark-panel2 transition text-left border-t border-dark-border"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete Sound
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* CTA — idle chip attaches directly; attached chip opens
                    Replace/Delete */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => (hasCta
                      ? setOpenMenuKey(ctaMenuOpen ? null : `${scene.id}:cta`)
                      : openCtaPickerForScene(scene))}
                    title={hasCta ? 'CTA attached' : 'Add CTA'}
                    className={`${pillBase} ${hasCta ? pillActive : pillIdle}`}
                  >
                    <MousePointerClick className="h-3 w-3" />
                    CTA
                    {hasCta && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                  </button>
                  {ctaMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={closeMenus} />
                      <div className="absolute left-0 top-8 z-50 flex w-40 flex-col overflow-hidden rounded-xl border border-dark-border bg-dark-panel3 shadow-modal">
                        <button
                          type="button"
                          onClick={() => replaceCta(scene, ctaItems)}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-dark-panel2 transition text-left"
                        >
                          <RefreshCw className="h-3.5 w-3.5 text-primary" />
                          Replace CTA
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteItems(ctaItems)}
                          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-400 hover:bg-dark-panel2 transition text-left border-t border-dark-border"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete CTA
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* "+" — catch-all menu for whichever of B-roll/Sound/CTA
                    isn't attached yet, kept alongside the pills above as a
                    single quick-add entry point (Zoom & Speaker already
                    have their own always-on toggles, so they're excluded). */}
                <div className="relative ml-auto">
                  <button
                    type="button"
                    onClick={() => setOpenMenuKey(addMenuOpen ? null : `${scene.id}:add`)}
                    title="Add to this scene"
                    className={`${pillBase} ${pillIdle} !px-2`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  {addMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={closeMenus} />
                      <div className="absolute right-0 top-8 z-50 flex w-44 flex-col overflow-hidden rounded-xl border border-dark-border bg-dark-panel3 shadow-modal">
                        {!hasBroll && (
                          <>
                            <div className="px-3 pt-2 pb-1 text-[9px] font-extrabold uppercase tracking-wider text-slate-500">Medias</div>
                            <button
                              type="button"
                              onClick={() => { openBrollLibraryForScene(scene); closeMenus() }}
                              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-dark-panel2 transition text-left"
                            >
                              <Film className="h-3.5 w-3.5 text-primary" />
                              B-roll
                            </button>
                          </>
                        )}
                        {!hasSfx && (
                          <>
                            <div className="px-3 pt-2 pb-1 text-[9px] font-extrabold uppercase tracking-wider text-slate-500 border-t border-dark-border">Effects</div>
                            <button
                              type="button"
                              onClick={() => { openSfxPickerForScene(scene); closeMenus() }}
                              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-dark-panel2 transition text-left"
                            >
                              <Music className="h-3.5 w-3.5 text-primary" />
                              Sound
                            </button>
                          </>
                        )}
                        {!hasCta && (
                          <>
                            <div className="px-3 pt-2 pb-1 text-[9px] font-extrabold uppercase tracking-wider text-slate-500 border-t border-dark-border">Widget</div>
                            <button
                              type="button"
                              onClick={() => { openCtaPickerForScene(scene); closeMenus() }}
                              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-dark-panel2 transition text-left"
                            >
                              <MousePointerClick className="h-3.5 w-3.5 text-primary" />
                              CTA
                            </button>
                          </>
                        )}
                        {nothingLeftToAdd && (
                          <div className="px-3 py-3 text-center text-[10px] text-slate-500">
                            Everything's added for this scene
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Divider between scenes — a thin line with a small scissors
                badge standing in for the cut between the two sentences */}
            {idx < sceneList.length - 1 && (
              <div className="flex items-center gap-2 py-2 px-1">
                <div className="h-px flex-1 bg-dark-border" />
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dark-border bg-dark-panel3 text-slate-500">
                  <Scissors className="h-2.5 w-2.5" />
                </div>
                <div className="h-px flex-1 bg-dark-border" />
              </div>
            )}
          </div>
        )
      })}
      </div>

      {transitionItem && (
        <RevealAnimationModal
          value={transitionItem.revealAnimation || 'slide_down'}
          onChange={(id) => updateItem(transitionItem.id, { revealAnimation: id })}
          layoutValue={transitionItem.layout || 'full'}
          onLayoutChange={(id) => updateItem(transitionItem.id, { layout: id })}
          onClose={() => setTransitionItemId(null)}
        />
      )}
    </div>
  )
}
