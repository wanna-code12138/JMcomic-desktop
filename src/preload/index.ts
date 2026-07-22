import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  windowSetCaptionTheme: (dark: boolean) => ipcRenderer.invoke('window:setCaptionTheme', dark),

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

  // Search history
  searchHistoryAdd: (query: string) => ipcRenderer.invoke('searchHistory:add', query),
  searchHistoryList: () => ipcRenderer.invoke('searchHistory:list'),
  searchHistoryRemove: (query: string) => ipcRenderer.invoke('searchHistory:remove', query),
  searchHistoryClear: () => ipcRenderer.invoke('searchHistory:clear'),

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
  contentHomepage: (category?: string) => ipcRenderer.invoke('content:homepage', category),
  contentSearch: (query: string, page?: number, mainTag?: 0 | 1, category?: string, order?: string, time?: string) =>
    ipcRenderer.invoke('content:search', query, page, mainTag, category, order, time),
  contentCategory: (params: Record<string, unknown>) =>
    ipcRenderer.invoke('content:category', params),
  contentDetail: (mangaId: string) => ipcRenderer.invoke('content:detail', mangaId),
  contentPages: (chapterUrl: string) => ipcRenderer.invoke('content:pages', chapterUrl),
  contentWarmupStatus: () => ipcRenderer.invoke('content:warmupStatus'),

  // Local history
  historyUpsert: (data: Record<string, unknown>) => ipcRenderer.invoke('history:upsert', data),
  historyUpsertPage: (mangaId: string, pageIndex: number) => ipcRenderer.invoke('history:upsertPage', mangaId, pageIndex),
  historyListLocal: () => ipcRenderer.invoke('history:listLocal'),
  historyGetLocal: (mangaId: string) => ipcRenderer.invoke('history:getLocal', mangaId),
  historyRemoveLocal: (mangaId: string) => ipcRenderer.invoke('history:removeLocal', mangaId),
  historyClearLocal: () => ipcRenderer.invoke('history:clearLocal')
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
