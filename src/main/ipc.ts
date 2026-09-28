import { app, dialog, ipcMain } from 'electron'
import { writeFileSync, readFileSync } from 'fs'
import { getDatabase, saveDatabase, scheduleDatabaseSave } from './database'
import { clearScraperCache } from './scraperWindow'
import { clearImageCacheAsync, setImageCacheLimit } from './imageLoader'
import { getSettings, updateSettings } from './settingsStore'
import { applyWindowBackground } from './windowChrome'
import { invalidateLocalImageAllowedRoots } from './localImageProtocol'
import { clearContentCache } from './contentApi'
import {
  exportPersonalData,
  importPersonalData,
  clearPersonalData
} from './personalData'

export function registerIpcHandlers(): void {
  // Favorites
  ipcMain.handle('favorites:add', async (_event, manga: { mangaId: string; title?: string; coverUrl?: string }) => {
    const db = await getDatabase()
    db.run(
      'INSERT OR IGNORE INTO favorites (manga_id, title, cover_url) VALUES (?, ?, ?)',
      [manga.mangaId, manga.title ?? null, manga.coverUrl ?? null]
    )
    await saveDatabase()
  })

  ipcMain.handle('favorites:remove', async (_event, mangaId: string) => {
    const db = await getDatabase()
    db.run('DELETE FROM favorites WHERE manga_id = ?', [mangaId])
    await saveDatabase()
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
    await saveDatabase()
  })

  ipcMain.handle('searchHistory:list', async () => {
    const db = await getDatabase()
    const results = db.exec('SELECT query FROM search_history ORDER BY searched_at DESC LIMIT 20')
    return results.length > 0 ? results[0].values.map((row) => String(row[0])) : []
  })

  ipcMain.handle('searchHistory:remove', async (_event, query: string) => {
    const db = await getDatabase()
    db.run('DELETE FROM search_history WHERE query = ?', [query])
    await saveDatabase()
  })

  ipcMain.handle('searchHistory:clear', async () => {
    const db = await getDatabase()
    db.run('DELETE FROM search_history')
    await saveDatabase()
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
    await saveDatabase()
  })

  ipcMain.handle('history:upsertPage', async (_event, mangaId: string, pageIndex: number) => {
    const db = await getDatabase()
    db.run(
      `UPDATE reading_history SET page_index = ?, read_at = strftime('%s','now')
       WHERE manga_id = ?`,
      [pageIndex, mangaId]
    )
    await saveDatabase()
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
    await saveDatabase()
  })

  ipcMain.handle('history:clearLocal', async () => {
    const db = await getDatabase()
    db.run('DELETE FROM reading_history')
    await saveDatabase()
  })

  // Auth
  ipcMain.handle('auth:save', async (_event, key: string, value: string) => {
    const db = await getDatabase()
    db.run('INSERT OR REPLACE INTO auth (key, value) VALUES (?, ?)', [key, value])
    await saveDatabase()
  })

  ipcMain.handle('auth:get', async (_event, key: string) => {
    const db = await getDatabase()
    const row = db.exec(`SELECT value FROM auth WHERE key = '${key.replace(/'/g, "''")}'`)
    return row.length > 0 && row[0].values.length > 0 ? row[0].values[0][0] : null
  })

  // Clear all caches (scraper content cache + image disk cache)
  ipcMain.handle('cache:clearAll', async () => {
    const imgCount = await clearImageCacheAsync()
    clearScraperCache()
    await clearContentCache()
    return { imageFilesRemoved: imgCount }
  })

  // App info
  ipcMain.handle('app:getVersion', () => app.getVersion())

  // Settings
  ipcMain.handle('settings:get', async () => {
    return getSettings()
  })

  ipcMain.handle('settings:set', async (_event, patch: Record<string, unknown>) => {
    const settings = await updateSettings(patch)
    if (Object.prototype.hasOwnProperty.call(patch, 'downloadDir')) {
      invalidateLocalImageAllowedRoots()
    }
    setImageCacheLimit(settings.cacheLimitMb * 1024 * 1024)
    applyWindowBackground(settings)
    return settings
  })

  // Personal data: export / import / clear
  ipcMain.handle('data:exportPersonal', async () => {
    const db = await getDatabase()
    const payload = exportPersonalData(db)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出个人数据',
      defaultPath: `jmcomic-personal-data-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return { canceled: false, path: filePath }
  })

  ipcMain.handle('data:importPersonal', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '导入个人数据',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (canceled || !filePaths[0]) return { canceled: true }

    let payload: unknown
    try {
      payload = JSON.parse(readFileSync(filePaths[0], 'utf-8'))
    } catch (err) {
      return { canceled: false, error: `文件解析失败: ${err instanceof Error ? err.message : String(err)}` }
    }

    const db = await getDatabase()
    try {
      const result = importPersonalData(db, payload)
      await saveDatabase()
      return { canceled: false, ...result, path: filePaths[0] }
    } catch (err) {
      return { canceled: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('data:clearPersonal', async () => {
    const db = await getDatabase()
    const counts = clearPersonalData(db)
    await saveDatabase()
    return counts
  })
}
