import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import {
  getAppDataDir,
  getDatabasePath,
  getLegacyDatabasePath,
  migrateLegacyDatabase
} from './dataPaths'

let db: SqlJsDatabase | null = null
const DB_PATH = getDatabasePath()

export async function getDatabase(): Promise<SqlJsDatabase> {
  if (db) return db

  const SQL = await initSqlJs()

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
  } else {
    // 便携版首次升级：把旧版 userData 里的数据库复制到 exe 旁边
    migrateLegacyDatabase({
      legacyPath: getLegacyDatabasePath(app.getPath('userData')),
      targetPath: DB_PATH
    })
    const dir = getAppDataDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    db = existsSync(DB_PATH)
      ? new SQL.Database(readFileSync(DB_PATH))
      : new SQL.Database()
  }

  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA foreign_keys = ON')

  initTables(db)
  return db
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
    ['total_pages', 'INTEGER DEFAULT 0']
  ]
  for (const [col, type] of newCols) {
    if (!existingCols.has(col)) {
      d.run(`ALTER TABLE reading_history ADD COLUMN ${col} ${type}`)
    }
  }
  d.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_history_manga ON reading_history(manga_id)')
}

export function saveDatabase(): void {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  writeFileSync(DB_PATH, buffer)
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase()
    db.close()
    db = null
  }
}
