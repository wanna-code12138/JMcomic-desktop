import { create } from 'zustand'

interface ReaderState {
  mangaId: string
  mangaTitle: string
  mangaCoverUrl: string
  chapterIndex: number
  chapterTitle: string
  chapterUrl: string
  resumePageIndex?: number
}

interface PendingSearch {
  query: string
  mainTag: 0 | 1
}

interface AppState {
  darkMode: boolean
  currentPage: string
  previousPage: string
  readerSourcePage: string
  favoritesTab: string
  currentMangaId: string | null
  readerState: ReaderState | null
  networkStatus: 'online' | 'degraded' | 'offline'
  pendingSearch: PendingSearch | null
  setDarkMode: (dark: boolean) => void
  toggleDarkMode: () => void
  setCurrentPage: (page: string) => void
  setCurrentMangaId: (id: string | null) => void
  openReader: (state: ReaderState) => void
  closeReader: () => void
  setFavoritesTab: (tab: string) => void
  setNetworkStatus: (status: 'online' | 'degraded' | 'offline') => void
  triggerTagSearch: (tag: string) => void
  clearPendingSearch: () => void
}

export const useAppStore = create<AppState>((set) => ({
  darkMode: false,
  currentPage: 'home',
  previousPage: 'home',
  readerSourcePage: 'home',
  favoritesTab: 'local-fav',
  currentMangaId: null,
  readerState: null,
  networkStatus: 'online',
  pendingSearch: null,
  setDarkMode: (dark) => set({ darkMode: dark }),
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setCurrentPage: (page) => set({ currentPage: page, currentMangaId: page === 'detail' ? undefined : null }),
  setCurrentMangaId: (id) => set((s) => ({
    currentMangaId: id,
    currentPage: id ? 'detail' : s.currentPage,
    previousPage: id && s.currentPage !== 'detail' && s.currentPage !== 'reader' ? s.currentPage : s.previousPage
  })),
  openReader: (state) => set((s) => ({
    readerState: state,
    currentPage: 'reader',
    readerSourcePage: s.currentPage
  })),
  closeReader: () => set((s) => ({
    readerState: null,
    currentPage: s.readerSourcePage
  })),
  setFavoritesTab: (tab) => set({ favoritesTab: tab }),
  setNetworkStatus: (status) => set({ networkStatus: status }),
  triggerTagSearch: (tag) => set({
    pendingSearch: { query: tag, mainTag: 0 },
    currentPage: 'search'
  }),
  clearPendingSearch: () => set({ pendingSearch: null })
}))
