/**
 * Electron main process — the desktop shell around the existing React UI
 * and FastAPI backend.
 *
 * Launch sequence:
 *   1. take the single-instance lock (two copies would fight over the same
 *      db.json and media directory)
 *   2. find a free localhost port
 *   3. spawn the packaged backend on it, telling it where the user's data,
 *      the built frontend and the bundled ffmpeg live
 *   4. poll GET /api/health until it answers — never a fixed sleep
 *   5. load http://127.0.0.1:<port>/ , which the backend serves the React
 *      build from, so every relative '/api/...' URL in the app keeps
 *      working with no origin rewriting and no CORS
 *   6. on quit, kill the backend process tree
 *
 * Three run modes, decided by how the process was started:
 *   packaged     files come from process.resourcesPath
 *   local-build  same layout, read out of the repo (npm run electron)
 *   dev          Vite dev server + a uvicorn the developer started
 *                themselves (npm run dev) — nothing is spawned here
 */
const { app, BrowserWindow, dialog, shell, ipcMain, Menu } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const net = require('net')
const path = require('path')

const APP_NAME = 'AI Video Editor'
const HOST = '127.0.0.1'
const HEALTH_TIMEOUT_MS = 90_000
const HEALTH_INTERVAL_MS = 300

const isPackaged = app.isPackaged
const devServerUrl = process.env.AIVE_DEV_SERVER_URL || ''
const MODE = isPackaged ? 'packaged' : devServerUrl ? 'dev' : 'local-build'

// Repo root when running unpackaged: electron/ -> <repo>
const repoRoot = path.resolve(__dirname, '..')
const resourcesRoot = isPackaged ? process.resourcesPath : repoRoot

let mainWindow = null
let splashWindow = null
let backendProc = null
let backendPort = 0
let shuttingDown = false
let logStream = null

// ---------------------------------------------------------------------------
// User data + logging
// ---------------------------------------------------------------------------

// LOCALAPPDATA rather than Electron's default roaming userData: this holds
// the user's source video, renders and cache, which must never be synced
// into a roaming Windows profile.
function resolveUserDataDir() {
  if (process.env.AIVE_DATA_DIR) return process.env.AIVE_DATA_DIR
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, APP_NAME)
  }
  return app.getPath('userData')
}

const userDataDir = resolveUserDataDir()
const logsDir = path.join(userDataDir, 'logs')

function initLogging() {
  try {
    fs.mkdirSync(logsDir, { recursive: true })
    const file = path.join(logsDir, 'electron.log')
    // Cheap rotation so a long-lived install doesn't grow an unbounded log.
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 5 * 1024 * 1024) {
        fs.renameSync(file, path.join(logsDir, 'electron.log.old'))
      }
    } catch (_) {}
    logStream = fs.createWriteStream(file, { flags: 'a' })
  } catch (err) {
    // Logging must never be the thing that stops the app from starting.
    logStream = null
  }
}

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`
  if (logStream) {
    try {
      logStream.write(line + '\n')
    } catch (_) {}
  }
  if (!isPackaged) console.log(line)
}

// ---------------------------------------------------------------------------
// Resource locations
// ---------------------------------------------------------------------------

function backendExecutable() {
  if (process.env.AIVE_BACKEND_EXE) return process.env.AIVE_BACKEND_EXE
  const exe = process.platform === 'win32' ? 'video-editor-backend.exe' : 'video-editor-backend'
  const candidates = isPackaged
    ? [path.join(resourcesRoot, 'backend', exe)]
    : [
        path.join(repoRoot, 'backend', 'dist', 'video-editor-backend', exe),
        path.join(repoRoot, 'resources', 'backend', exe),
      ]
  return candidates.find((p) => fs.existsSync(p)) || candidates[0]
}

function frontendDistDir() {
  const candidates = isPackaged
    ? [path.join(resourcesRoot, 'frontend')]
    : [path.join(repoRoot, 'frontend', 'dist')]
  return candidates.find((p) => fs.existsSync(path.join(p, 'index.html'))) || candidates[0]
}

function ffmpegDir() {
  if (process.env.AIVE_FFMPEG_DIR) return process.env.AIVE_FFMPEG_DIR
  return path.join(resourcesRoot, 'ffmpeg')
}

function ffmpegBinary(stem) {
  const name = process.platform === 'win32' ? `${stem}.exe` : stem
  const full = path.join(ffmpegDir(), name)
  return fs.existsSync(full) ? full : ''
}

// ---------------------------------------------------------------------------
// Port selection
// ---------------------------------------------------------------------------

/**
 * Ask the OS for a free loopback port rather than hard-coding 8000.
 *
 * A fixed port is a support burden nobody sees until it bites: another dev
 * server, a leftover process from a crash, or a second copy of this app
 * already owns it, and the editor simply refuses to open with no
 * explanation. Binding to port 0 hands back something guaranteed free.
 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, HOST, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

// ---------------------------------------------------------------------------
// Backend process
// ---------------------------------------------------------------------------

function startBackend(port) {
  const exe = backendExecutable()
  if (!fs.existsSync(exe)) {
    throw new Error(
      `The backend executable is missing.\n\nExpected it at:\n${exe}\n\n` +
        (isPackaged
          ? 'This install looks incomplete — reinstalling should fix it.'
          : 'Run "npm run build:backend" first.')
    )
  }

  const env = {
    ...process.env,
    AIVE_DATA_DIR: userDataDir,
    AIVE_FRONTEND_DIST: frontendDistDir(),
    AIVE_FFMPEG_DIR: ffmpegDir(),
    AIVE_LOG_FILE: path.join(logsDir, 'backend.log'),
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  }
  // Explicit binaries as well as the directory: the backend's own resolver
  // checks these first, so a bundled ffmpeg always beats whatever happens
  // to be on the user's PATH.
  const ff = ffmpegBinary('ffmpeg')
  const fp = ffmpegBinary('ffprobe')
  if (ff) env.FFMPEG_BINARY = ff
  if (fp) env.FFPROBE_BINARY = fp
  if (!ff) log('WARNING: no bundled ffmpeg found at', ffmpegDir())

  log(`starting backend: ${exe} --port ${port}`)
  const proc = spawn(exe, ['--host', HOST, '--port', String(port)], {
    cwd: path.dirname(exe),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  proc.stdout.on('data', (d) => log('[backend]', d.toString().trimEnd()))
  proc.stderr.on('data', (d) => log('[backend:err]', d.toString().trimEnd()))

  proc.on('exit', (code, signal) => {
    log(`backend exited code=${code} signal=${signal}`)
    backendProc = null
    if (shuttingDown) return
    // An exit before the window is up is reported by the health-check
    // timeout with a better message; after that, it means the editor just
    // lost its engine mid-session.
    if (mainWindow) {
      dialog.showMessageBoxSync({
        type: 'error',
        title: APP_NAME,
        message: 'The video engine stopped unexpectedly.',
        detail: `Anything already saved is safe.\n\nDetails are in:\n${path.join(logsDir, 'backend.log')}`,
        buttons: ['Close'],
      })
      shuttingDown = true
      app.quit()
    }
  })

  proc.on('error', (err) => log('backend spawn error:', err.message))
  return proc
}

function stopBackend() {
  if (!backendProc) return
  const proc = backendProc
  backendProc = null
  log('stopping backend pid', proc.pid)
  try {
    if (process.platform === 'win32') {
      // /T kills the whole tree: uvicorn may have an ffmpeg export running,
      // and an orphaned ffmpeg would keep writing to a file in the user's
      // data directory long after the app appeared to close.
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true })
    } else {
      proc.kill('SIGTERM')
      setTimeout(() => {
        try {
          proc.kill('SIGKILL')
        } catch (_) {}
      }, 3000)
    }
  } catch (err) {
    log('failed to stop backend:', err.message)
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

function pingHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: HOST, port, path: '/api/health', timeout: 2000 },
      (res) => {
        res.resume()
        resolve(res.statusCode === 200)
      }
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForBackend(port) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  let attempts = 0
  while (Date.now() < deadline) {
    if (await pingHealth(port)) {
      log(`backend ready after ${attempts} checks`)
      return true
    }
    attempts += 1
    if (MODE !== 'dev' && !backendProc) return false // it died; stop polling a corpse
    await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS))
  }
  return false
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

const SPLASH_HTML = `
<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%;background:#090C13;color:#F8FAFC;
    font:500 13px/1.5 "Segoe UI",system-ui,sans-serif;
    display:flex;align-items:center;justify-content:center;
    -webkit-user-select:none;user-select:none;overflow:hidden}
  .box{text-align:center}
  .mark{width:52px;height:52px;margin:0 auto 18px;border-radius:16px;
    background:linear-gradient(135deg,#8B5CF6,#7C3AED);
    display:flex;align-items:center;justify-content:center;
    font:900 22px/1 "Segoe UI",sans-serif;color:#fff;
    box-shadow:0 8px 32px rgba(124,58,237,.45)}
  h1{margin:0 0 6px;font-size:15px;font-weight:800;letter-spacing:-.01em}
  p{margin:0;font-size:12px;color:#64748B}
  .bar{margin:20px auto 0;width:180px;height:3px;border-radius:2px;
    background:#1E273C;overflow:hidden}
  .bar i{display:block;width:40%;height:100%;border-radius:2px;
    background:#7C3AED;animation:slide 1.1s ease-in-out infinite}
  @keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
</style>
<div class="box">
  <div class="mark">C</div>
  <h1>AI Video Editor</h1>
  <p id="status">Starting…</p>
  <div class="bar"><i></i></div>
</div>
<script>
  // The main process pushes progress text in through executeJavaScript.
  window.setStatus = (t) => { document.getElementById('status').textContent = t }
</script>`

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    resizable: false,
    center: true,
    show: true,
    backgroundColor: '#090C13',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(SPLASH_HTML))
  return splashWindow
}

function splashStatus(text) {
  log('status:', text)
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow
      .webContents.executeJavaScript(`window.setStatus && window.setStatus(${JSON.stringify(text)})`)
      .catch(() => {})
  }
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#090C13',
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      // Secure defaults: the renderer is the React app and has no business
      // touching fs, child_process or shell. Everything it legitimately
      // needs goes through the narrow preload bridge instead.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy()
    splashWindow = null
    mainWindow.show()
    mainWindow.maximize()
  })

  // External links (the "get a key" links in Settings, Pexels credits) open
  // in the user's real browser, never as a new frameless Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/i.test(target)) shell.openExternal(target)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault()
      if (/^https?:/i.test(target)) shell.openExternal(target)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.loadURL(url)
  if (!isPackaged) mainWindow.webContents.openDevTools({ mode: 'detach' })
  return mainWindow
}

function fatal(message, detail) {
  log('FATAL:', message, detail || '')
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy()
  splashWindow = null
  dialog.showMessageBoxSync({
    type: 'error',
    title: APP_NAME,
    message,
    detail: `${detail || ''}\n\nLog files:\n${logsDir}`.trim(),
    buttons: ['Close'],
  })
  shuttingDown = true
  app.quit()
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  initLogging()
  log(`--- ${APP_NAME} starting (mode=${MODE}, packaged=${isPackaged}) ---`)
  log('userDataDir =', userDataDir)

  createSplash()

  try {
    if (MODE === 'dev') {
      // The developer's own uvicorn owns the port; Vite proxies /api to it.
      backendPort = Number(process.env.AIVE_BACKEND_PORT || 8000)
      splashStatus('Waiting for the dev backend…')
      const ok = await waitForBackend(backendPort)
      if (!ok) {
        fatal(
          'Could not reach the development backend.',
          `Nothing answered http://${HOST}:${backendPort}/api/health.\n` +
            'Start it with: cd backend && venv\\Scripts\\activate && uvicorn app.main:app --port 8000'
        )
        return
      }
      splashStatus('Opening editor…')
      createMainWindow(devServerUrl)
      return
    }

    splashStatus('Starting local engine…')
    backendPort = await findFreePort()
    log('selected port', backendPort)

    backendProc = startBackend(backendPort)

    splashStatus('Warming up…')
    const ok = await waitForBackend(backendPort)
    if (!ok) {
      fatal(
        backendProc ? 'The video engine took too long to start.' : 'The video engine failed to start.',
        'This is almost always something the backend log explains in one line.'
      )
      return
    }

    splashStatus('Opening editor…')
    createMainWindow(`http://${HOST}:${backendPort}/`)
  } catch (err) {
    fatal('AI Video Editor could not start.', err.message)
  }
}

// A second launch (double-clicking the shortcut again) must focus the
// existing window rather than start a second backend against the same
// database and media directory.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    boot()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) boot()
    })
  })
}

app.on('window-all-closed', () => {
  shuttingDown = true
  stopBackend()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  shuttingDown = true
  stopBackend()
})

// Last resort: a hard exit still gets the tree-kill in.
process.on('exit', stopBackend)

// ---------------------------------------------------------------------------
// IPC exposed through preload.js
// ---------------------------------------------------------------------------
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  userDataDir,
  logsDir,
  backendPort,
}))
ipcMain.handle('app:openLogs', () => shell.openPath(logsDir))
ipcMain.handle('app:openDataDir', () => shell.openPath(userDataDir))
ipcMain.handle('app:openExternal', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) return shell.openExternal(url)
  return null
})
