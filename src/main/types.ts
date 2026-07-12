// Core data types for the JMComic application

export interface MangaListItem {
  id: string
  title: string
  coverUrl: string
  author?: string
  tags?: string[]
  latestChapter?: string
  updateTime?: string
}

export interface MangaDetail {
  id: string
  title: string
  author: string
  coverUrl: string
  tags: string[]
  description: string
  chapters: ChapterItem[]
  rating?: number
  totalViews?: string
}

export interface ChapterItem {
  index: number
  title: string
  url: string
}

export interface PageItem {
  index: number
  imageUrl: string
}

// Site adapter interface — pluggable parsers
export interface SiteAdapter {
  name: string
  baseUrls: string[]

  // Probes if the site is reachable
  probe(): Promise<boolean>

  // Fetch homepage sections
  getHomepage(): Promise<{
    recommended: MangaListItem[]
    latest: MangaListItem[]
    popular: MangaListItem[]
  }>

  // Search
  search(query: string, page?: number): Promise<{
    results: MangaListItem[]
    totalPages: number
    currentPage: number
  }>

  // Category listing
  getCategory(categoryId: string, page?: number): Promise<{
    results: MangaListItem[]
    totalPages: number
    currentPage: number
  }>

  // Manga detail
  getMangaDetail(mangaId: string): Promise<MangaDetail>

  // Chapter pages (image URLs)
  getChapterPages(chapterUrl: string): Promise<PageItem[]>

  // Login
  login(username: string, password: string): Promise<{ success: boolean; error?: string }>

  // Favorites (requires login)
  getFavorites?(): Promise<MangaListItem[]>
}

// Network status
export type NetworkStatus = 'online' | 'degraded' | 'offline'

export interface NetworkState {
  status: NetworkStatus
  activeDomain: string
  lastChecked: number
}
