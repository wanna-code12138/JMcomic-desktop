import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean): void => callback(maximized)
    ipcRenderer.on('window:maximizeChange', handler)
    return () => {
      ipcRenderer.removeListener('window:maximizeChange', handler)
    }
  },

  // Database
  dbRun: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:run', sql, params),
  dbGet: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:get', sql, params),
  dbAll: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:all', sql, params),

  // Favorites
  favoritesAdd: (manga: { mangaId: string; title?: string; coverUrl?: string }) =>
    ipcRenderer.invoke('favorites:add', manga),
  favoritesRemove: (mangaId: string) => ipcRenderer.invoke('favorites:remove', mangaId),
  favoritesList: () => ipcRenderer.invoke('favorites:list'),

  // Auth
  authSave: (key: string, value: string) => ipcRenderer.invoke('auth:save', key, value),
  authGet: (key: string) => ipcRenderer.invoke('auth:get', key),

  // Cache
  cacheSetManga: (manga: Record<string, unknown>) => ipcRenderer.invoke('cache:setManga', manga),
  cacheGetManga: (id: string) => ipcRenderer.invoke('cache:getManga', id),

  // Network probe
  networkProbe: () => ipcRenderer.invoke('network:probe'),
  networkStatus: () => ipcRenderer.invoke('network:status'),
  networkSetProxy: (url: string | null) => ipcRenderer.invoke('network:setProxy', url),

  // HTTP (from main process to bypass CORS)
  httpGet: (url: string, options?: Record<string, unknown>) =>
    ipcRenderer.invoke('http:get', url, options),

  // Image loading
  imageLoad: (urls: string[], options?: Record<string, unknown>) =>
    ipcRenderer.invoke('image:load', urls, options),
  imagePreload: (url: string) => ipcRenderer.invoke('image:preload', url),
  imageClearCache: () => ipcRenderer.invoke('image:clearCache'),
  imageCacheSize: () => ipcRenderer.invoke('image:cacheSize'),
  cacheClearAll: () => ipcRenderer.invoke('cache:clearAll'),

  // Downloads
  downloadAdd: (data: Record<string, unknown>) => ipcRenderer.invoke('download:add', data),
  downloadList: () => ipcRenderer.invoke('download:list'),
  downloadCancel: (taskId: number) => ipcRenderer.invoke('download:cancel', taskId),
  downloadSetConcurrency: (n: number) => ipcRenderer.invoke('download:setConcurrency', n),

  onDownloadProgress: (callback: (progress: Record<string, unknown>) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: Record<string, unknown>): void => callback(progress)
    ipcRenderer.on('download:progress', handler)
    return () => {
      ipcRenderer.removeListener('download:progress', handler)
    }
  },

  // App events
  onWarmupDone: (callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('app:warmupDone', handler)
    return () => {
      ipcRenderer.removeListener('app:warmupDone', handler)
    }
  },

  // Content
  contentHomepage: () => ipcRenderer.invoke('content:homepage'),
  contentSearch: (query: string, page?: number) => ipcRenderer.invoke('content:search', query, page),
  contentDetail: (mangaId: string) => ipcRenderer.invoke('content:detail', mangaId),
  contentPages: (chapterUrl: string) => ipcRenderer.invoke('content:pages', chapterUrl),
  contentLogin: (username: string, password: string) => ipcRenderer.invoke('content:login', username, password),
  contentFavorites: (page?: number) => ipcRenderer.invoke('content:favorites', page),
  contentWarmupStatus: () => ipcRenderer.invoke('content:warmupStatus')
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
