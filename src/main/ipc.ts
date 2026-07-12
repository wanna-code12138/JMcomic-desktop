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
