import { create } from 'zustand'

interface ReaderState {
  mangaTitle: string
  chapterTitle: string
  chapterUrl: string
}

interface PendingSearch {
  query: string
  mainTag: 0 | 1
}

interface AppState {
  darkMode: boolean
  currentPage: string
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
  setNetworkStatus: (status: 'online' | 'degraded' | 'offline') => void
  triggerTagSearch: (tag: string) => void
  clearPendingSearch: () => void
}

export const useAppStore = create<AppState>((set) => ({
  darkMode: false,
  currentPage: 'home',
  currentMangaId: null,
  readerState: null,
  networkStatus: 'online',
  pendingSearch: null,
  setDarkMode: (dark) => set({ darkMode: dark }),
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setCurrentPage: (page) => set({ currentPage: page, currentMangaId: page === 'detail' ? undefined : null }),
  setCurrentMangaId: (id) => set({ currentMangaId: id, currentPage: id ? 'detail' : 'home' }),
  openReader: (state) => set({ readerState: state, currentPage: 'reader' }),
  closeReader: () => set({ readerState: null, currentPage: 'detail' }),
  setNetworkStatus: (status) => set({ networkStatus: status }),
  triggerTagSearch: (tag) => set({
    pendingSearch: { query: tag, mainTag: 0 },
    currentPage: 'search'
  }),
  clearPendingSearch: () => set({ pendingSearch: null })
}))
