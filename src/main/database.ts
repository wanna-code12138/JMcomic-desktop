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
