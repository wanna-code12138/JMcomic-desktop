import { create } from 'zustand'
import type { ReaderPosition, ReaderState } from '../../../shared/readerContracts'

interface ReaderTab { id: string; reader: ReaderState }
type ReaderSave = (leaving: boolean) => Promise<ReaderPosition | undefined>
type ReaderAction = { type: 'open'; reader: ReaderState } | { type: 'activate' | 'close'; id: string } | { type: 'flush' }
const readerId = (reader: ReaderState): string => `${reader.local ? 'local' : 'online'}:${reader.mangaId}`
const readerSavers = new Map<string, ReaderSave>()
let readerQueue: Promise<unknown> = Promise.resolve()
let pendingTransitions = 0
let failedGeneration = 0
let failedAction: ReaderAction | undefined

function transitionReader(action: ReaderAction): Promise<boolean> {
  if (useAppStore.getState().readerClosing && action.type !== 'flush') return Promise.resolve(false)
  const generation = failedGeneration
  pendingTransitions++
  useAppStore.setState({ readerTransitionPending: true })
  const result = readerQueue.then(async () => {
    if (generation !== failedGeneration) return false
    const state = useAppStore.getState()
    const id = action.type === 'open' ? readerId(action.reader) : action.type === 'flush' ? state.activeReaderId : action.id
    const existing = state.readerTabs.find(tab => tab.id === id)
    const active = state.readerTabs.find(tab => tab.id === state.activeReaderId)
    if (action.type !== 'open' && action.type !== 'flush' && !existing) return true
    if ((action.type === 'activate' && id === state.activeReaderId) ||
      (action.type === 'open' && id === state.activeReaderId && existing?.reader.chapterIndex === action.reader.chapterIndex)) {
      useAppStore.setState({ readerVisible: true })
      return true
    }
    try {
      const backgroundClose = action.type === 'close' && id !== state.activeReaderId
      const anchor = active && !backgroundClose ? await readerSavers.get(active.id)?.(action.type !== 'flush' || state.readerClosing) : undefined
      if (action.type === 'flush') {
        failedAction = undefined
        useAppStore.setState({ readerTransitionError: '' })
        return true
      }
      let tabs = state.readerTabs.map(tab => tab === active && anchor ? {
        ...tab, reader: { ...tab.reader, resumePageIndex: anchor.pageIndex, resumePageOffset: anchor.pageOffset }
      } : tab)
      let activeReaderId = state.activeReaderId
      if (action.type === 'open') {
        if (!existing) tabs = [...tabs, { id: id!, reader: action.reader }]
        else if (existing.reader.chapterIndex !== action.reader.chapterIndex) tabs = tabs.map(tab => tab.id === id ? { id: id!, reader: action.reader } : tab)
        activeReaderId = id
      } else if (action.type === 'activate') activeReaderId = id
      else {
        const index = tabs.findIndex(tab => tab.id === id)
        tabs = tabs.filter(tab => tab.id !== id)
        if (!backgroundClose) activeReaderId = tabs[Math.min(index, tabs.length - 1)]?.id ?? null
      }
      failedAction = undefined
      useAppStore.setState({ readerTabs: tabs, activeReaderId, readerTransitionError: '',
        ...((action.type === 'open' || action.type === 'activate') ? { readerVisible: true } : {}),
        ...(!state.readerTabs.length && tabs.length ? { readerSidebarCollapsed: true } : {}),
        ...(!tabs.length ? { readerVisible: false, readerExpanded: false, readerSidebarCollapsed: false } : {}) })
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
  pendingSearch: PendingSearch | null
  recommendationRevision: number
  readerSidebarCollapsed: boolean
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
  registerReaderSession: (id: string, save: ReaderSave) => () => void
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
  pendingSearch: null,
  recommendationRevision: 0,
  readerSidebarCollapsed: false,
  setReaderSidebarCollapsed: (collapsed) => set({ readerSidebarCollapsed: collapsed }),
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
  setReaderExpanded: (expanded) => set({ readerExpanded: expanded && get().readerTabs.length > 0,
    ...(expanded && get().readerTabs.length ? { readerVisible: true } : {}) }),
  setReaderVisible: (visible) => set({ readerVisible: visible && get().readerTabs.length > 0,
    ...(!visible ? { readerExpanded: false } : {}) }),
  setReaderToolsVisible: (visible) => set({ readerToolsVisible: visible }),
  registerReaderSession: (id, save) => {
    readerSavers.set(id, save)
    return () => { if (readerSavers.get(id) === save) readerSavers.delete(id) }
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
