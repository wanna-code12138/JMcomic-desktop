import type { AccountProfile, OnlineLibraryPage, AccountNotice, LibraryKind } from '../../shared/accountContracts'
import { count, record, safeText } from '../comments/commentParser'
import { validateTrustedImageUrl } from '../../shared/imageUrlCore'
import { AccountError } from './accountErrors'

export function id(raw: unknown): string {
  const value = String(raw ?? '')
  if (!/^\d{1,12}$/.test(value)) throw new AccountError('INVALID_INPUT')
  return value
}
export function boolean(raw: unknown): boolean | null {
  if ([true, 1, '1', 'true'].includes(raw as never)) return true
  if ([false, 0, '0', 'false'].includes(raw as never)) return false
  return null
}
export function parseLogin(raw: unknown, now: number): { profile: AccountProfile; avs: string } {
  const row = record(raw)
  if (!/^\d{1,12}$/.test(String(row.uid)) || !row.username || typeof row.s !== 'string' || !row.s || row.s.length > 8192) throw new AccountError('INVALID_CREDENTIALS')
  return { avs: row.s, profile: { uid: String(row.uid), username: safeText(row.username, 120),
    nickname: safeText(row.nickname ?? row.fname ?? row.username, 120), level: safeText(row.level_name ?? row.level, 80) || null,
    coins: count(row.coin), experience: count(row.exp), favorites: count(row.album_favorites), favoriteLimit: count(row.album_favorites_max), checkedAt: now } }
}
export function rows(raw: unknown): unknown[] {
  const data = record(raw)
  const list = Array.isArray(raw) ? raw : data.list
  if (!Array.isArray(list)) throw new AccountError('PROTOCOL')
  return list.slice(0, 1000)
}
export function parseLibrary(raw: unknown, page: number, imageOrigin: string, kind: LibraryKind = 'favorites'): OnlineLibraryPage {
  const data = record(raw)
  const emptyTracking = kind === 'tracking' && count(data.totalCnt) === 0 && Object.keys(data).every(key => key === 'totalCnt')
  const list = emptyTracking ? [] : rows(kind === 'tracking' && Array.isArray(data.item) ? data.item : raw)
  const seen = new Set<string>()
  const items = list.flatMap(raw => {
    const row = record(raw); const albumId = String(row.id ?? row.aid ?? '')
    if (!/^\d{1,12}$/.test(albumId) || seen.has(albumId)) return []
    seen.add(albumId)
    const image = typeof row.image === 'string' ? row.image.trim() : ''
    let coverUrl = ''
    try { coverUrl = validateTrustedImageUrl(new URL(image || `/media/albums/${albumId}.jpg`, imageOrigin).href) ?? '' } catch { /* Optional cover. */ }
    return [{ id: albumId, title: safeText(row.name ?? row.title, 500) || `JM${albumId}`, coverUrl,
      author: safeText(Array.isArray(row.author) ? row.author.join('、') : row.author, 200), date: safeText(row.addtime ?? row.adddt ?? row.update_at, 100) }]
  })
  if (list.length && !items.length) throw new AccountError('PROTOCOL')
  const total = count(data.total ?? data.totalCnt), totalPages = count(data.total_pages)
  const hasMore = totalPages !== null ? page < totalPages : total !== null ? page * (count(data.per_page) || (kind === 'tracking' ? list.length : 20)) < total : list.length > 0
  const folders = Array.isArray(data.folder_list) ? data.folder_list.flatMap(raw => {
    const row = record(raw); const folderId = String(row.FID ?? row.id ?? '')
    return /^\d{1,12}$/.test(folderId) ? [{ id: folderId, name: safeText(row.name, 200) || '默认收藏夹', count: count(row.count) }] : []
  }) : []
  return { items, page, total, hasMore, folders }
}
export function parseNotifications(raw: unknown): AccountNotice[] {
  const list = rows(raw)
  const result = list.flatMap(raw => {
    const row = record(raw); const noticeId = String(row.id ?? ''); const read = boolean(row.read)
    if (!noticeId || noticeId.length > 128 || read === null) return []
    return [{ id: noticeId, title: safeText(row.title, 200), text: safeText(row.content), date: safeText(row.date ?? row.created_at, 100), read }]
  })
  if (list.length && !result.length) throw new AccountError('PROTOCOL')
  return result
}
