import { contextBridge, ipcRenderer } from 'electron'
import type { WarmupState } from '../shared/sessionWarmupContracts'
import type { AppSettings } from '../main/settingsCore'
import type { MangaDetail } from '../main/types'
import type { ReadingHistory, HistoryPositionContext, ReaderPagesReply } from '../shared/readerContracts'
import type { DownloadTaskRow, MangaDownloadGroup, DownloadProgress } from '../shared/downloadContracts'
import type { WorkspaceSnapshot } from '../shared/workspaceSnapshot'
import type { GraphicsStatus } from '../shared/graphicsContracts'
import type { PdfDownloadRequest, PdfTask } from '../shared/pdfContracts'
import type { DownloadTaskIdentity } from '../shared/downloadContracts'
import type { CommentReply, CommentPage } from '../shared/commentContracts'
import type { AccountReply, AccountState, LibraryQuery, OnlineLibraryPage, AlbumAccountState, AlbumMutation, AccountNotifications } from '../shared/accountContracts'
import type { CommentSubmission, DailyState, DailyResult, DailyMonth, AccountTask } from '../shared/accountContracts'

const taskCommand = (command: string, target: DownloadTaskIdentity | number, deleteFiles?: boolean) => {
  const task = typeof target === 'number' ? { kind: 'images', id: target } : target
  return task.kind === 'pdf' ? ipcRenderer.invoke('download:pdfCommand', command, task.id, deleteFiles)
    : ipcRenderer.invoke(`download:${command === 'folder' ? 'openTaskFolder' : command}`, task.id, deleteFiles)
}

const closeHandlers = new Set<() => Promise<void>>()
ipcRenderer.on('window:prepare-close', async (_event, id: string) => {
  try {
    await Promise.all([...closeHandlers].map((handler) => handler()))
    ipcRenderer.send('window:ready-close', id)
  } catch (error) { ipcRenderer.send('window:ready-close', id, String(error)) }
})

const api = {
  commentsGet: (albumId: string, page: number, refresh: boolean, requestId: string): Promise<CommentReply> => ipcRenderer.invoke('comments:get', { albumId, page, refresh, requestId }),
  commentsCancel: (requestId: string): Promise<void> => ipcRenderer.invoke('comments:cancel', requestId),
  accountState: (): Promise<AccountReply<AccountState>> => ipcRenderer.invoke('account:state'),
  accountLogin: (username: string, password: string, remember: boolean): Promise<AccountReply<AccountState>> => ipcRenderer.invoke('account:login', username, password, remember),
  accountLogout: (): Promise<AccountReply<AccountState>> => ipcRenderer.invoke('account:logout'),
  accountVerify: (generation: number): Promise<AccountReply<AccountState>> => ipcRenderer.invoke('account:verify', generation),
  accountLibrary: (query: LibraryQuery): Promise<AccountReply<OnlineLibraryPage>> => ipcRenderer.invoke('account:library', query),
  accountAlbum: (id: string, generation: number): Promise<AccountReply<AlbumAccountState>> => ipcRenderer.invoke('account:album', id, generation),
  accountMutate: (query: AlbumMutation): Promise<AccountReply<AlbumAccountState>> => ipcRenderer.invoke('account:mutate', query),
  accountNotifications: (generation: number): Promise<AccountReply<AccountNotifications>> => ipcRenderer.invoke('account:notifications', generation),
  accountNoticeRead: (id: string, generation: number, operationId: string): Promise<AccountReply<AccountNotifications>> => ipcRenderer.invoke('account:noticeRead', id, generation, operationId),
  accountMyComments: (page: number, generation: number): Promise<AccountReply<CommentPage>> => ipcRenderer.invoke('account:myComments', page, generation),
  accountPostComment: (query: CommentSubmission): Promise<AccountReply<{ status: 'sent' }>> => ipcRenderer.invoke('account:postComment', query),
  accountDaily: (generation: number): Promise<AccountReply<DailyState>> => ipcRenderer.invoke('account:daily', generation),
  accountCheckIn: (generation: number, operationId: string): Promise<AccountReply<DailyResult>> => ipcRenderer.invoke('account:checkIn', generation, operationId),
  accountDailyYears: (generation: number): Promise<AccountReply<string[]>> => ipcRenderer.invoke('account:dailyYears', generation),
  accountDailyHistory: (year: string, generation: number): Promise<AccountReply<DailyMonth[]>> => ipcRenderer.invoke('account:dailyHistory', year, generation),
  accountTasks: (generation: number): Promise<AccountReply<AccountTask[]>> => ipcRenderer.invoke('account:tasks', generation),
  onAccountChanged: (callback: (state: AccountState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: AccountState): void => callback(state)
    ipcRenderer.on('account:changed', handler)
    return () => { ipcRenderer.removeListener('account:changed', handler) }
  },
  onBeforeClose: (handler: () => Promise<void>) => {
    closeHandlers.add(handler)
    return () => { closeHandlers.delete(handler) }
  },
  onCloseCancelled: (handler: () => void) => {
    ipcRenderer.on('window:close-cancelled', handler)
    return () => { ipcRenderer.removeListener('window:close-cancelled', handler) }
  },
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


  // Network probe
  networkProbe: () => ipcRenderer.invoke('network:probe'),
  networkStatus: () => ipcRenderer.invoke('network:status'),
  networkApplyProxy: (enabled: boolean, url: string) =>
    ipcRenderer.invoke('network:applyProxy', enabled, url),

  // Settings
  settingsGet: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  workspaceGet: (): Promise<WorkspaceSnapshot | null> => ipcRenderer.invoke('workspace:get'),
  workspaceSet: (snapshot: WorkspaceSnapshot): Promise<void> => ipcRenderer.invoke('workspace:set', snapshot),
  graphicsGet: (): Promise<GraphicsStatus> => ipcRenderer.invoke('graphics:get'),
  graphicsSet: (enabled: boolean): Promise<GraphicsStatus> => ipcRenderer.invoke('graphics:set', enabled),
  onGraphicsChanged: (callback: (status: GraphicsStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: GraphicsStatus): void => callback(status)
    ipcRenderer.on('graphics:changed', handler)
    return () => { ipcRenderer.removeListener('graphics:changed', handler) }
  },
  appRestart: (): Promise<void> => ipcRenderer.invoke('app:restart'),
  settingsSet: (patch: Record<string, unknown>): Promise<AppSettings> => ipcRenderer.invoke('settings:set', patch),

  // Image loading
  imageClearCache: () => ipcRenderer.invoke('image:clearCache'),
  imageCacheSize: () => ipcRenderer.invoke('image:cacheSize'),
  cacheClearAll: () => ipcRenderer.invoke('cache:clearAll'),

  // Downloads
  downloadAdd: (data: Record<string, unknown>) => ipcRenderer.invoke('download:add', data),
  downloadAddChapters: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('download:addChapters', data),
  downloadPdfAdd: (data: PdfDownloadRequest): Promise<{ ok: boolean; taskId?: number; error?: string }> => ipcRenderer.invoke('download:pdfAdd', data),
  downloadPdfList: (): Promise<PdfTask[]> => ipcRenderer.invoke('download:pdfList'),
  downloadList: async (): Promise<Array<DownloadTaskRow | PdfTask>> => {
    const [images, pdf] = await Promise.all([ipcRenderer.invoke('download:list'), ipcRenderer.invoke('download:pdfList')])
    return [...images, ...pdf].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
  },
  downloadOpenPdf: (id: number) => taskCommand('open', { kind: 'pdf', id }),
  downloadSummary: (): Promise<MangaDownloadGroup[]> => ipcRenderer.invoke('download:summary'),
  downloadExportCbz: (selection: { mangaId?: string; taskId?: number }): Promise<{ ok?: boolean; canceled?: boolean; path?: string; pages?: number; error?: string }> => ipcRenderer.invoke('download:exportCbz', selection),
  downloadMangaDetail: (mangaId: string): Promise<MangaDownloadGroup | null> => ipcRenderer.invoke('download:mangaDetail', mangaId),
  downloadCancel: (task: DownloadTaskIdentity | number) => taskCommand('cancel', task),
  downloadRetry: (task: DownloadTaskIdentity | number) => taskCommand('retry', task),
  downloadRetryFailed: async () => {
    const image = await ipcRenderer.invoke('download:retryFailed')
    const pdf: PdfTask[] = await ipcRenderer.invoke('download:pdfList')
    let retried = image.retried ?? 0
    for (const task of pdf.filter(task => ['failed', 'cancelled'].includes(task.status))) {
      const result = await taskCommand('retry', { kind: 'pdf', id: task.id }); if (result.ok) retried++
    }
    return { ...image, retried }
  },
  downloadRemove: (task: DownloadTaskIdentity | number, deleteFiles: boolean) => taskCommand('remove', task, deleteFiles),
  downloadRemoveManga: (mangaId: string, deleteFiles: boolean) =>
    ipcRenderer.invoke('download:removeManga', mangaId, deleteFiles),
  downloadOpenTaskFolder: (task: DownloadTaskIdentity | number) => taskCommand('folder', task),
  downloadOpenMangaFolder: (mangaId: string) =>
    ipcRenderer.invoke('download:openMangaFolder', mangaId),
  downloadChapterPages: (mangaId: string, chapterIndex: number): Promise<ReaderPagesReply> =>
    ipcRenderer.invoke('download:chapterPages', mangaId, chapterIndex),
  downloadChooseDir: () => ipcRenderer.invoke('download:chooseDir'),
  downloadSetConcurrency: (n: number) => ipcRenderer.invoke('download:setConcurrency', n),

  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: DownloadProgress): void => callback(progress)
    ipcRenderer.on('download:progress', handler)
    return () => {
      ipcRenderer.removeListener('download:progress', handler)
    }
  },
  onDownloadAddStatus: (callback: (status: Record<string, unknown>) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: Record<string, unknown>): void => callback(status)
    ipcRenderer.on('download:addStatus', handler)
    return () => {
      ipcRenderer.removeListener('download:addStatus', handler)
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
  contentHomepageStream: (category?: string) => ipcRenderer.send('content:homepage:stream', category),
  contentHomepageCancel: (category?: string) => ipcRenderer.send('content:homepage:cancel', category),
  contentRecommendations: (tagOffset?: number) =>
    ipcRenderer.invoke('content:recommendations', tagOffset),
  onHomepageBatch: (callback: (payload: { category: string; cards: Record<string, unknown>[]; done: boolean; error?: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { category: string; cards: Record<string, unknown>[]; done: boolean; error?: string }): void =>
      callback(payload)
    ipcRenderer.on('content:homepage:batch', handler)
    return () => {
      ipcRenderer.removeListener('content:homepage:batch', handler)
    }
  },
  contentSearch: (query: string, page?: number, mainTag?: 0 | 1, category?: string, order?: string, time?: string) =>
    ipcRenderer.invoke('content:search', query, page, mainTag, category, order, time),
  contentCategory: (params: Record<string, unknown>) =>
    ipcRenderer.invoke('content:category', params),
  contentDetail: (mangaId: string): Promise<{ ok: boolean; data?: MangaDetail; error?: string }> => ipcRenderer.invoke('content:detail', mangaId),
  contentPages: (chapterUrl: string): Promise<ReaderPagesReply> => ipcRenderer.invoke('content:pages', chapterUrl),
  contentWarmupStatus: (): Promise<WarmupState> => ipcRenderer.invoke('session:warmupStatus'),
  contentWarmupRetry: (): Promise<WarmupState> => ipcRenderer.invoke('session:warmupRetry'),
  onWarmupStateChanged: (callback: (state: WarmupState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: WarmupState): void => callback(state)
    ipcRenderer.on('app:warmupStateChanged', handler)
    return () => {
      ipcRenderer.removeListener('app:warmupStateChanged', handler)
    }
  },

  // Local history
  historyUpsert: (data: ReadingHistory): Promise<void> => ipcRenderer.invoke('history:upsert', data),
  historyUpsertPage: (mangaId: string, pageIndex: number, context?: HistoryPositionContext): Promise<void> => ipcRenderer.invoke('history:upsertPage', mangaId, pageIndex, context),
  historyListLocal: (): Promise<ReadingHistory[]> => ipcRenderer.invoke('history:listLocal'),
  historyGetLocal: (mangaId: string): Promise<ReadingHistory | null> => ipcRenderer.invoke('history:getLocal', mangaId),
  historyRemoveLocal: (mangaId: string) => ipcRenderer.invoke('history:removeLocal', mangaId),
  historyClearLocal: () => ipcRenderer.invoke('history:clearLocal'),

  // Personal data (export / import / clear)
  personalDataExport: () => ipcRenderer.invoke('data:exportPersonal'),
  personalDataImport: () => ipcRenderer.invoke('data:importPersonal'),
  personalDataClear: () => ipcRenderer.invoke('data:clearPersonal'),

  // App info
  appVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Performance diagnostics
  performanceRecord: (event: unknown) => ipcRenderer.send('performance:record', event),
  performanceSnapshot: () => ipcRenderer.invoke('performance:snapshot'),
  performanceClear: () => ipcRenderer.invoke('performance:clear')
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
