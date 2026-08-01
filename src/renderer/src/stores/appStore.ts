import { create } from 'zustand'

interface ReaderState {
  mangaId: string
  mangaTitle: string
  mangaCoverUrl: string
  chapterIndex: number
  chapterTitle: string
  chapterUrl: string
  resumePageIndex?: number
  /** true 表示从本地下载目录读取，不触发网页抓取 */
  local?: boolean
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
  readerSourcePage: string
  favoritesTab: string
  currentMangaId: string | null
  readerState: ReaderState | null
  networkStatus: 'online' | 'degraded' | 'offline'
  micaEnabled: boolean
  solidWindow: boolean
  pendingSearch: PendingSearch | null
  setThemeMode: (mode: ThemeMode) => void
  setDarkMode: (dark: boolean) => void
  toggleDarkMode: () => void
  setCurrentPage: (page: string) => void
  setCurrentMangaId: (id: string | null) => void
  setCurrentLocalMangaId: (id: string) => void
  openReader: (state: ReaderState) => void
  closeReader: () => void
  setFavoritesTab: (tab: string) => void
  setNetworkStatus: (status: 'online' | 'degraded' | 'offline') => void
  setMicaEnabled: (enabled: boolean) => void
  setSolidWindow: (solid: boolean) => void
  triggerTagSearch: (tag: string) => void
  clearPendingSearch: () => void
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
  readerSourcePage: 'home',
  favoritesTab: 'local-fav',
  currentMangaId: null,
  readerState: null,
  networkStatus: 'online',
  micaEnabled: true,
  solidWindow: false,
  pendingSearch: null,
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
    set({ currentPage: page, currentMangaId: page === 'detail' ? undefined : null }),
  setCurrentMangaId: (id) =>
    set((s) => ({
      currentMangaId: id,
      detailSource: 'web',
      currentPage: id ? 'detail' : s.currentPage,
      previousPage:
        id && s.currentPage !== 'detail' && s.currentPage !== 'reader'
          ? s.currentPage
          : s.previousPage
    })),
  setCurrentLocalMangaId: (id) =>
    set((s) => ({
      currentMangaId: id,
      detailSource: 'local',
      currentPage: 'detail',
      previousPage:
        s.currentPage !== 'detail' && s.currentPage !== 'reader'
          ? s.currentPage
          : s.previousPage
    })),
  openReader: (state) =>
    set((s) => ({
      readerState: state,
      currentPage: 'reader',
      readerSourcePage: s.currentPage
    })),
  closeReader: () =>
    set((s) => ({
      readerState: null,
      currentPage: s.readerSourcePage
    })),
  setFavoritesTab: (tab) => set({ favoritesTab: tab }),
  setNetworkStatus: (status) => set({ networkStatus: status }),
  setMicaEnabled: (enabled) => set({ micaEnabled: enabled }),
  setSolidWindow: (solid) => set({ solidWindow: solid }),
  triggerTagSearch: (tag) =>
    set({
      pendingSearch: { query: tag, mainTag: 0 },
      currentPage: 'search'
    }),
  clearPendingSearch: () => set({ pendingSearch: null })
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
