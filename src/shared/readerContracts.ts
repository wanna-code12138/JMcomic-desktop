export interface ReaderPageData { index: number; imageUrl: string }
export interface ReaderChapter { index: number; title: string; url: string; available?: boolean }
export interface ReaderState {
  mangaId: string
  mangaTitle: string
  mangaCoverUrl: string
  chapterIndex: number
  chapterTitle: string
  chapterUrl: string
  resumePageIndex?: number
  resumePageOffset?: number
  local?: boolean
  chapters?: ReaderChapter[]
}
export interface ReaderPosition { pageIndex: number; pageOffset: number }
export interface HistoryPositionContext { chapterIndex: number; pageOffset: number; session: string; flush?: boolean }
export interface ReadingHistory {
  manga_id: string
  manga_title?: string
  chapter_index: number
  chapter_title?: string
  chapter_url?: string
  cover_url?: string
  page_index: number
  page_offset?: number
  total_pages?: number
  is_local?: number
  reader_session?: string
  read_at?: number
}
export interface ReaderPagesReply {
  ok: boolean
  data?: ReaderPageData[]
  scrambleId?: number
  chapterUrl?: string
  error?: string
}
export interface ReaderPreferences {
  readerMode: 'scroll' | 'single'
  readerFit: 'width' | 'height' | 'original'
  readerDirection: 'ltr' | 'rtl'
  readerZoom: number
  readerMaxWidth: number
  readerAutoHide: boolean
}
export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  readerMode: 'scroll', readerFit: 'width', readerDirection: 'ltr',
  readerZoom: 1, readerMaxWidth: 960, readerAutoHide: true
}
export function normalizeReaderPreferences(raw: Record<string, unknown>): ReaderPreferences {
  const number = (key: string, min: number, max: number, fallback: number): number => {
    const value = Number(raw[key])
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
  }
  return {
    readerMode: raw.readerMode === 'single' ? 'single' : 'scroll',
    readerFit: raw.readerFit === 'height' || raw.readerFit === 'original' ? raw.readerFit : 'width',
    readerDirection: raw.readerDirection === 'rtl' ? 'rtl' : 'ltr',
    readerZoom: number('readerZoom', 0.5, 3, 1),
    readerMaxWidth: number('readerMaxWidth', 480, 2400, 960),
    readerAutoHide: raw.readerAutoHide !== false && raw.readerAutoHide !== 'false'
  }
}
