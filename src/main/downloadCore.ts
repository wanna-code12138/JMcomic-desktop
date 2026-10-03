import { readdir, stat, open } from 'fs/promises'
import { createHash } from 'crypto'
import { imageMimeType } from '../shared/imageFormat'
import { basename, isAbsolute, join, relative, resolve } from 'path'

/**
 * 下载任务纯逻辑：目录构建、按漫画分组、本地图片 URL 与路径校验。
 * 与 Electron 解耦，便于用 tsx 直接测试。
 */

import type { DownloadTaskRow, DownloadAvailability } from '../shared/downloadContracts'
export type { DownloadTaskRow, DownloadAvailability, DownloadAvailabilityReason, MangaDownloadGroup } from '../shared/downloadContracts'
export { groupTasksByManga } from '../shared/downloadContracts'

/**
 * 把 sql.js 返回的 snake_case 数据库行（manga_id / chapter_url / save_path...）
 * 归一化为代码里统一使用的 camelCase DownloadTaskRow。
 * sql.js 的 db.exec / getAsObject 都以原始列名作为键，直接读取 camelCase
 * 会全部得到 undefined，导致分组、重试、打开文件夹、本地章节等功能失效。
 */
export function normalizeTaskRow(raw: Record<string, unknown>): DownloadTaskRow {
  return {
    id: Number(raw.id ?? 0),
    mangaId: String(raw.manga_id ?? ''),
    mangaTitle: String(raw.manga_title ?? ''),
    chapterIndex: Number(raw.chapter_index ?? 0),
    chapterTitle: String(raw.chapter_title ?? ''),
    status: String(raw.status ?? 'pending'),
    totalPages: Number(raw.total_pages ?? 0),
    downloadedPages: Number(raw.downloaded_pages ?? 0),
    savePath: typeof raw.save_path === 'string' ? raw.save_path : '',
    storageRelpath: typeof raw.storage_relpath === 'string' && raw.storage_relpath ? raw.storage_relpath : undefined,
    createdAt: Number(raw.created_at ?? 0),
    chapterUrl: typeof raw.chapter_url === 'string' && raw.chapter_url
      ? raw.chapter_url
      : undefined,
    coverUrl: typeof raw.cover_url === 'string' && raw.cover_url
      ? raw.cover_url
      : undefined,
    error: typeof raw.error === 'string' && raw.error ? raw.error : undefined
  }
}

/** 筛选可重试的任务（失败/已取消），供任务页"一键重试"批量入队。 */
export function pickRetryableTasks(rows: DownloadTaskRow[]): DownloadTaskRow[] {
  return rows.filter((t) => t.status === 'failed' || t.status === 'cancelled')
}

export function sanitizeFileName(name: string): string {
  const value = name.replace(/\s+/g, ' ').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/, '')
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) ? `_${value}` : value
}

export function isChapterDirectorySafe(root: string, target: string): boolean {
  if (!isAbsolute(root) || !isAbsolute(target)) return false
  const path = relative(resolve(root), resolve(target))
  const parts = path.split(/[\\/]/)
  return !isAbsolute(path) && parts.length === 2 && parts.every((part) => part !== '..' && part !== '.' && part.length > 0)
}

export function buildChapterSaveDir(
  savePath: string,
  mangaTitle: string,
  chapterTitle: string,
  chapterIndex?: number
): string {
  const manga = sanitizeFileName(mangaTitle) || '未命名漫画'
  const chapter = sanitizeFileName(chapterTitle) ||
    (typeof chapterIndex === 'number' ? `第 ${chapterIndex + 1} 話` : '未命名章节')
  return join(savePath, manga, chapter)
}

function base64UrlEncode(s: string): string {
  return Buffer.from(s, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** 把本地绝对路径编码为 jmlocal://img/<base64url>，供渲染进程 <img> 直读。 */
export function toLocalImageUrl(absolutePath: string): string {
  return `jmlocal://img/${base64UrlEncode(absolutePath)}`
}

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i

export function buildStorageRelativePath(mangaId: string, chapterUrl: string | undefined, chapterIndex: number): string {
  const manga = /^\d+$/.test(mangaId) ? mangaId : createHash('sha256').update(mangaId).digest('hex').slice(0, 24)
  const chapter = chapterUrl?.match(/\/(?:photo|chapter)\/(\d+)/)?.[1] ?? `index-${chapterIndex}`
  return join(`manga-${manga}`, `chapter-${chapter}`)
}

export function resolveTaskDirectory(task: Pick<DownloadTaskRow, 'savePath' | 'mangaTitle' | 'chapterTitle' | 'chapterIndex' | 'storageRelpath'>): string {
  const target = task.storageRelpath ? resolve(task.savePath, task.storageRelpath)
    : buildChapterSaveDir(task.savePath, task.mangaTitle, task.chapterTitle, task.chapterIndex)
  if (!isChapterDirectorySafe(task.savePath, target)) throw new Error('下载目录超出允许范围')
  return target
}

export interface ChapterFile { index: number; path: string; format: string }
export interface ChapterInspection {
  available: boolean
  files: ChapterFile[]
  missingIndices: number[]
  duplicateIndices: number[]
}

/** One bounded scanner for resume, local reading, availability and export. */
export async function inspectChapterFiles(saveDir: string, expectedPages = 0): Promise<ChapterInspection> {
  const files = new Map<number, ChapterFile>()
  const duplicates = new Set<number>()
  let names: string[] = []
  try { names = (await readdir(saveDir)).sort() } catch {}
  for (const name of names) {
    const match = name.match(/^(\d+)\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i)
    const ordinal = Number(match?.[1])
    if (!match || ordinal < 1 || (expectedPages > 0 && ordinal > expectedPages)) continue
    const path = join(saveDir, name)
    try {
      if (!(await stat(path)).isFile()) continue
      const file = await open(path, 'r')
      const header = Buffer.alloc(32)
      let bytesRead = 0
      try { bytesRead = (await file.read(header, 0, header.length, 0)).bytesRead }
      finally { await file.close() }
      const mime = imageMimeType(header.subarray(0, bytesRead))
      if (!mime) continue
      const index = ordinal - 1
      if (files.has(index)) duplicates.add(index)
      else files.set(index, { index, path, format: mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] })
    } catch {}
  }
  const ordered = [...files.values()].sort((a, b) => a.index - b.index)
  const total = expectedPages || (ordered.at(-1)?.index ?? -1) + 1
  const missingIndices = Array.from({ length: total }, (_, index) => index).filter(index => !files.has(index))
  return { available: total > 0 && missingIndices.length === 0, files: ordered, missingIndices, duplicateIndices: [...duplicates] }
}

export async function inspectDownloadedChapter(task: DownloadTaskRow): Promise<DownloadAvailability> {
  try {
    if (!task.savePath || !(await stat(task.savePath)).isDirectory()) return { available: false, pageCount: 0, reason: 'missing-root' }
  } catch { return { available: false, pageCount: 0, reason: 'missing-root' } }
  let directory: string
  try {
    directory = resolveTaskDirectory(task)
    if (!(await stat(directory)).isDirectory()) throw new Error('missing')
  } catch { return { available: false, pageCount: 0, reason: 'missing-chapter' } }
  const result = await inspectChapterFiles(directory, task.totalPages)
  return result.available ? { available: true, pageCount: result.files.length }
    : { available: false, pageCount: result.files.length, reason: 'missing-pages' }
}

export async function resolveLocalChapterPagesAsync(saveDir: string): Promise<Array<{ index: number; imageUrl: string }>> {
  return (await inspectChapterFiles(saveDir)).files.map(file => ({ index: file.index, imageUrl: toLocalImageUrl(file.path) }))
}

/**
 * 校验本地图片路径是否安全：必须位于某个允许的下载根目录下，
 * 且层级恰好是 <根>/<漫画>/<章节>/<图片文件>。
 */
export function isLocalImagePathSafe(absolutePath: string, allowedRoots: string[]): boolean {
  if (!isAbsolute(absolutePath)) return false
  if (!IMAGE_EXT_RE.test(basename(absolutePath))) return false
  const resolved = resolve(absolutePath)
  for (const root of allowedRoots) {
    if (!isAbsolute(root)) continue
    const rel = relative(resolve(root), resolved)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue
    const parts = rel.split(/[\\/]/)
    if (parts.length === 3) return true
  }
  return false
}
