import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { closeDatabase } from './database'
import { startPeriodicProbe, applyManualProxy } from './networkProbe'
import { warmupSession } from './sessionWarmup'
import { registerImageProtocol, registerImageScheme } from './imageProtocol'
import { setImageCacheLimit } from './imageLoader'
import { getSettings } from './settingsStore'
import type { AppSettings } from './settingsCore'
import { applyWindowBackground, backgroundMaterialFor, windowBackgroundColorFor } from './windowChrome'
import './downloadManager'
import './contentApi'

let mainWindow: BrowserWindow | null = null

// 必须在 app.ready 之前注册自定义协议为 standard scheme，
// 否则 jmimg:// 的 URL 解析行为不确定，会导致图片加载失败。
registerImageScheme()

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
  registerImageProtocol()
  startPeriodicProbe()

  const settings = await getSettings()
  setImageCacheLimit(settings.cacheLimitMb * 1024 * 1024)

  createWindow(settings)
  applyWindowBackground(settings)
  await applyManualProxy(settings.proxyEnabled, settings.proxyUrl)

  // Warm up session in background — bypass Cloudflare
  // 主窗口必须先创建，warmup 会把验证视图内嵌到主窗口内容区
  if (mainWindow) {
    warmupSession(mainWindow).then(() => {
      // Send status update to renderer
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send('app:warmupDone')
      })
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      getSettings().then((s) => createWindow(s))
    }
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

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
