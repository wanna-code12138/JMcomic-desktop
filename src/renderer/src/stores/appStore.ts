import { create } from 'zustand'
import type { ReaderPosition, ReaderState } from '../../../shared/readerContracts'

import { applyReaderAction, type ReaderAction, type ReaderTab, type ClosedReaderTab } from '../reader/readerWorkspaceModel'
import type { WorkspaceSnapshot } from '../../../shared/workspaceSnapshot'
type ReaderSave = (leaving: boolean) => Promise<ReaderPosition | undefined>
const readerSavers = new Map<string, ReaderSave>()
let readerQueue: Promise<unknown> = Promise.resolve()
let pendingTransitions = 0
let failedGeneration = 0
let failedAction: ReaderAction | undefined
let workspaceWriter: ((snapshot: WorkspaceSnapshot) => Promise<void>) | undefined

function transitionReader(action: ReaderAction): Promise<boolean> {
  if (useAppStore.getState().readerClosing && action.type !== 'flush') return Promise.resolve(false)
  const generation = failedGeneration
  pendingTransitions++
  useAppStore.setState({ readerTransitionPending: true })
  const result = readerQueue.then(async () => {
    if (generation !== failedGeneration) return false
    const state = useAppStore.getState()
    const active = state.readerTabs.find(tab => tab.id === state.activeReaderId)
    const planned = applyReaderAction(state, action)
    if (planned.readerTabs.length > 100) {
      useAppStore.setState({ readerTransitionError: '最多同时打开 100 个标签，请先关闭一些标签再试。' })
      return false
    }
    const nextActive = planned.readerTabs.find(tab => tab.id === planned.activeReaderId)
    const leaving = active?.id !== nextActive?.id || active?.reader !== nextActive?.reader
    try {
      const anchor = active?.kind === 'book' && (leaving || action.type === 'flush')
        ? await readerSavers.get(active.id)?.(leaving || state.readerClosing) : undefined
      if (action.type === 'flush') {
        const tabs = anchor ? state.readerTabs.map(tab => tab.id === active?.id && tab.kind === 'book' ? {
          ...tab, reader: { ...tab.reader, resumePageIndex: anchor.pageIndex, resumePageOffset: anchor.pageOffset }
        } : tab) : state.readerTabs
        await workspaceWriter?.({ version: 1, tabs, activeId: state.activeReaderId })
        failedAction = undefined
        useAppStore.setState({ readerTransitionError: '' })
        return true
      }
      const fresh = useAppStore.getState()
      const tabs = anchor ? fresh.readerTabs.map(tab => tab.id === active?.id && tab.kind === 'book' ? {
        ...tab, reader: { ...tab.reader, resumePageIndex: anchor.pageIndex, resumePageOffset: anchor.pageOffset }
      } : tab) : fresh.readerTabs
      const next = applyReaderAction({ ...fresh, readerTabs: tabs }, action)
      const show = ['open', 'activate', 'new', 'reopen'].includes(action.type)
      const visible = next.readerTabs.length > 0 && (show || fresh.readerVisible)
      const autoCollapse = next.readerTabs.length > 0 && (!fresh.readerTabs.length || fresh.readerAutoCollapse)
      failedAction = undefined
      useAppStore.setState({ ...next, readerTransitionError: '', readerVisible: visible, readerAutoCollapse: autoCollapse,
        readerSidebarCollapsed: fresh.navigationCollapsed || (visible && autoCollapse),
        ...(!next.readerTabs.length ? { readerExpanded: false } : {}) })
      return true
    } catch {
      failedGeneration++
      failedAction = action
      useAppStore.setState({ readerTransitionError: '阅读位置或偏好保存失败，请检查磁盘空间后重试。' })
      return false
    }
  }).finally(() => {
    pendingTransitions--
    useAppStore.setState({ readerTransitionPending: pendingTransitions > 0 })
  })
  readerQueue = result
  return result
}

interface PendingSearch {
  query: string
  mainTag: 0 | 1
}

type ThemeMode = 'system' | 'light' | 'dark'

interface AppState {
  themeMode: ThemeMode
  darkMode: boolean
  currentPage: string
  previousPage: string
  detailSource: 'web' | 'local'
  favoritesTab: string
  currentMangaId: string | null
  readerTabs: ReaderTab[]
  closedReaderTabs: ClosedReaderTab[]
  activeReaderId: string | null
  readerExpanded: boolean
  readerVisible: boolean
  readerToolsVisible: boolean
  readerTransitionPending: boolean
  readerTransitionError: string
  readerClosing: boolean
  networkStatus: 'online' | 'degraded' | 'offline'
  micaEnabled: boolean
  solidWindow: boolean
  animationsEnabled: boolean
  restoreReaderWorkspace: boolean
  browseRatio: number
  workspaceStorageError: string
  pendingSearch: PendingSearch | null
  recommendationRevision: number
  readerSidebarCollapsed: boolean
  navigationCollapsed: boolean
  readerAutoCollapse: boolean
  setReaderSidebarCollapsed: (collapsed: boolean) => void
  setThemeMode: (mode: ThemeMode) => void
  setDarkMode: (dark: boolean) => void
  toggleDarkMode: () => void
  setCurrentPage: (page: string) => void
  setCurrentMangaId: (id: string | null) => void
  setCurrentLocalMangaId: (id: string) => void
  openReader: (state: ReaderState) => Promise<boolean>
  activateReader: (id: string) => Promise<boolean>
  closeReader: (id?: string) => Promise<boolean>
  newReaderTab: () => Promise<boolean>
  renameReaderTab: (id: string, title: string) => Promise<boolean>
  pinReaderTab: (id: string, pinned: boolean) => Promise<boolean>
  moveReaderTab: (id: string, index: number) => Promise<boolean>
  closeReaderTabs: (scope: 'others' | 'right' | 'all', id?: string) => Promise<boolean>
  reopenReaderTab: (id?: string) => Promise<boolean>
  registerReaderSession: (id: string, save: ReaderSave) => () => void
  registerWorkspacePersistence: (write: (snapshot: WorkspaceSnapshot) => Promise<void>) => () => void
  retryReaderTransition: () => Promise<boolean>
  flushReaderWorkspace: () => Promise<void>
  cancelReaderClose: () => void
  setReaderExpanded: (expanded: boolean) => void
  setReaderVisible: (visible: boolean) => void
  setReaderToolsVisible: (visible: boolean) => void
  setFavoritesTab: (tab: string) => void
  setNetworkStatus: (status: 'online' | 'degraded' | 'offline') => void
  setMicaEnabled: (enabled: boolean) => void
  setSolidWindow: (solid: boolean) => void
  triggerTagSearch: (tag: string) => void
  clearPendingSearch: () => void
  bumpRecommendationRevision: () => void
}

const systemDark =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

export const useAppStore = create<AppState>((set, get) => ({
  themeMode: 'system',
  darkMode: systemDark,
  currentPage: 'home',
  previousPage: 'home',
  detailSource: 'web',
  favoritesTab: 'local-fav',
  currentMangaId: null,
  readerTabs: [],
  closedReaderTabs: [],
  activeReaderId: null,
  readerExpanded: false,
  readerVisible: false,
  readerToolsVisible: false,
  readerTransitionPending: false,
  readerTransitionError: '',
  readerClosing: false,
  networkStatus: 'online',
  micaEnabled: true,
  solidWindow: false,
  animationsEnabled: true,
  restoreReaderWorkspace: false,
  browseRatio: 0.4,
  workspaceStorageError: '',
  pendingSearch: null,
  recommendationRevision: 0,
  readerSidebarCollapsed: false,
  navigationCollapsed: false,
  readerAutoCollapse: false,
  setReaderSidebarCollapsed: (collapsed) => set({ readerSidebarCollapsed: collapsed, navigationCollapsed: collapsed, readerAutoCollapse: false }),
  setThemeMode: (mode) => {
    const dark =
      mode === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : mode === 'dark'
    set({ themeMode: mode, darkMode: dark })
  },
  setDarkMode: (dark) => set({ darkMode: dark, themeMode: dark ? 'dark' : 'light' }),
  toggleDarkMode: () => {
    const next = !get().darkMode
    set({ darkMode: next, themeMode: next ? 'dark' : 'light' })
  },
  setCurrentPage: (page) =>
    set((state) => ({ currentPage: page, currentMangaId: page === 'detail' ? state.currentMangaId : null })),
  setCurrentMangaId: (id) =>
    set((s) => ({
      currentMangaId: id,
      detailSource: 'web',
      currentPage: id ? 'detail' : s.currentPage,
      previousPage:
        id && s.currentPage !== 'detail'
          ? s.currentPage
          : s.previousPage
    })),
  setCurrentLocalMangaId: (id) =>
    set((s) => ({
      currentMangaId: id,
      detailSource: 'local',
      currentPage: 'detail',
      previousPage:
        s.currentPage !== 'detail'
          ? s.currentPage
          : s.previousPage
    })),
  openReader: (reader) => transitionReader({ type: 'open', reader }),
  activateReader: (id) => transitionReader({ type: 'activate', id }),
  closeReader: (id) => transitionReader({ type: 'close', id: id ?? get().activeReaderId ?? '' }),
  newReaderTab: () => transitionReader({ type: 'new', id: `start:${crypto.randomUUID()}` }),
  renameReaderTab: (id, title) => transitionReader({ type: 'rename', id, title }),
  pinReaderTab: (id, pinned) => transitionReader({ type: 'pin', id, pinned }),
  moveReaderTab: (id, index) => transitionReader({ type: 'move', id, index }),
  closeReaderTabs: (scope, id) => transitionReader({ type: 'batch', scope, id: id ?? get().activeReaderId ?? '' }),
  reopenReaderTab: (id) => transitionReader({ type: 'reopen', id }),
  setReaderExpanded: (expanded) => set({ readerExpanded: expanded && get().readerTabs.length > 0,
    ...(expanded && get().readerTabs.length ? { readerVisible: true } : {}) }),
  setReaderVisible: (visible) => set({ readerVisible: visible && get().readerTabs.length > 0,
    readerSidebarCollapsed: get().navigationCollapsed || (visible && get().readerTabs.length > 0 && get().readerAutoCollapse),
    ...(!visible ? { readerExpanded: false } : {}) }),
  setReaderToolsVisible: (visible) => set({ readerToolsVisible: visible }),
  registerReaderSession: (id, save) => {
    readerSavers.set(id, save)
    return () => { if (readerSavers.get(id) === save) readerSavers.delete(id) }
  },
  registerWorkspacePersistence: (write) => {
    workspaceWriter = write
    return () => { if (workspaceWriter === write) workspaceWriter = undefined }
  },
  retryReaderTransition: () => failedAction ? transitionReader(failedAction) : Promise.resolve(true),
  flushReaderWorkspace: async () => {
    set({ readerClosing: true })
    if (!await transitionReader({ type: 'flush' })) {
      set({ readerClosing: false })
      throw new Error(get().readerTransitionError || '阅读位置保存失败')
    }
  },
  cancelReaderClose: () => set({ readerClosing: false }),
  setFavoritesTab: (tab) => set({ favoritesTab: tab }),
  setNetworkStatus: (status) => set({ networkStatus: status }),
  setMicaEnabled: (enabled) => set({ micaEnabled: enabled }),
  setSolidWindow: (solid) => set({ solidWindow: solid }),
  triggerTagSearch: (tag) =>
    set({
      pendingSearch: { query: tag, mainTag: 0 },
      currentPage: 'search'
    }),
  clearPendingSearch: () => set({ pendingSearch: null }),
  bumpRecommendationRevision: () => set((state) => ({ recommendationRevision: state.recommendationRevision + 1 }))
}))

export function initSystemThemeListener(): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (e: MediaQueryListEvent): void => {
    if (useAppStore.getState().themeMode === 'system') {
      useAppStore.setState({ darkMode: e.matches })
    }
  }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
