import { existsSync, readdirSync, statSync } from 'fs'
import { basename, isAbsolute, join, relative, resolve } from 'path'

/**
 * 下载任务纯逻辑：目录构建、按漫画分组、本地图片 URL 与路径校验。
 * 与 Electron 解耦，便于用 tsx 直接测试。
 */

export interface DownloadTaskRow {
  id: number
  mangaId: string
  mangaTitle: string
  chapterIndex: number
  chapterTitle: string
  status: string
  totalPages: number
  downloadedPages: number
  savePath: string
  createdAt: number
  coverUrl?: string
  chapterUrl?: string
  error?: string
}

export interface MangaDownloadGroup {
  mangaId: string
  mangaTitle: string
  coverUrl: string
  createdAt: number
  tasks: DownloadTaskRow[]
  /** 去重后的章节总数 */
  totalChapters: number
  /** 至少有一个任务完成的章节数 */
  completedChapters: number
  activeTasks: number
  failedTasks: number
}

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
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim()
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

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif|bmp)$/i

/** 扫描章节保存目录，返回按序号排序的本地图片（不存在的目录返回空数组）。 */
export function resolveLocalChapterPages(saveDir: string): Array<{ index: number; url: string }> {
  if (!existsSync(saveDir)) return []
  const names = readdirSync(saveDir).filter((name) => {
    if (!IMAGE_EXT_RE.test(name)) return false
    try {
      return statSync(join(saveDir, name)).isFile()
    } catch {
      return false
    }
  })
  names.sort((a, b) => {
    const na = Number(a.match(/^(\d+)/)?.[1] ?? Infinity)
    const nb = Number(b.match(/^(\d+)/)?.[1] ?? Infinity)
    if (na !== nb) return na - nb
    return a.localeCompare(b)
  })
  return names.map((name, index) => ({
    index,
    url: toLocalImageUrl(join(saveDir, name))
  }))
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

/** 把下载任务行按漫画聚合，输出本地详情页与下载页所需的分组摘要。 */
export function groupTasksByManga(rows: DownloadTaskRow[]): MangaDownloadGroup[] {
  const byManga = new Map<string, MangaDownloadGroup>()
  for (const task of rows) {
    let group = byManga.get(task.mangaId)
    if (!group) {
      group = {
        mangaId: task.mangaId,
        mangaTitle: task.mangaTitle,
        coverUrl: task.coverUrl ?? '',
        createdAt: task.createdAt,
        tasks: [],
        totalChapters: 0,
        completedChapters: 0,
        activeTasks: 0,
        failedTasks: 0
      }
      byManga.set(task.mangaId, group)
    }
    group.tasks.push(task)
    if (task.createdAt > group.createdAt) {
      group.createdAt = task.createdAt
      group.mangaTitle = task.mangaTitle
      if (task.coverUrl) group.coverUrl = task.coverUrl
    }
  }

  const groups = [...byManga.values()]
  for (const group of groups) {
    group.tasks.sort((a, b) => a.chapterIndex - b.chapterIndex || a.id - b.id)
    const chapterStatus = new Map<number, Set<string>>()
    for (const task of group.tasks) {
      let statuses = chapterStatus.get(task.chapterIndex)
      if (!statuses) {
        statuses = new Set()
        chapterStatus.set(task.chapterIndex, statuses)
      }
      statuses.add(task.status)
      if (task.status === 'pending' || task.status === 'downloading') group.activeTasks++
      if (task.status === 'failed' || task.status === 'cancelled') group.failedTasks++
    }
    group.totalChapters = chapterStatus.size
    group.completedChapters = [...chapterStatus.values()].filter((s) => s.has('completed')).length
  }

  groups.sort((a, b) => b.createdAt - a.createdAt)
  return groups
}
