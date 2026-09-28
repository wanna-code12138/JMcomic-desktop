import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { open, copyFile, rename, unlink } from 'fs/promises'
import {
  getAppDataDir,
  getDatabasePath,
  getLegacyDatabasePath,
  migrateLegacyDatabase
} from './dataPaths'
import { beginMainPerfSpan } from './performanceTrace'
import { beginIoPerfSpan } from './ioMetrics'
import {
  createDatabaseWriteCoordinator,
  type DatabaseScheduleReason,
  type DatabaseWriteCoordinator
} from './databaseWriteCoordinator'

let db: SqlJsDatabase | null = null
let initializing: Promise<SqlJsDatabase> | null = null
const DB_PATH = getDatabasePath()
let recoveryNotice = ''

export function getDatabaseRecoveryNotice(): string { return recoveryNotice }

export async function getDatabase(): Promise<SqlJsDatabase> {
  if (db) return db
  if (!initializing) initializing = initializeDatabase().finally(() => { initializing = null })
  return initializing
}

async function initializeDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs()
  if (!existsSync(DB_PATH) && !existsSync(`${DB_PATH}.bak`)) {
    // 便携版首次升级：把旧版 userData 里的数据库复制到 exe 旁边
    migrateLegacyDatabase({
      legacyPath: getLegacyDatabasePath(app.getPath('userData')),
      targetPath: DB_PATH
    })
    const dir = getAppDataDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
  const loadVerified = (path: string): SqlJsDatabase => {
    const bytes = readFileSync(path)
    if (bytes.length < 100 || bytes.subarray(0, 16).toString() !== 'SQLite format 3\u0000') throw new Error('数据库文件头损坏')
    const candidate = new SQL.Database(bytes)
    try {
      if (candidate.exec('PRAGMA quick_check')[0]?.values[0]?.[0] !== 'ok') throw new Error('数据库完整性检查失败')
      return candidate
    } catch (error) { candidate.close(); throw error }
  }
  let candidate: SqlJsDatabase
  let recovered = false
  if (existsSync(DB_PATH) || existsSync(`${DB_PATH}.bak`)) {
    try { candidate = loadVerified(DB_PATH) }
    catch {
      try { candidate = loadVerified(`${DB_PATH}.bak`); recovered = true }
      catch { throw new Error(`数据库与备份无法读取，原文件已保留。请从个人数据备份恢复：${DB_PATH}`) }
    }
  } else candidate = new SQL.Database()
  try {
    candidate.run('PRAGMA foreign_keys = ON')
    candidate.run('BEGIN')
    initTables(candidate)
    candidate.run('COMMIT')
    if (recovered) {
      const preserved = `${DB_PATH}.corrupt-${Date.now()}`
      if (existsSync(DB_PATH)) await copyFile(DB_PATH, preserved)
      const temporary = `${DB_PATH}.recovery.tmp`
      try {
        const file = await open(temporary, 'w')
        try { await file.writeFile(Buffer.from(candidate.export())); await file.sync() }
        finally { await file.close() }
        await rename(temporary, DB_PATH)
      } finally { await unlink(temporary).catch(() => {}) }
      recoveryNotice = `已从上一次完整备份恢复数据库。损坏的原文件已保留在 ${preserved}`
    }
    db = candidate
    return candidate
  } catch (error) { candidate.close(); throw error }
}

function initTables(d: SqlJsDatabase): void {
  d.run(`
    CREATE TABLE IF NOT EXISTS manga_cache (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      cover_url TEXT,
      tags TEXT,
      description TEXT,
      chapters_json TEXT,
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `)

  d.run(`
    CREATE TABLE IF NOT EXISTS reading_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manga_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      page_index INTEGER NOT NULL,
      read_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `)

  d.run(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manga_id TEXT NOT NULL,
      manga_title TEXT,
      chapter_index INTEGER,
      chapter_title TEXT,
      chapter_url TEXT,
      cover_url TEXT,
      error TEXT,
      status TEXT DEFAULT 'pending',
      total_pages INTEGER DEFAULT 0,
      downloaded_pages INTEGER DEFAULT 0,
      save_path TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `)

  d.run(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manga_id TEXT NOT NULL UNIQUE,
      title TEXT,
      cover_url TEXT,
      added_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `)

  d.run(`
    CREATE TABLE IF NOT EXISTS auth (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)

  d.run(`
    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL UNIQUE,
      searched_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `)

  d.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // ── reading_history 迁移：移除对 manga_cache 的外键 + 补展示列 + 唯一索引 ──
  // 原始 schema 含 FOREIGN KEY (manga_id) REFERENCES manga_cache(id)，
  // 但 manga_cache 从未被写入，导致 PRAGMA foreign_keys=ON 时所有 INSERT 失败。
  // 该表此前从未成功写入过任何行（FK 从首版本就存在），故重建是安全的。
  const fkList = d.exec('PRAGMA foreign_key_list(reading_history)')
  if (fkList.length > 0) {
    // 表有 FK → 重建为无 FK 版本（sql.js 的 ALTER TABLE 不支持 DROP CONSTRAINT）
    d.run('ALTER TABLE reading_history RENAME TO reading_history_old')
    d.run(`
      CREATE TABLE reading_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        manga_id TEXT NOT NULL,
        chapter_index INTEGER NOT NULL,
        page_index INTEGER NOT NULL,
        read_at INTEGER DEFAULT (strftime('%s','now'))
      )
    `)
    d.run('INSERT INTO reading_history (id, manga_id, chapter_index, page_index, read_at) SELECT id, manga_id, chapter_index, page_index, read_at FROM reading_history_old')
    d.run('DROP TABLE reading_history_old')
  }

  // 补展示列（sql.js ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，先查列是否存在）
  const historyCols = d.exec('PRAGMA table_info(reading_history)')
  const existingCols = new Set(
    historyCols.length > 0 ? historyCols[0].values.map((r) => String(r[1])) : []
  )
  const newCols: Array<[string, string]> = [
    ['manga_title', 'TEXT'],
    ['chapter_title', 'TEXT'],
    ['chapter_url', 'TEXT'],
    ['cover_url', 'TEXT'],
    ['total_pages', 'INTEGER DEFAULT 0'],
    ['page_offset', 'REAL DEFAULT 0'],
    ['is_local', 'INTEGER DEFAULT 0'],
    ['reader_session', 'TEXT']
  ]
  for (const [col, type] of newCols) {
    if (!existingCols.has(col)) {
      d.run(`ALTER TABLE reading_history ADD COLUMN ${col} ${type}`)
    }
  }
  d.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_history_manga ON reading_history(manga_id)')

  // downloads 迁移：补展示/续传所需的 chapter_url、cover_url 列
  const downloadCols = d.exec('PRAGMA table_info(downloads)')
  const existingDownloadCols = new Set(
    downloadCols.length > 0 ? downloadCols[0].values.map((r) => String(r[1])) : []
  )
  const newDownloadCols: Array<[string, string]> = [
    ['storage_relpath', 'TEXT'],
    ['chapter_url', 'TEXT'],
    ['cover_url', 'TEXT'],
    ['error', 'TEXT']
  ]
  for (const [col, type] of newDownloadCols) {
    if (!existingDownloadCols.has(col)) {
      d.run(`ALTER TABLE downloads ADD COLUMN ${col} ${type}`)
    }
  }
}

export const databaseCoordinator: DatabaseWriteCoordinator = createDatabaseWriteCoordinator({
  debounceMs: 100,
  writer: async () => {
    await saveDatabaseNow()
  }
})

async function saveDatabaseNow(): Promise<void> {
  if (!db) return
  const perf = beginMainPerfSpan('database.save')
  const perfFlush = beginIoPerfSpan('database.flush')
  try {
    const data = db.export()
    const buffer = Buffer.from(data)
    const temporary = `${DB_PATH}.tmp`
    try {
      const file = await open(temporary, 'w')
      try {
        await file.writeFile(buffer)
        await file.sync()
      } finally {
        await file.close()
      }
      await copyFile(DB_PATH, `${DB_PATH}.bak`).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
      await rename(temporary, DB_PATH)
    } finally {
      await unlink(temporary).catch(() => {})
    }
    perf.finish('ok', { bytes: buffer.length })
    perfFlush.finish('ok', { bytes: buffer.length })
  } catch (err) {
    perf.finish('error')
    perfFlush.finish('error')
    throw err
  }
}

export function scheduleDatabaseSave(reason: DatabaseScheduleReason = 'history'): void {
  databaseCoordinator.schedule(reason)
}

export async function saveDatabase(): Promise<void> {
  databaseCoordinator.schedule('settings')
  await databaseCoordinator.flush()
}

export async function closeDatabase(timeoutMs = 2000): Promise<void> {
  if (db) {
    const result = await databaseCoordinator.close(timeoutMs)
    if (result === 'timeout') throw new Error('数据库保存超时，尚未关闭数据库')
    db.close()
    db = null
  }
}
