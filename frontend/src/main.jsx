import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { preloadCoreFonts } from './lib/captionLayout'

// Loads Inter + Space Grotesk locally (from the same font files/registry
// FFmpeg's export reads — see caption_layout.py) instead of index.html's
// old Google Fonts <link>, so the app's own UI chrome — and every caption
// that uses these families — always resolves to the identical file. Fired
// once at startup, not awaited: the UI renders immediately with whatever
// font is available and swaps in as soon as each face finishes loading,
// the same as a normal @font-face would.
preloadCoreFonts()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
