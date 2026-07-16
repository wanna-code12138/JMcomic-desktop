import { ipcMain } from 'electron'
import { getDatabase, saveDatabase } from './database'
import { clearScraperCache } from './scraperWindow'
import { clearImageCache } from './imageLoader'

export function registerIpcHandlers(): void {
  // Database queries (generic)
  ipcMain.handle('db:run', async (_event, sql: string, params?: unknown[]) => {
    const db = await getDatabase()
    db.run(sql, params)
    saveDatabase()
  })

  ipcMain.handle('db:get', async (_event, sql: string, params?: unknown[]) => {
    const db = await getDatabase()
    const stmt = db.prepare(sql)
    if (params) stmt.bind(params)
    const row = stmt.get()
    stmt.free()
    return row ? toObject(row) : null
  })

  ipcMain.handle('db:all', async (_event, sql: string, params?: unknown[]) => {
    const db = await getDatabase()
    const stmt = db.prepare(sql)
    if (params) stmt.bind(params)
    const rows: unknown[] = []
    while (stmt.step()) {
      rows.push(toObject(stmt.getAsObject()))
    }
    stmt.free()
    return rows
  })

  // Manga cache
  ipcMain.handle('cache:setManga', async (_event, manga: MangaCache) => {
    const db = await getDatabase()
    db.run(
      `INSERT OR REPLACE INTO manga_cache (id, title, author, cover_url, tags, description, chapters_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))`,
      [manga.id, manga.title, manga.author ?? null, manga.coverUrl ?? null,
       manga.tags ? JSON.stringify(manga.tags) : null, manga.description ?? null,
       manga.chapters ? JSON.stringify(manga.chapters) : null]
    )
    saveDatabase()
  })

  ipcMain.handle('cache:getManga', async (_event, id: string) => {
    const db = await getDatabase()
    const row = db.exec(`SELECT * FROM manga_cache WHERE id = '${id.replace(/'/g, "''")}'`)
    // ... would need proper param binding
    return null
  })

  // Favorites
  ipcMain.handle('favorites:add', async (_event, manga: { mangaId: string; title?: string; coverUrl?: string }) => {
    const db = await getDatabase()
    db.run(
      'INSERT OR IGNORE INTO favorites (manga_id, title, cover_url) VALUES (?, ?, ?)',
      [manga.mangaId, manga.title ?? null, manga.coverUrl ?? null]
    )
    saveDatabase()
  })

  ipcMain.handle('favorites:remove', async (_event, mangaId: string) => {
    const db = await getDatabase()
    db.run('DELETE FROM favorites WHERE manga_id = ?', [mangaId])
    saveDatabase()
  })

  ipcMain.handle('favorites:list', async () => {
    const db = await getDatabase()
    const results = db.exec('SELECT * FROM favorites ORDER BY added_at DESC')
    return results.length > 0 ? results[0].values.map((row) => ({
      manga_id: row[1], title: row[2], cover_url: row[3], added_at: row[4]
    })) : []
  })

  // Search history
  ipcMain.handle('searchHistory:add', async (_event, query: string) => {
    const q = (query ?? '').trim()
    if (!q) return
    const db = await getDatabase()
    // UNIQUE(query) 冲突时替换 → 刷新时间戳实现置顶
    db.run(
      'INSERT OR REPLACE INTO search_history (query, searched_at) VALUES (?, strftime(\'%s\',\'now\'))',
      [q]
    )
    // 修剪到 20 条：保留最新 20 条，删除其余
    db.run(
      'DELETE FROM search_history WHERE id NOT IN ' +
      '(SELECT id FROM search_history ORDER BY searched_at DESC LIMIT 20)'
    )
    saveDatabase()
  })

  ipcMain.handle('searchHistory:list', async () => {
    const db = await getDatabase()
    const results = db.exec('SELECT query FROM search_history ORDER BY searched_at DESC LIMIT 20')
    return results.length > 0 ? results[0].values.map((row) => String(row[0])) : []
  })

  ipcMain.handle('searchHistory:remove', async (_event, query: string) => {
    const db = await getDatabase()
    db.run('DELETE FROM search_history WHERE query = ?', [query])
    saveDatabase()
  })

  ipcMain.handle('searchHistory:clear', async () => {
    const db = await getDatabase()
    db.run('DELETE FROM search_history')
    saveDatabase()
  })

  // History (local reading history — one row per manga, UPSERT semantics)
  ipcMain.handle('history:upsert', async (_event, data: {
    manga_id: string; manga_title?: string; chapter_index: number
    chapter_title?: string; chapter_url?: string; cover_url?: string
    page_index: number; total_pages?: number
  }) => {
    const db = await getDatabase()
    db.run(
      `INSERT INTO reading_history
         (manga_id, manga_title, chapter_index, chapter_title, chapter_url, cover_url, page_index, total_pages, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
       ON CONFLICT(manga_id) DO UPDATE SET
         manga_title = excluded.manga_title,
         chapter_index = excluded.chapter_index,
         chapter_title = excluded.chapter_title,
         chapter_url = excluded.chapter_url,
         cover_url = excluded.cover_url,
         page_index = excluded.page_index,
         total_pages = excluded.total_pages,
         read_at = strftime('%s','now')`,
      [data.manga_id, data.manga_title ?? null, data.chapter_index,
       data.chapter_title ?? null, data.chapter_url ?? null, data.cover_url ?? null,
       data.page_index, data.total_pages ?? 0]
    )
    saveDatabase()
  })

  ipcMain.handle('history:upsertPage', async (_event, mangaId: string, pageIndex: number) => {
    const db = await getDatabase()
    db.run(
      `UPDATE reading_history SET page_index = ?, read_at = strftime('%s','now')
       WHERE manga_id = ?`,
      [pageIndex, mangaId]
    )
    saveDatabase()
  })

  ipcMain.handle('history:listLocal', async () => {
    const db = await getDatabase()
    const results = db.exec(
      'SELECT manga_id, manga_title, chapter_index, chapter_title, chapter_url, cover_url, page_index, total_pages, read_at FROM reading_history ORDER BY read_at DESC'
    )
    if (results.length === 0) return []
    const cols = results[0].columns
    return results[0].values.map((row) => {
      const obj: Record<string, unknown> = {}
      cols.forEach((c, i) => { obj[c] = row[i] })
      return obj
    })
  })

  ipcMain.handle('history:getLocal', async (_event, mangaId: string) => {
    const db = await getDatabase()
    const stmt = db.prepare(
      'SELECT manga_id, manga_title, chapter_index, chapter_title, chapter_url, cover_url, page_index, total_pages, read_at FROM reading_history WHERE manga_id = ?'
    )
    stmt.bind([mangaId])
    let row: Record<string, unknown> | null = null
    if (stmt.step()) row = stmt.getAsObject()
    stmt.free()
    return row
  })

  ipcMain.handle('history:removeLocal', async (_event, mangaId: string) => {
    const db = await getDatabase()
    db.run('DELETE FROM reading_history WHERE manga_id = ?', [mangaId])
    saveDatabase()
  })

  ipcMain.handle('history:clearLocal', async () => {
    const db = await getDatabase()
    db.run('DELETE FROM reading_history')
    saveDatabase()
  })

  // Auth
  ipcMain.handle('auth:save', async (_event, key: string, value: string) => {
    const db = await getDatabase()
    db.run('INSERT OR REPLACE INTO auth (key, value) VALUES (?, ?)', [key, value])
    saveDatabase()
  })

  ipcMain.handle('auth:get', async (_event, key: string) => {
    const db = await getDatabase()
    const row = db.exec(`SELECT value FROM auth WHERE key = '${key.replace(/'/g, "''")}'`)
    return row.length > 0 && row[0].values.length > 0 ? row[0].values[0][0] : null
  })

  // Account session (delegated to accountService singleton)
  ipcMain.handle('account:logout', async () => {
    const { accountService } = await import('./accountService')
    await accountService.logout()
  })

  ipcMain.handle('account:getStatus', async () => {
    const { accountService } = await import('./accountService')
    return accountService.getStatus()
  })

  ipcMain.handle('account:validateSession', async () => {
    const { accountService } = await import('./accountService')
    return accountService.validateSession()
  })

  ipcMain.handle('auth:setPersistMode', async (_event, mode: 'cookie' | 'credential') => {
    const { accountService } = await import('./accountService')
    await accountService.setPersistMode(mode)
  })

  // Clear all caches (scraper content cache + image disk cache)
  ipcMain.handle('cache:clearAll', async () => {
    const imgCount = clearImageCache()
    clearScraperCache()
    return { imageFilesRemoved: imgCount }
  })
}

interface MangaCache {
  id: string
  title: string
  author?: string
  coverUrl?: string
  tags?: string[]
  description?: string
  chapters?: ChapterInfo[]
}

interface ChapterInfo {
  index: number
  title: string
  url: string
}

function toObject(row: Record<string, unknown>): Record<string, unknown> {
  return row
}
