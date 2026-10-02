import { load } from 'cheerio'
import type { ComicComment, CommentPage } from '../../shared/commentContracts'

export function safeText(raw: unknown, limit = 20_000): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return ''
  const source = String(raw)
  const $ = load(source.slice(0, 200_000), null, false)
  $('script,style,iframe,object,svg').remove()
  $('br').replaceWith('\n')
  $('p,div,li').append('\n')
  const text = $.root().text().replace(/\r/g, '').replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return text.length > limit ? `${text.slice(0, limit)}\n[内容过长，已截断]` : text
}

export function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
}

export function count(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function parseRows(rows: unknown[], depth = 0): ComicComment[] {
  const seen = new Set<string>()
  const result: ComicComment[] = []
  for (const raw of rows.slice(0, 100)) {
    const row = record(raw)
    const id = String(row.CID ?? row.id ?? '')
    if (!/^\d+$/.test(id) || seen.has(id)) continue
    seen.add(id)
    const replies = row.replys ?? row.replies ?? []
    result.push({ id, author: safeText(row.nickname || row.username, 120) || '读者',
      text: safeText(row.content), createdAt: safeText(row.addtime ?? row.date, 100),
      spoiler: row.spoiler === '2' || row.spoiler === 2 || row.spoiler === true,
      likes: count(row.likes), albumId: /^\d+$/.test(String(row.AID)) ? String(row.AID) : undefined,
      repliesTruncated: Array.isArray(replies) && (replies.length > 100 || (depth >= 2 && replies.length > 0)),
      parentId: /^\d+$/.test(String(row.parent_CID)) && String(row.parent_CID) !== '0' ? String(row.parent_CID) : undefined,
      replies: depth < 2 && Array.isArray(replies) ? parseRows(replies, depth + 1) : [] })
  }
  return result
}

export function parseCommentPage(raw: unknown, page: number): CommentPage {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) throw new Error('INVALID_PAGE')
  const data = record(raw)
  const rows = Array.isArray(raw) ? raw : data.list
  if (!Array.isArray(rows)) throw new Error('INVALID_COMMENTS')
  const items = parseRows(rows)
  if (rows.length > 0 && items.length === 0) throw new Error('INVALID_COMMENTS')
  const total = count(data.total)
  return { items, page, total, hasNext: total === null ? rows.length >= 10 : page * 10 < total, truncated: rows.length > 100 }
}
