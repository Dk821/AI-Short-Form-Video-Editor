/**
 * Launch Electron against the Vite dev server.
 *
 * Setting AIVE_DEV_SERVER_URL is what puts electron/main.js into "dev"
 * mode: it spawns no backend of its own (the developer's uvicorn owns port
 * 8000, and Vite proxies /api to it), waits for that backend's health
 * endpoint, then loads the Vite URL so hot reload still works.
 *
 * A tiny node script instead of a cross-env dependency, because `VAR=x cmd`
 * is not valid in cmd.exe or PowerShell and this repo targets Windows.
 */
const { spawn } = require('child_process')
const path = require('path')

const electron = require('electron')
const repoRoot = path.resolve(__dirname, '..')

const child = spawn(electron, [repoRoot], {
  stdio: 'inherit',
  env: {
    ...process.env,
    AIVE_DEV_SERVER_URL: process.env.AIVE_DEV_SERVER_URL || 'http://localhost:5173',
    AIVE_BACKEND_PORT: process.env.AIVE_BACKEND_PORT || '8000',
  },
})

child.on('close', (code) => process.exit(code ?? 0))
