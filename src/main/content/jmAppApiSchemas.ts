import type { GatewayListResult } from '../contentGateway'
import type { ChapterPagesResult, MangaDetail, MangaListItem, ChapterItem, PageItem } from '../types'
import { validateCards, validateDetail, validatePages } from '../contentValidation'
import { validateTrustedImageUrl } from '../../shared/imageUrlCore'

export class JmApiSchemaError extends Error {
  constructor(message: string) {
    super(`JM_API_SCHEMA_ERROR: ${message}`)
    this.name = 'JmApiSchemaError'
  }
}

function ensureHttps(urlStr: string, imageOrigin: string): string {
  const resolved = new URL(urlStr, `${imageOrigin.replace(/\/+$/, '')}/`).href
  const trusted = validateTrustedImageUrl(resolved)
  if (!trusted) throw new JmApiSchemaError('Untrusted image URL')
  return trusted
}

function toNonEmptyString(val: unknown): string | null {
  if (typeof val === 'string' && val.trim().length > 0) {
    return val.trim()
  }
  return null
}

function toIdString(val: unknown): string | null {
  if (typeof val === 'number' && Number.isInteger(val) && val > 0) {
    return String(val)
  }
  if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
    return val.trim()
  }
  return null
}

export function parseSettingPayload(payload: unknown): { jm3Version: string; imgHost: string | null } {
  if (!payload || typeof payload !== 'object') {
    throw new JmApiSchemaError('Invalid setting payload shape')
  }
  const obj = payload as Record<string, unknown>
  const version = obj.jm3_version ?? obj.jm3Version
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version.trim())) {
    throw new JmApiSchemaError('Invalid or missing jm3_version')
  }
  const imgHost = typeof obj.img_host === 'string' && obj.img_host.trim().length > 0
    ? obj.img_host.trim()
    : null
  return { jm3Version: version.trim(), imgHost }
}

export function parseListPayload(payload: unknown, imageOrigin: string): GatewayListResult {
  if (!payload || typeof payload !== 'object') {
    throw new JmApiSchemaError('Invalid list payload shape')
  }
  const obj = payload as Record<string, unknown>
  const rawList = Array.isArray(obj.content) ? obj.content : Array.isArray(obj.list) ? obj.list : null
  if (!rawList) {
    throw new JmApiSchemaError('Missing content or list array')
  }

  const results: MangaListItem[] = []
  for (const item of rawList) {
    if (!item || typeof item !== 'object') {
      throw new JmApiSchemaError('Malformed card item')
    }
    const itemObj = item as Record<string, unknown>
    const id = toIdString(itemObj.id ?? itemObj.album_id ?? itemObj.aid)
    const title = toNonEmptyString(itemObj.name ?? itemObj.title)
    const imageRaw = toNonEmptyString(itemObj.image ?? itemObj.cover ?? itemObj.coverUrl)
      ?? (id ? `/media/albums/${id}.jpg` : null)

    if (!id || !title || !imageRaw) {
      throw new JmApiSchemaError('Card item missing id, title or image')
    }

    const coverUrl = ensureHttps(imageRaw, imageOrigin)
    const author = toNonEmptyString(itemObj.author) ?? undefined
    const tags = Array.isArray(itemObj.tags)
      ? (itemObj.tags.filter((t) => typeof t === 'string' && t.trim().length > 0) as string[])
      : undefined
    const latestChapter = toNonEmptyString(itemObj.latest_chapter ?? itemObj.latestChapter) ?? undefined

    results.push({
      id,
      title,
      coverUrl,
      author,
      tags,
      latestChapter
    })
  }

  const validation = validateCards(results)
  if (!validation.ok) {
    throw new JmApiSchemaError(`Card validation failed: ${validation.reason}`)
  }

  const total = typeof obj.total === 'number' && obj.total >= 0 ? obj.total : results.length
  const totalPages = Math.max(1, Math.ceil(total / 80))

  return { results, totalPages }
}

export function parseAlbumPayload(payload: unknown, imageOrigin: string): MangaDetail {
  if (!payload || typeof payload !== 'object') {
    throw new JmApiSchemaError('Invalid album payload shape')
  }
  const obj = payload as Record<string, unknown>
  const id = toIdString(obj.id ?? obj.aid)
  const title = toNonEmptyString(obj.name ?? obj.title)
  const imageRaw = toNonEmptyString(obj.image ?? obj.cover ?? obj.coverUrl)
    ?? (id ? `/media/albums/${id}.jpg` : null)

  if (!id || !title || !imageRaw) {
    throw new JmApiSchemaError('Album missing id, title or cover image')
  }

  const coverUrl = ensureHttps(imageRaw, imageOrigin)
  const author = Array.isArray(obj.author)
    ? obj.author.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join(', ')
    : toNonEmptyString(obj.author) ?? '未知作者'
  const description = typeof obj.description === 'string' ? obj.description.trim() : ''

  let tags: string[] = []
  if (Array.isArray(obj.tags)) {
    tags = obj.tags
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
  }

  const rawSeries = Array.isArray(obj.series) ? obj.series : Array.isArray(obj.episodes) ? obj.episodes : null
  if (!rawSeries || rawSeries.length === 0) {
    throw new JmApiSchemaError('Album chapters series is empty or missing')
  }

  const chapters: ChapterItem[] = []
  for (let i = 0; i < rawSeries.length; i++) {
    const ep = rawSeries[i]
    if (!ep || typeof ep !== 'object') {
      throw new JmApiSchemaError('Malformed chapter item')
    }
    const epObj = ep as Record<string, unknown>
    const epId = toIdString(epObj.id ?? epObj.photo_id ?? epObj.chapter_id)
    const epName = toNonEmptyString(epObj.name ?? epObj.title) ?? `第 ${i + 1} 话`
    const url = epId ? `/photo/${epId}` : (toNonEmptyString(epObj.url) ?? `/photo/${id}`)

    chapters.push({
      index: i,
      title: epName,
      url
    })
  }

  const detail: MangaDetail = {
    id,
    title,
    author,
    coverUrl,
    tags,
    description,
    chapters,
    totalViews: toNonEmptyString(obj.total_views) ?? undefined
  }

  const validation = validateDetail(detail)
  if (!validation.ok) {
    throw new JmApiSchemaError(`Detail validation failed: ${validation.reason}`)
  }

  return detail
}

export function parseComicReadPayload(payload: unknown, imageOrigin: string, expectedChapterId?: string): ChapterPagesResult {
  if (!payload || typeof payload !== 'object') {
    throw new JmApiSchemaError('Invalid comic read payload shape')
  }
  const obj = payload as Record<string, unknown>
  const scrambleIdRaw = obj.scramble_id ?? obj.scrambleId
  const scrambleId = typeof scrambleIdRaw === 'number' && Number.isInteger(scrambleIdRaw) && scrambleIdRaw >= 0
    ? scrambleIdRaw
    : typeof scrambleIdRaw === 'string' && /^\d+$/.test(scrambleIdRaw.trim())
    ? parseInt(scrambleIdRaw.trim(), 10)
    : null

  if (scrambleId === null) {
    throw new JmApiSchemaError('Invalid or missing scrambleId')
  }

  const chapterId = toIdString(obj.id ?? obj.chapter_id ?? obj.photo_id)
  if (!chapterId || (expectedChapterId && chapterId !== expectedChapterId)) {
    throw new JmApiSchemaError('Chapter ID missing or mismatched')
  }
  const rawImages = obj.images ?? obj.pages
  if (!Array.isArray(rawImages) || rawImages.length === 0) {
    throw new JmApiSchemaError('Missing images or pages array')
  }
  if (obj.total_page !== undefined && Number(obj.total_page) !== rawImages.length) {
    throw new JmApiSchemaError('Page count mismatch')
  }

  const pages: PageItem[] = []

  // 严格不可回归要求：pages 必须保证严格连续 0..n-1，严禁隐式排序修复乱序
  for (let i = 0; i < rawImages.length; i++) {
    const item = rawImages[i]
    if (typeof item === 'string') {
      const filename = item.trim()
      if (!filename) throw new JmApiSchemaError('Empty image filename')
      const imageUrl = ensureHttps(
        filename.includes('/') ? filename : `/media/photos/${chapterId}/${filename}`,
        imageOrigin
      )
      pages.push({ index: i, imageUrl })
    } else if (item && typeof item === 'object') {
      const itemObj = item as Record<string, unknown>
      const pageIndex = itemObj.index ?? (typeof itemObj.page === 'number' ? itemObj.page - 1 : undefined)
      if (typeof pageIndex !== 'number' || pageIndex !== i) {
        throw new JmApiSchemaError(`Page index mismatch or unordered: expected ${i}, got ${pageIndex}`)
      }
      const rawUrl = toNonEmptyString(itemObj.imageUrl ?? itemObj.url ?? itemObj.src ?? itemObj.image)
      if (!rawUrl) throw new JmApiSchemaError(`Page ${i} missing imageUrl`)
      const imageUrl = ensureHttps(rawUrl.includes('/') ? rawUrl : `/media/photos/${chapterId}/${rawUrl}`, imageOrigin)
      pages.push({ index: i, imageUrl })
    } else {
      throw new JmApiSchemaError(`Invalid image entry at index ${i}`)
    }
  }

  const result: ChapterPagesResult = { pages, scrambleId }
  const validation = validatePages(result)
  if (!validation.ok) {
    throw new JmApiSchemaError(`Pages validation failed: ${validation.reason}`)
  }

  return result
}
