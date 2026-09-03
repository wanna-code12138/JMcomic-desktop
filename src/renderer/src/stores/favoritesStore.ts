import { create } from 'zustand'

export interface FavoriteItem {
  mangaId: string
  title: string
  coverUrl: string
}

export interface FavoritesState {
  favoriteIds: Set<string>
  loading: boolean
  error: string | null
  initialize: () => Promise<void>
  toggleFavorite: (item: FavoriteItem) => Promise<boolean>
}

let initPromise: Promise<void> | null = null

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favoriteIds: new Set<string>(),
  loading: false,
  error: null,

  initialize: async () => {
    if (initPromise) return initPromise
    initPromise = (async () => {
      try {
        set({ loading: true, error: null })
        const list = await window.electronAPI?.favoritesList()
        const ids = new Set<string>((list ?? []).map((f: any) => f.manga_id))
        set({ favoriteIds: ids, loading: false })
      } catch (err) {
        set({ error: String(err), loading: false })
      } finally {
        initPromise = null
      }
    })()
    return initPromise
  },

  toggleFavorite: async (item: FavoriteItem) => {
    const prevIds = get().favoriteIds
    const isFav = prevIds.has(item.mangaId)
    const nextIds = new Set(prevIds)
    if (isFav) {
      nextIds.delete(item.mangaId)
    } else {
      nextIds.add(item.mangaId)
    }

    // 乐观更新
    set({ favoriteIds: nextIds })

    try {
      if (isFav) {
        await window.electronAPI?.favoritesRemove(item.mangaId)
      } else {
        await window.electronAPI?.favoritesAdd({
          mangaId: item.mangaId,
          title: item.title,
          coverUrl: item.coverUrl
        })
      }
      return !isFav
    } catch (err) {
      // 失败回滚
      set({ favoriteIds: prevIds, error: String(err) })
      return isFav
    }
  }
}))

export function useIsFavorite(mangaId: string): boolean {
  return useFavoritesStore((state) => state.favoriteIds.has(mangaId))
}
