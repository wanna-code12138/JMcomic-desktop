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

export interface ChapterPagesResult {
  pages: PageItem[]
  scrambleId: number
}

// Network status
export type NetworkStatus = 'online' | 'degraded' | 'offline'

export interface NetworkState {
  status: NetworkStatus
  activeDomain: string
  lastChecked: number
}
