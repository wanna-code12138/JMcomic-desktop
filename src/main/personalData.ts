import type { Database as SqlJsDatabase } from 'sql.js'

export const EXPORT_FORMAT = 'jmcomic-personal-data'
export const EXPORT_VERSION = 1

export interface PersonalExport {
  format: string
  version: number
  exportedAt: string
  data: {
    favorites: Array<Record<string, unknown>>
    readingHistory: Array<Record<string, unknown>>
    searchHistory: Array<Record<string, unknown>>
    downloads: Array<Record<string, unknown>>
  }
}

export interface ImportSummary {
  imported: { favorites: number; readingHistory: number; searchHistory: number; downloads: number }
  skipped: number
}

export interface ClearCounts {
  favorites: number
  readingHistory: number
  downloads: number
  auth: number
  searchHistory: number
}

function queryAll(db: SqlJsDatabase, sql: string): Array<Record<string, unknown>> {
  const results = db.exec(sql)
  if (results.length === 0) return []
  const { columns, values } = results[0]
  return values.map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((c, i) => { obj[c] = row[i] })
    return obj
  })
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * 导出个人数据（收藏、阅读历史、搜索历史、下载记录）。
 * 不含 auth（设备绑定的会话凭据）和 manga_cache（内容缓存）。
 */
export function exportPersonalData(db: SqlJsDatabase): PersonalExport {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      favorites: queryAll(db, 'SELECT * FROM favorites ORDER BY added_at DESC'),
      readingHistory: queryAll(db, 'SELECT * FROM reading_history ORDER BY read_at DESC'),
      searchHistory: queryAll(db, 'SELECT * FROM search_history ORDER BY searched_at DESC'),
      downloads: queryAll(db, 'SELECT * FROM downloads ORDER BY created_at DESC')
    }
  }
}

function validatePayload(payload: unknown): asserts payload is PersonalExport {
  if (!isRecord(payload)) throw new Error('导入文件格式不正确')
  if (payload.format !== EXPORT_FORMAT) throw new Error('导入文件格式不正确')
  if (payload.version !== EXPORT_VERSION) throw new Error(`不支持的导入文件版本: ${String(payload.version)}`)
  if (!isRecord(payload.data)) throw new Error('导入文件缺少 data 字段')
}

/**
 * 合并式导入：按各表唯一键 INSERT OR IGNORE —— 本地已有的数据保留，
 * 只补入缺失的记录；损坏的单个条目跳过并计数。
 */
export function importPersonalData(db: SqlJsDatabase, payload: unknown): ImportSummary {
  validatePayload(payload)
  const data = payload.data
  const imported = { favorites: 0, readingHistory: 0, searchHistory: 0, downloads: 0 }
  let skipped = 0

  const favorites = Array.isArray(data.favorites) ? data.favorites : []
  for (const raw of favorites) {
    if (!isRecord(raw)) { skipped++; continue }
    const mangaId = asString(raw.manga_id)
    if (!mangaId) { skipped++; continue }
    db.run(
      'INSERT OR IGNORE INTO favorites (manga_id, title, cover_url, added_at) VALUES (?, ?, ?, ?)',
      [mangaId, asString(raw.title), asString(raw.cover_url), asNumber(raw.added_at)]
    )
    imported.favorites += db.getRowsModified()
  }

  const history = Array.isArray(data.readingHistory) ? data.readingHistory : []
  for (const raw of history) {
    if (!isRecord(raw)) { skipped++; continue }
    const mangaId = asString(raw.manga_id)
    const chapterIndex = asNumber(raw.chapter_index)
    const pageIndex = asNumber(raw.page_index)
    if (!mangaId || chapterIndex === null || pageIndex === null) { skipped++; continue }
    db.run(
      `INSERT OR IGNORE INTO reading_history
         (manga_id, manga_title, chapter_index, chapter_title, chapter_url, cover_url, page_index, total_pages, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [mangaId, asString(raw.manga_title), chapterIndex, asString(raw.chapter_title),
       asString(raw.chapter_url), asString(raw.cover_url), pageIndex, asNumber(raw.total_pages), asNumber(raw.read_at)]
    )
    imported.readingHistory += db.getRowsModified()
  }

  const searchHistory = Array.isArray(data.searchHistory) ? data.searchHistory : []
  for (const raw of searchHistory) {
    if (!isRecord(raw)) { skipped++; continue }
    const query = asString(raw.query)
    if (!query) { skipped++; continue }
    db.run(
      'INSERT OR IGNORE INTO search_history (query, searched_at) VALUES (?, ?)',
      [query, asNumber(raw.searched_at)]
    )
    imported.searchHistory += db.getRowsModified()
  }

  const downloads = Array.isArray(data.downloads) ? data.downloads : []
  for (const raw of downloads) {
    if (!isRecord(raw)) { skipped++; continue }
    const id = asNumber(raw.id)
    const mangaId = asString(raw.manga_id)
    if (id === null || !mangaId) { skipped++; continue }
    // 待下载/下载中的任务在另一台机器上没有意义，导入后标记为失败，
    // 避免应用启动时按旧路径自动续传。
    const status = asString(raw.status) ?? 'failed'
    const safeStatus = status === 'pending' || status === 'downloading' ? 'failed' : status
    db.run(
      `INSERT OR IGNORE INTO downloads
         (id, manga_id, manga_title, chapter_index, chapter_title, status, total_pages, downloaded_pages, save_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, mangaId, asString(raw.manga_title), asNumber(raw.chapter_index), asString(raw.chapter_title),
       safeStatus, asNumber(raw.total_pages), asNumber(raw.downloaded_pages), asString(raw.save_path), asNumber(raw.created_at)]
    )
    imported.downloads += db.getRowsModified()
  }

  return { imported, skipped }
}

/**
 * 清除内部个人数据：清空收藏、阅读历史、下载记录、登录凭据、搜索历史，
 * 保留 manga_cache（内容缓存）。
 */
export function clearPersonalData(db: SqlJsDatabase): ClearCounts {
  const counts: ClearCounts = { favorites: 0, readingHistory: 0, downloads: 0, auth: 0, searchHistory: 0 }
  const tables: Array<keyof ClearCounts> = ['favorites', 'readingHistory', 'downloads', 'auth', 'searchHistory']
  const sqlMap: Record<keyof ClearCounts, string> = {
    favorites: 'DELETE FROM favorites',
    readingHistory: 'DELETE FROM reading_history',
    downloads: 'DELETE FROM downloads',
    auth: 'DELETE FROM auth',
    searchHistory: 'DELETE FROM search_history'
  }
  for (const table of tables) {
    db.run(sqlMap[table])
    counts[table] = db.getRowsModified()
  }
  return counts
}
