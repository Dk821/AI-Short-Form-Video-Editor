// Caption typography client — the frontend half of the caption-parity
// architecture. This module used to independently RE-COMPUTE caption
// layout (Canvas measureText() for word widths, a hand-ported greedy
// wrap loop, its own font-fallback ladder against the font manifest).
// That "same algorithm, two engines" approach is exactly what this file
// no longer does: even fed identical font files, Canvas's text
// measurement and Pillow/FreeType's (backend/app/caption_layout.py) can
// disagree on glyph metrics, which meant Preview and the FFmpeg export
// could still wrap or position text differently.
//
// The fix: ONE canonical layout, computed once, server-side —
// backend/app/caption_layout.py's layout_caption(), the SAME function
// render.py's FFmpeg export calls in-process — exposed over
// POST /api/captions/layout. fetchCaptionLayout() below just posts the
// TimelineItem + canvas size and renders the response verbatim: no
// wrapping, no measurement, no fallback-ladder logic of any kind runs in
// the browser for captions any more.
import { api } from '../services/api'

// ---------------------------------------------------------------------
// Font manifest + (family, weight, style) fallback ladder — kept ONLY
// for preloadCoreFonts() below, which eagerly loads the app's general UI
// typefaces (Inter/Space Grotesk, used by Tailwind's font-display/
// font-body classes everywhere, not just captions). This ladder mirrors
// font_manager.py's resolve_font() so the UI's own chrome text resolves
// the same family/weight it would on export-adjacent surfaces, but it is
// NOT used for caption words any more — see ensureWordFontLoaded, which
// loads a caption word's font by the exact file path the canonical
// layout API already resolved, with no ladder of its own.
// ---------------------------------------------------------------------
const DEFAULT_FAMILY = 'Inter'
const DEFAULT_WEIGHT = 400
const DEFAULT_STYLE = 'normal'
const HARD_FALLBACK = { family: DEFAULT_FAMILY, weight: 400, style: 'normal', relPath: 'Inter/Inter_24pt-Regular.ttf' }

let manifestPromise = null
function getManifest() {
  if (!manifestPromise) {
    manifestPromise = api.getFontManifest().catch((err) => {
      console.warn('[captionLayout] could not load font manifest, UI chrome fonts will use the Inter fallback', err)
      return {}
    })
  }
  return manifestPromise
}

function snapWeight(available, requested) {
  return available.reduce((best, w) => (Math.abs(w - requested) < Math.abs(best - requested) ? w : best))
}

function resolveFontEntry(manifest, family, weight, style) {
  const reqFamily = (family || DEFAULT_FAMILY).trim()
  const reqWeight = weight ? Number(weight) : DEFAULT_WEIGHT
  const reqStyle = (style || DEFAULT_STYLE).toLowerCase()

  function tryFamily(fam, w, s) {
    const familyMap = manifest[fam]
    if (!familyMap || Object.keys(familyMap).length === 0) return null
    let resolvedWeight = w
    let styleMap = familyMap[String(w)]
    if (!styleMap) {
      const avail = Object.keys(familyMap).map(Number).filter((n) => !Number.isNaN(n))
      if (!avail.length) return null
      resolvedWeight = snapWeight(avail, w)
      styleMap = familyMap[String(resolvedWeight)]
    }
    if (!styleMap) return null
    const hasRequestedStyle = !!styleMap[s]
    const rel = styleMap[s] || styleMap.normal
    if (!rel) return null
    return { family: fam, weight: resolvedWeight, style: hasRequestedStyle ? s : 'normal', relPath: rel }
  }

  let entry = tryFamily(reqFamily, reqWeight, reqStyle)
  if (entry) return entry

  if (reqFamily !== DEFAULT_FAMILY) {
    entry = tryFamily(DEFAULT_FAMILY, reqWeight, reqStyle)
    if (entry) return entry
  }

  return HARD_FALLBACK
}

const facePromises = new Map() // key: `${family}|${weight}|${style}` -> Promise<entry>

function ensureFontLoaded(manifest, family, weight, style) {
  const entry = resolveFontEntry(manifest, family, weight, style)
  const key = `${entry.family}|${entry.weight}|${entry.style}`
  if (!facePromises.has(key)) {
    facePromises.set(key, (async () => {
      if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') {
        return entry
      }
      try {
        const url = api.fontFileUrl(entry.relPath)
        const face = new FontFace(entry.family, `url("${url}")`, {
          weight: String(entry.weight),
          style: entry.style,
        })
        await face.load()
        document.fonts.add(face)
      } catch (err) {
        console.warn('[captionLayout] UI font load failed, falling back to system font substitution', entry, err)
      }
      return entry
    })())
  }
  return facePromises.get(key)
}

// Eagerly loads the app's core UI typefaces at every weight the general
// chrome actually uses. Call this once at app startup (see main.jsx) —
// NOT for captions (those load on demand, per exact file, via
// ensureWordFontLoaded), but because removing index.html's Google Fonts
// <link> (so the app never depends on a CDN) would otherwise leave the
// whole app's text in the browser's system-font fallback until
// something else happened to load Inter first.
export async function preloadCoreFonts() {
  const manifest = await getManifest()
  const jobs = []
  for (const weight of [400, 500, 600, 700, 800, 900]) {
    jobs.push(ensureFontLoaded(manifest, 'Inter', weight, 'normal'))
  }
  for (const weight of [400, 500, 600, 700]) {
    jobs.push(ensureFontLoaded(manifest, 'Space Grotesk', weight, 'normal'))
  }
  await Promise.all(jobs)
}

// ---------------------------------------------------------------------
// Per-file caption font loading — keyed directly by the fontFile relPath
// the canonical layout API already resolved (font_manager.resolve_font_
// info(), called from caption_layout.resolve_words()). There is no
// (family, weight, style) ladder to run here: the backend ran the ONE
// fallback ladder and picked the exact file already, so this only has
// to load that file and hand back a CSS font-family token that can
// resolve to nothing else — no risk of the browser substituting a
// different weight/style than the one caption_layout.py measured
// against and render.py's FFmpeg export will draw with.
// ---------------------------------------------------------------------
const wordFacePromises = new Map() // relPath -> Promise<cssFamily>

function familyTokenForFile(relPath) {
  // Uniqueness, not prettiness — this name is never shown to the user,
  // only used as the fontFamily value on a caption word's own <span>.
  return `cap-font-${relPath.replace(/[^a-zA-Z0-9]+/g, '-')}`
}

function ensureWordFontLoaded(relPath) {
  if (!wordFacePromises.has(relPath)) {
    wordFacePromises.set(relPath, (async () => {
      const family = familyTokenForFile(relPath)
      if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined') {
        return family
      }
      try {
        const url = api.fontFileUrl(relPath)
        // Always registered as weight 400 / style normal: the actual
        // boldness/italic-ness comes from WHICH FILE was loaded (e.g.
        // Montserrat-800.ttf), never from a CSS weight/style descriptor
        // asking the browser to pick or synthesize a different face —
        // there is exactly one file behind this family name, so there
        // is nothing left to disambiguate.
        const face = new FontFace(family, `url("${url}")`, { weight: '400', style: 'normal' })
        await face.load()
        document.fonts.add(face)
      } catch (err) {
        console.warn('[captionLayout] caption font file failed to load, falling back to system font substitution', relPath, err)
      }
      return family
    })())
  }
  return wordFacePromises.get(relPath)
}

// ---------------------------------------------------------------------
// fetchCaptionLayout — THE canonical caption layout call. Posts the
// exact TimelineItem + canvas size to POST /api/captions/layout
// (backend/app/routers/captions.py -> caption_layout.layout_caption()),
// then resolves every distinct fontFile the response references into a
// loaded FontFace before returning, so VideoPreview.jsx can render the
// geometry immediately with the right font already available — no
// re-measurement, no re-wrapping, no independent font-fallback decision
// of any kind on this side.
// ---------------------------------------------------------------------
export async function fetchCaptionLayout(item, canvasWidth, canvasHeight) {
  const layout = await api.getCaptionLayout(item, canvasWidth, canvasHeight)

  const relPaths = new Set()
  for (const line of layout.lines) {
    for (const w of line.words) relPaths.add(w.fontFile)
  }
  const familyByRelPath = new Map()
  await Promise.all(
    Array.from(relPaths).map(async (relPath) => {
      familyByRelPath.set(relPath, await ensureWordFontLoaded(relPath))
    })
  )

  for (const line of layout.lines) {
    for (const w of line.words) {
      w.cssFamily = familyByRelPath.get(w.fontFile) || familyTokenForFile(w.fontFile)
    }
  }
  return layout
}

// ---------------------------------------------------------------------
// resolveOverlayFont — for non-caption text overlays (currently: the CTA
// pill in VideoPreview.jsx) that need to render with the SAME physical
// font file backend/app/render.py's resolve_font(family, weight, style)
// will resolve to for that item, instead of a generic CSS font-family
// name the browser could substitute a different weight/style for.
//
// Reuses the exact same resolution ladder (resolveFontEntry, mirroring
// font_manager.py's _resolve()) and the exact same per-file FontFace
// loading (ensureWordFontLoaded) that caption words already use — this
// does not add a second font system, it just gives one more caller
// access to the existing one.
// ---------------------------------------------------------------------
export async function resolveOverlayFont(family, weight, style) {
  const manifest = await getManifest()
  const entry = resolveFontEntry(manifest, family, weight, style)
  const cssFamily = await ensureWordFontLoaded(entry.relPath)
  return { cssFamily, family: entry.family, weight: entry.weight, style: entry.style, relPath: entry.relPath }
}

// ---------------------------------------------------------------------
// getFontFamilies — THE single source of truth for "what font families
// exist", for any UI that needs to list them (currently: Sidebar.jsx's
// caption font picker and StressHighlightModal.jsx's stress-word font
// picker). Derived from the exact same cached font-manifest fetch
// (getManifest()) that every other font decision in this module already
// reads — which is itself just backend/fonts/registry.json, served
// verbatim by GET /api/font-manifest (see backend/app/routers/fonts.py).
//
// There is deliberately no separate, hand-written family list anywhere
// in the frontend any more: adding a family to registry.json (with its
// font file(s) under backend/fonts/<Family>/) is enough to make it show
// up here, and therefore in both dropdowns, with no component change.
// ---------------------------------------------------------------------
export async function getFontFamilies() {
  const manifest = await getManifest()
  return Object.keys(manifest)
}
