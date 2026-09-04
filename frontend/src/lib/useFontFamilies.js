import { useEffect, useState } from 'react'
import { getFontFamilies } from './captionLayout'

// The one place any React component gets "the list of font families the
// user can pick from" — backed entirely by backend/fonts/registry.json
// via getFontFamilies() (captionLayout.js), which itself just reads the
// cached GET /api/font-manifest response. This replaced two separate,
// hand-written FONTS arrays that used to live in Sidebar.jsx and
// StressHighlightModal.jsx (which could silently drift from what the
// registry/FFmpeg export actually has, and had to be edited by hand
// every time a font was added or removed).
//
// Adding or removing a family is now just editing registry.json (and
// its font file(s) under backend/fonts/<Family>/) — both dropdowns pick
// it up automatically the next time they load the manifest, with no
// component change.
//
// Falls back to ['Inter'] — the same hardcoded last-resort default
// family font_manager.py's resolution ladder ends at — so a dropdown
// never renders empty while the manifest is loading or if the fetch
// ever fails.
export default function useFontFamilies() {
  const [families, setFamilies] = useState(['Inter'])
  useEffect(() => {
    let cancelled = false
    getFontFamilies().then((list) => {
      if (!cancelled && list.length > 0) setFamilies(list)
    })
    return () => { cancelled = true }
  }, [])
  return families
}
