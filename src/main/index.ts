import { app, BrowserWindow, dialog, shell, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { registerPerformanceDiagnosticsIpc } from './performanceDiagnosticsIpc'
import { closeDatabase, getDatabaseRecoveryNotice } from './database'
import { startPeriodicProbe, applyManualProxy } from './networkProbe'
import { registerImageProtocol, registerImageScheme } from './imageProtocol'
import { registerLocalImageProtocol, registerLocalImageScheme } from './localImageProtocol'
import { setImageCacheLimit } from './imageLoader'
import { getSettings } from './settingsStore'
import type { AppSettings } from './settingsCore'
import { applyWindowBackground, backgroundMaterialFor, windowBackgroundColorFor } from './windowChrome'
import './downloadManager'
import { initDownloadManager, stopDownloadManager, resumeDownloadManager } from './downloadManager'
import { createShutdownController } from './shutdownController'
import { registerDownloadExport, stopDownloadExports, resumeDownloadExports } from './downloadExport'
import { warmAnonymousContentProvider } from './contentApi'
import { warmupSession } from './sessionWarmup'

let mainWindow: BrowserWindow | null = null
let shutdownComplete = false
let shutdownRunning = false

function saveRendererBeforeClose(): Promise<void> {
  const contents = mainWindow?.webContents
  if (!contents || contents.isDestroyed()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const cleanup = (): void => { clearTimeout(timer); ipcMain.removeListener('window:ready-close', ready) }
    const ready = (event: Electron.IpcMainEvent, requestId: string, error?: string): void => {
      if (event.sender !== contents || requestId !== id) return
      cleanup()
      if (error) reject(new Error(error)); else resolve()
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('阅读器尚未完成保存，请稍后重试关闭')) }, 5000)
    ipcMain.on('window:ready-close', ready)
    contents.send('window:prepare-close', id)
  })
}

const shutdown = createShutdownController({ saveRenderer: saveRendererBeforeClose,
  stopWork: async () => { await Promise.all([stopDownloadManager(), stopDownloadExports()]) }, closeDatabase: () => closeDatabase(5000),
  resumeWork: () => { resumeDownloadExports(); resumeDownloadManager() } })

// 必须在 app.ready 之前注册自定义协议为 standard scheme，
// 否则 jmimg:// 的 URL 解析行为不确定，会导致图片加载失败。
registerImageScheme()
registerLocalImageScheme()

// Windows 11 caption overlay 配色 —— 跟随应用主题切换
// color 用透明，让 Mica 材质透过原生 caption 按钮区显示（与标题栏融为一体）；
// symbolColor 取自 Fluent UI v9 tokens（colorNeutralForeground1）
const CAPTION_LIGHT = { color: '#00000000', symbolColor: '#242424', height: 32 }
const CAPTION_DARK = { color: '#00000000', symbolColor: '#ffffff', height: 32 }

function applyCaptionTheme(dark: boolean): void {
  mainWindow?.setTitleBarOverlay(dark ? CAPTION_DARK : CAPTION_LIGHT)
}

function createWindow(settings: AppSettings): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    icon: join(__dirname, '../../build/icons/icon-256.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: CAPTION_LIGHT,
    backgroundColor: windowBackgroundColorFor(settings),
    backgroundMaterial: backgroundMaterialFor(settings),
    // 不设 transparent: true —— 该选项会强制分层合成路径，禁用 DWM 的
    // Win11 圆角与 Snap 拖拽预览。Mica 由 setBackgroundMaterial 提供。
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })
  mainWindow.on('close', (event) => {
    if (!shutdownComplete) { event.preventDefault(); app.quit() }
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximizeChange', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximizeChange', false)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Dev or production
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers()
  registerDownloadExport()
  registerPerformanceDiagnosticsIpc()
  registerImageProtocol()
  registerLocalImageProtocol()
  startPeriodicProbe()

  const settings = await getSettings()
  setImageCacheLimit(settings.cacheLimitMb * 1024 * 1024)
  await applyManualProxy(settings.proxyEnabled, settings.proxyUrl)

  createWindow(settings)
  if (mainWindow) void warmupSession(mainWindow).catch(error => console.error('[startup] verification failed:', error))
  const recoveryNotice = getDatabaseRecoveryNotice()
  if (recoveryNotice) void dialog.showMessageBox({ type: 'info', title: '个人数据已恢复', message: recoveryNotice })
  applyWindowBackground(settings)
  // Verification starts with the window; local task recovery remains independent.
  void warmAnonymousContentProvider()
  initDownloadManager()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      getSettings().then((s) => createWindow(s))
    }
  })
}).catch((error) => {
  dialog.showErrorBox('无法读取个人数据', error instanceof Error ? error.message : String(error))
  app.exit(1)
})

app.on('before-quit', (event) => {
  if (shutdownComplete) return
  event.preventDefault()
  if (shutdownRunning) return
  shutdownRunning = true
  void shutdown.prepare().then(() => { shutdownComplete = true; app.quit() }).catch((error) => {
    shutdownRunning = false
    mainWindow?.webContents.send('window:close-cancelled')
    void dialog.showMessageBox({ type: 'error', title: '尚未完成保存', message: String(error), detail: '窗口已保留，请检查磁盘空间后重新关闭。' })
  })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// Window control IPC
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.handle('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized())
ipcMain.handle('window:setCaptionTheme', (_event, dark: boolean) => {
  applyCaptionTheme(Boolean(dark))
})
