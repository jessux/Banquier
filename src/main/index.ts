import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { initDatabase } from './database'
import { getActiveDbPath } from './profiles'
import { registerIpcHandlers } from './ipc'
import { startMobileServer, stopMobileServer } from './mobile-server'
import { initAutoUpdater } from './updater'
import type { Settings } from '../shared/types'

let mainWindow: BrowserWindow | null = null

// Keep proxy-aware behavior enabled at runtime as well.
if (!process.env.ELECTRON_GET_USE_PROXY) {
  process.env.ELECTRON_GET_USE_PROXY = 'true'
}
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

// Configure Chromium proxy and SSL for net.fetch (used in llm.ts).
// Must be called before app.whenReady().
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
if (proxyUrl) {
  const proxyHost = proxyUrl.replace(/^https?:\/\//, '')
  app.commandLine.appendSwitch('proxy-server', proxyHost)
  console.log(`[proxy] Chromium proxy set to ${proxyHost}`)
}
// Corporate proxies use self-signed certs — disable verification for internal network
app.commandLine.appendSwitch('ignore-certificate-errors')

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Banquier',
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.banquier.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDatabase(getActiveDbPath())
  registerIpcHandlers()
  createWindow()

  // Mise à jour automatique via GitHub Releases (prod uniquement).
  if (!is.dev) {
    initAutoUpdater(() => mainWindow)
  }

  const store = new Store<{ settings: Settings }>()
  const settings = store.get('settings') as Settings | undefined
  if (settings?.mobileServerEnabled) {
    startMobileServer(() => store.get('settings') as Settings).catch(console.error)
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopMobileServer().finally(() => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
})
