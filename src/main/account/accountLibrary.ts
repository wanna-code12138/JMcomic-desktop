import type { AlbumAccountState, AlbumMutation, LibraryQuery, AccountNotifications, OnlineLibraryPage } from '../../shared/accountContracts'
import type { AccountService } from './accountService'
import { id, boolean, parseLibrary, parseNotifications } from './accountParser'
import { count, record } from '../comments/commentParser'
import { AccountError } from './accountErrors'
import { createAccountOperations } from './accountOperations'

export function createAccountLibrary(service: AccountService) {
  const { scope, operate } = createAccountOperations(service)
  async function readState(albumId: string, kind: AlbumMutation['kind'], generation: number): Promise<boolean | null> {
    scope(generation)
    if (kind === 'tracking') {
      // The single-album endpoint can report false for an album present in the tracking list.
      // Only a complete list can prove absence; a partial/duplicated page must not trigger a toggle.
      const seen = new Set<string>(), deadline = Date.now() + 15_000
      for (let page = 1; page <= 50 && Date.now() < deadline; page++) {
        const data = parseLibrary(await service.request('tracking', { page: String(page) }, generation), page, service.imageOrigin(), 'tracking')
        scope(generation)
        if (data.items.some(item => item.id === albumId)) return true
        const previous = seen.size
        data.items.forEach(item => seen.add(item.id))
        if (data.total !== null && seen.size >= data.total) return false
        if (!data.hasMore && data.total === null) return false
        if (seen.size === previous) throw new AccountError('UNAVAILABLE')
      }
      throw new AccountError('UNAVAILABLE')
    }
    const raw = await service.request('album', { id: albumId }, generation)
    scope(generation)
    const row = record(raw)
    return String(row.id) === albumId ? boolean(kind === 'liked' ? row.liked : row.is_favorite) : null
  }
  async function notifications(generation: number): Promise<AccountNotifications> {
    scope(generation)
    const items = parseNotifications(await service.request('notifications', {}, generation))
    let unread: number | null = null
    try {
      const data = record(await service.request('unread', {}, generation))
      unread = count(data.count ?? data.unreadCount ?? data.total)
      if (unread === null && (count(data.site_notice) !== null || count(data.comic_follow) !== null)) unread = (count(data.site_notice) ?? 0) + (count(data.comic_follow) ?? 0)
    } catch { scope(generation) }
    scope(generation); return { items, unread }
  }
  return {
    async list(query: LibraryQuery): Promise<OnlineLibraryPage> {
      scope(query.generation)
      if (!['favorites', 'history', 'tracking'].includes(query.kind) || !Number.isSafeInteger(query.page) || query.page < 1 || query.page > 10000) throw new AccountError('INVALID_INPUT')
      const params: Record<string, string> = { page: String(query.page) }
      if (query.kind === 'favorites') { params.folder_id = id(query.folderId ?? '0'); params.o = 'mr' }
      const raw = await service.request(query.kind, params, query.generation)
      scope(query.generation); return parseLibrary(raw, query.page, service.imageOrigin(), query.kind)
    },
    async album(albumId: string, generation: number): Promise<AlbumAccountState> {
      id(albumId); scope(generation)
      const results = await Promise.allSettled([service.request('album', { id: albumId }, generation), readState(albumId, 'tracking', generation)])
      scope(generation)
      if (results.every(result => result.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason
      const album = results[0].status === 'fulfilled' ? record(results[0].value) : {}
      return { id: albumId, favorite: String(album.id) === albumId ? boolean(album.is_favorite) : null,
        liked: String(album.id) === albumId ? boolean(album.liked) : null, tracking: results[1].status === 'fulfilled' ? results[1].value as boolean | null : null }
    },
    notifications,
    async mutate(query: AlbumMutation): Promise<AlbumAccountState> {
      id(query.id)
      if (!['favorite', 'tracking', 'liked'].includes(query.kind) || typeof query.desired !== 'boolean') throw new AccountError('INVALID_INPUT')
      // Live /like rejects a second vote with “已經評價”; it does not undo it.
      if (query.kind === 'liked' && !query.desired) throw new AccountError('UNAVAILABLE')
      return operate(query.generation, query.operationId, `${query.kind}:${query.id}`, JSON.stringify(query), async () => {
        const before = await readState(query.id, query.kind, query.generation)
        if (before === null) throw new AccountError('UNAVAILABLE')
        if (before !== query.desired) {
          let writeError: unknown
          try {
            const reply = await service.request(query.kind === 'favorite' ? 'favorite' : query.kind === 'liked' ? 'like' : 'trackingToggle', query.kind === 'favorite' ? { aid: query.id } : { id: query.id }, query.generation)
            if (query.kind === 'liked' && record(reply).status !== 'success') throw new AccountError('UNAVAILABLE')
          } catch (error) { writeError = error }
          scope(query.generation)
          let after: boolean | null
          try { after = await readState(query.id, query.kind, query.generation) }
          catch { scope(query.generation); throw new AccountError('OUTCOME_UNKNOWN') }
          if (after === null) throw new AccountError('OUTCOME_UNKNOWN')
          if (after !== query.desired) throw writeError instanceof AccountError ? writeError : new AccountError('CONFLICT')
        }
        return { id: query.id, favorite: query.kind === 'favorite' ? query.desired : null, tracking: query.kind === 'tracking' ? query.desired : null, liked: query.kind === 'liked' ? query.desired : null }
      })
    },
    async markRead(noticeId: string, generation: number, operationId: string): Promise<AccountNotifications> {
      if (typeof noticeId !== 'string' || !noticeId || noticeId.length > 128 || /[\x00-\x1f]/.test(noticeId)) throw new AccountError('INVALID_INPUT')
      return operate(generation, operationId, `notice:${noticeId}`, noticeId, async () => {
        const before = await notifications(generation)
        const item = before.items.find(item => item.id === noticeId)
        if (!item) throw new AccountError('CONFLICT')
        if (item.read) return before
        try { await service.request('noticeRead', { id: noticeId, read: '1' }, generation) } catch { scope(generation) }
        let after: AccountNotifications
        try { after = await notifications(generation) } catch { scope(generation); throw new AccountError('OUTCOME_UNKNOWN') }
        if (!after.items.find(item => item.id === noticeId)?.read) throw new AccountError('OUTCOME_UNKNOWN')
        return after
      })
    }
  }
}
