import type { ReaderState } from './readerContracts'

interface TabMetadata { id: string; customTitle?: string; pinned: boolean }
export type ReaderTab = TabMetadata & (
  { kind: 'start'; reader?: undefined; contentKey?: undefined } |
  { kind: 'book'; reader: ReaderState; contentKey: string }
)
export interface WorkspaceSnapshot { version: 1; tabs: ReaderTab[]; activeId: string | null }
export const WORKSPACE_MAX_BYTES = 256 * 1024
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
const safeUrl = (value: unknown): value is string => text(value, 2048) && (!value || value.startsWith('/') || /^https?:\/\//i.test(value))
const integer = (value: unknown, max: number): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max

export function normalizeWorkspaceSnapshot(raw: unknown): WorkspaceSnapshot | null {
  if (!object(raw) || raw.version !== 1 || !Array.isArray(raw.tabs) || raw.tabs.length > 100) return null
  if (JSON.stringify(raw).length > WORKSPACE_MAX_BYTES) return null
  const tabs: ReaderTab[] = [], identities = new Set<string>(), ids = new Set<string>()
  for (const item of raw.tabs) {
    if (!object(item) || !text(item.id, 160) || !item.id || (item.customTitle !== undefined && !text(item.customTitle, 120))) return null
    if (ids.has(item.id)) continue
    const metadata = { id: item.id, pinned: item.pinned === true, customTitle: typeof item.customTitle === 'string' ? item.customTitle.trim() || undefined : undefined }
    if (item.kind === 'start') tabs.push({ ...metadata, kind: 'start' })
    else if (item.kind === 'book' && object(item.reader)) {
      const r = item.reader
      if (!text(r.mangaId, 100) || !r.mangaId || !text(r.mangaTitle, 500) || !text(r.chapterTitle, 500) || !integer(r.chapterIndex, 100000)
        || !safeUrl(r.chapterUrl) || !safeUrl(r.mangaCoverUrl)) return null
      const contentKey = `${r.local === true ? 'local' : 'online'}:${r.mangaId}`
      if (identities.has(contentKey)) continue
      identities.add(contentKey)
      const reader: ReaderState = { mangaId: r.mangaId, mangaTitle: r.mangaTitle, mangaCoverUrl: r.mangaCoverUrl,
        chapterIndex: r.chapterIndex, chapterTitle: r.chapterTitle, chapterUrl: r.chapterUrl, local: r.local === true,
        resumePageIndex: integer(r.resumePageIndex, 1000000) ? r.resumePageIndex : 0,
        resumePageOffset: typeof r.resumePageOffset === 'number' && Number.isFinite(r.resumePageOffset) ? Math.max(0, Math.min(1, r.resumePageOffset)) : 0 }
      // Chapter manifests are fetched lazily by the active reader, never restored as cached content.
      tabs.push({ ...metadata, kind: 'book', contentKey, reader })
    } else return null
    ids.add(item.id)
  }
  return { version: 1, tabs: [...tabs.filter(tab => tab.pinned), ...tabs.filter(tab => !tab.pinned)], activeId: tabs.some(tab => tab.id === raw.activeId) ? String(raw.activeId) : tabs[0]?.id ?? null }
}
