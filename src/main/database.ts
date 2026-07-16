import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'

let db: SqlJsDatabase | null = null
const DB_PATH = join(app.getPath('userData'), 'jmcomic.db')

export async function getDatabase(): Promise<SqlJsDatabase> {
  if (db) return db

  const SQL = await initSqlJs()

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
  } else {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    db = new SQL.Database()
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
      read_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (manga_id) REFERENCES manga_cache(id)
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

  // ── reading_history 幂等迁移：补展示列 + 唯一索引 ──
  // sql.js 的 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，需先查列是否存在
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
