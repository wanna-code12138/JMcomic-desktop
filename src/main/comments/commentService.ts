import type { CommentPage } from '../../shared/commentContracts'
import { parseCommentPage } from './commentParser'

export function createCommentService(request: (id: string, page: number, signal?: AbortSignal) => Promise<unknown>,
  options: { now?: () => number; maxPages?: number; maxBytes?: number } = {}) {
  const cache = new Map<string, { data: CommentPage; time: number; bytes: number }>()
  const now = options.now ?? Date.now
  let bytes = 0
  return { async get(id: string, page: number, refresh = false, signal?: AbortSignal): Promise<CommentPage> {
    if (!/^\d{1,12}$/.test(id) || !Number.isSafeInteger(page) || page < 1 || page > 10_000) throw new Error('INVALID_COMMENTS_QUERY')
    signal?.throwIfAborted()
    const key = `${id}:${page}:all`
    const old = cache.get(key)
    if (!refresh && old && now() - old.time < 60_000) return structuredClone(old.data)
    try {
      const data = parseCommentPage(await request(id, page, signal), page)
      signal?.throwIfAborted()
      if (data.items.length && [...cache].some(([otherKey, entry]) => otherKey !== key && otherKey.startsWith(`${id}:`) && now() - entry.time < 300_000 &&
        entry.data.items.map(item => item.id).join(',') === data.items.map(item => item.id).join(','))) throw new Error('DUPLICATE_COMMENTS_PAGE')
      const size = Buffer.byteLength(JSON.stringify(data))
      const replaced = cache.get(key)
      if (replaced) { cache.delete(key); bytes -= replaced.bytes }
      cache.set(key, { data, time: now(), bytes: size }); bytes += size
      while (cache.size > (options.maxPages ?? 100) || bytes > (options.maxBytes ?? 4 * 1024 * 1024)) {
        const first = cache.keys().next().value!
        bytes -= cache.get(first)!.bytes; cache.delete(first)
      }
      return structuredClone(data)
    } catch (error) {
      signal?.throwIfAborted()
      if (old && now() - old.time < 300_000 && !refresh) return { ...structuredClone(old.data), stale: true }
      throw error
    }
  } }
}
