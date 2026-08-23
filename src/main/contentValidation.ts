import type { ChapterPagesResult, MangaDetail, MangaListItem } from './types'

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string }

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('https://')
}

export function validateCards(value: unknown): ValidationResult<MangaListItem[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: 'cards-empty' }
  }
  for (const card of value) {
    if (!card || typeof card !== 'object') return { ok: false, reason: 'cards-shape' }
    const item = card as Partial<MangaListItem>
    if (!isNonEmptyString(item.id) || !isNonEmptyString(item.title) || !isHttpsUrl(item.coverUrl)) {
      return { ok: false, reason: 'cards-shape' }
    }
  }
  return { ok: true, data: value as MangaListItem[] }
}

export function validateDetail(value: unknown): ValidationResult<MangaDetail> {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'detail-shape' }
  const detail = value as Partial<MangaDetail>
  if (!isNonEmptyString(detail.title)) return { ok: false, reason: 'detail-title' }
  if (!isNonEmptyString(detail.id) || !isHttpsUrl(detail.coverUrl)) {
    return { ok: false, reason: 'detail-shape' }
  }
  if (!Array.isArray(detail.chapters) || detail.chapters.length === 0) {
    return { ok: false, reason: 'detail-chapters' }
  }
  for (const chapter of detail.chapters) {
    if (
      !chapter ||
      !Number.isInteger(chapter.index) ||
      chapter.index < 0 ||
      !isNonEmptyString(chapter.title) ||
      !isNonEmptyString(chapter.url)
    ) {
      return { ok: false, reason: 'detail-chapters' }
    }
  }
  return { ok: true, data: value as MangaDetail }
}

export function validatePages(value: unknown): ValidationResult<ChapterPagesResult> {
  if (!value || typeof value !== 'object') return { ok: false, reason: 'pages-shape' }
  const result = value as Partial<ChapterPagesResult>
  if (!Number.isInteger(result.scrambleId) || Number(result.scrambleId) < 0) {
    return { ok: false, reason: 'pages-scramble' }
  }
  if (!Array.isArray(result.pages) || result.pages.length === 0) {
    return { ok: false, reason: 'pages-empty' }
  }
  for (let index = 0; index < result.pages.length; index++) {
    const page = result.pages[index]
    if (!page || page.index !== index || !Number.isInteger(page.index)) {
      return { ok: false, reason: 'pages-indices' }
    }
    if (!isHttpsUrl(page.imageUrl)) return { ok: false, reason: 'pages-url' }
  }
  return { ok: true, data: value as ChapterPagesResult }
}
