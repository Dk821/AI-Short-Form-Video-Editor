/**
 * Preload bridge.
 *
 * The renderer is the existing React app: it talks to the backend over
 * HTTP and needs nothing from Node. So this exposes four narrow, non-
 * parameterised operations and nothing else — no fs, no child_process, no
 * shell, no ipcRenderer. A compromised page (or a malicious stock-video
 * thumbnail URL) gets no filesystem access from here.
 *
 * The app works with `window.desktop` absent, which is what keeps the
 * browser dev workflow identical.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  /** { version, platform, userDataDir, logsDir, backendPort } */
  getInfo: () => ipcRenderer.invoke('app:info'),
  /** Reveal the log folder in Explorer — for "send me the logs" support. */
  openLogs: () => ipcRenderer.invoke('app:openLogs'),
  /** Reveal the projects/media folder in Explorer. */
  openDataFolder: () => ipcRenderer.invoke('app:openDataDir'),
  /** Open an http(s) URL in the user's real browser. Anything else is refused. */
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
})
