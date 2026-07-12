import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { closeDatabase } from './database'
import { startPeriodicProbe } from './networkProbe'
import { warmupSession } from './sessionWarmup'
import { registerImageProtocol, registerImageScheme } from './imageProtocol'
import './imageLoader'
import './downloadManager'
import './contentApi'

let mainWindow: BrowserWindow | null = null

// 必须在 app.ready 之前注册自定义协议为 standard scheme，
// 否则 jmimg:// 的 URL 解析行为不确定，会导致图片加载失败。
registerImageScheme()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#00000000',
    transparent: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Windows 11 Mica material
  mainWindow.setBackgroundMaterial('mica')

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

app.whenReady().then(() => {
  registerIpcHandlers()
  registerImageProtocol()
  startPeriodicProbe()

  // Warm up session in background — bypass Cloudflare
  warmupSession().then(() => {
    // Send status update to renderer
    BrowserWindow.getAllWindows().forEach((w) => {
      w.webContents.send('app:warmupDone')
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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
