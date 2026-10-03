import assert from 'assert'
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import {
  exportPersonalData,
  importPersonalData,
  clearPersonalData,
  EXPORT_FORMAT
} from '../personalData'

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`  PASS: ${name}`)
  } catch (err) {
    console.log(`  FAIL: ${name}`)
    console.log(`        ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null

async function createDb(): Promise<SqlJsDatabase> {
  if (!SQL) SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE manga_cache (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `)
  db.run(`
    CREATE TABLE reading_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manga_id TEXT NOT NULL UNIQUE,
      manga_title TEXT,
      chapter_index INTEGER NOT NULL,
      chapter_title TEXT,
      chapter_url TEXT,
      cover_url TEXT,
      page_index INTEGER NOT NULL,
      total_pages INTEGER DEFAULT 0,
      page_offset REAL DEFAULT 0,
      is_local INTEGER DEFAULT 0,
      read_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `)
  db.run(`
    CREATE TABLE downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manga_id TEXT NOT NULL,
      manga_title TEXT,
      chapter_index INTEGER,
      chapter_title TEXT,
      chapter_url TEXT,
      cover_url TEXT,
      status TEXT DEFAULT 'pending',
      total_pages INTEGER DEFAULT 0,
      downloaded_pages INTEGER DEFAULT 0,
      save_path TEXT,
      storage_relpath TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `)
  db.run(`
    CREATE TABLE favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manga_id TEXT NOT NULL UNIQUE,
      title TEXT,
      cover_url TEXT,
      added_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `)
  db.run('CREATE TABLE auth (key TEXT PRIMARY KEY, value TEXT)')
  db.run('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  db.run('CREATE TABLE pdf_downloads (id INTEGER PRIMARY KEY AUTOINCREMENT, manga_id TEXT, identity TEXT, status TEXT, payload_json TEXT)')
  db.run(`
    CREATE TABLE search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL UNIQUE,
      searched_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `)
  return db
}

function seedPersonalData(db: SqlJsDatabase): void {
  db.run(`INSERT INTO favorites (manga_id, title, cover_url, added_at) VALUES ('m1', '收藏一', 'https://cdn/x.jpg', 1000)`)
  db.run(`INSERT INTO reading_history (manga_id, manga_title, chapter_index, chapter_title, page_index, total_pages, read_at)
          VALUES ('m1', '历史一', 2, '第3话', 5, 20, 2000)`)
  db.run(`INSERT INTO search_history (query, searched_at) VALUES ('搜索词', 3000)`)
  db.run(`INSERT INTO downloads (id, manga_id, manga_title, chapter_index, chapter_title, status, total_pages, downloaded_pages, save_path, created_at)
          VALUES (1, 'm1', '下载一', 0, '第1话', 'completed', 10, 10, 'C:\\Downloads', 4000)`)
  db.run(`INSERT INTO auth (key, value) VALUES ('session', 'secret')`)
  db.run(`INSERT INTO manga_cache (id, title) VALUES ('m1', '缓存条目')`)
}

function countRows(db: SqlJsDatabase, table: string): number {
  const res = db.exec(`SELECT COUNT(*) FROM ${table}`)
  return Number(res[0].values[0][0])
}

function emptyPayload(): Record<string, unknown> {
  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: '2026-08-02T00:00:00.000Z',
    data: {
      favorites: [],
      readingHistory: [],
      searchHistory: [],
      downloads: []
    }
  }
}

async function run(): Promise<void> {
  await test('PDF manifests and tab metadata survive backup; unfinished imports stay dormant and clear removes them', async () => {
    const db = await createDb(), restored = await createDb()
    const pdf = { kind: 'pdf', id: 7, mangaId: '123', mangaTitle: 'Book', chapters: [{ index: 0, title: 'One', url: '/photo/123' }],
      identity: 'old', stagingId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status: 'merging', totalPages: 2, downloadedPages: 2,
      mergedPages: 1, savePath: 'C:\\Downloads', outputFile: 'Book.pdf', createdAt: 100 }
    db.run('INSERT INTO pdf_downloads(manga_id,identity,status,payload_json) VALUES (?,?,?,?)', ['123', 'old', 'merging', JSON.stringify(pdf)])
    db.run('INSERT INTO settings(key,value) VALUES (?,?)', ['readerWorkspaceSnapshot', JSON.stringify({ version: 1, tabs: [{ id: 'start:1', kind: 'start', pinned: false }], activeId: 'start:1' })])
    const payload = exportPersonalData(db) as any
    assert.equal(payload.data.pdfDownloads.length, 1)
    assert.equal(payload.data.workspace.tabs[0].id, 'start:1')
    importPersonalData(restored, payload)
    const [status, raw] = restored.exec('SELECT status,payload_json FROM pdf_downloads')[0].values[0]
    const imported = JSON.parse(String(raw))
    assert.equal(status, 'failed'); assert.equal(imported.chapters.length, 1)
    assert.notEqual(imported.stagingId, pdf.stagingId, 'foreign staging cannot alias a live task')
    importPersonalData(restored, payload)
    assert.equal(countRows(restored, 'pdf_downloads'), 1)
    const counts = clearPersonalData(restored)
    assert.equal(counts.downloads, 1); assert.equal(countRows(restored, 'pdf_downloads'), 0)
    assert.equal(restored.exec("SELECT value FROM settings WHERE key='readerWorkspaceSnapshot'").length, 0)
    db.close(); restored.close()
  })
  await test('cross-device task ids do not collide and reading offset/local source survive import', async () => {
    const db = await createDb()
    seedPersonalData(db)
    const payload = emptyPayload()
    payload.data = {
      favorites: [], searchHistory: [],
      readingHistory: [{ manga_id: 'm2', chapter_index: 1, page_index: 2, page_offset: 0.45, is_local: 1 }],
      downloads: [{ id: 1, manga_id: 'm2', chapter_index: 1, chapter_url: '/photo/203', status: 'completed', storage_relpath: 'manga-m2/chapter-203' }]
    }
    importPersonalData(db, payload)
    assert.equal(countRows(db, 'downloads'), 2)
    assert.deepStrictEqual(db.exec("SELECT page_offset, is_local FROM reading_history WHERE manga_id='m2'")[0].values[0], [0.45, 1])
    assert.equal(db.exec("SELECT storage_relpath FROM downloads WHERE manga_id='m2'")[0].values[0][0], 'manga-m2/chapter-203')
    importPersonalData(db, payload)
    assert.equal(countRows(db, 'downloads'), 2, 'reimport is idempotent')
    db.close()
  })
  // ─── exportPersonalData ──────────────────────────────────────────

  await test('exportPersonalData returns format marker and version', async () => {
    const db = await createDb()
    const payload = exportPersonalData(db)
    assert.strictEqual(payload.format, EXPORT_FORMAT)
    assert.strictEqual(payload.version, 1)
    assert.strictEqual(payload.data.favorites.length, 0)
  })

  await test('exportPersonalData includes favorites/history/search/downloads and excludes auth/cache', async () => {
    const db = await createDb()
    seedPersonalData(db)
    const payload = exportPersonalData(db)
    assert.strictEqual(payload.format, EXPORT_FORMAT)
    assert.strictEqual(payload.version, 1)
    assert.strictEqual(payload.data.favorites.length, 1)
    assert.strictEqual(payload.data.favorites[0].manga_id, 'm1')
    assert.strictEqual(payload.data.readingHistory.length, 1)
    assert.strictEqual(payload.data.readingHistory[0].chapter_title, '第3话')
    assert.strictEqual(payload.data.searchHistory.length, 1)
    assert.strictEqual(payload.data.searchHistory[0].query, '搜索词')
    assert.strictEqual(payload.data.downloads.length, 1)
    assert.strictEqual(payload.data.downloads[0].status, 'completed')
    const json = JSON.stringify(payload)
    assert.ok(!json.includes('session'))
    assert.ok(!json.includes('缓存条目'))
  })

  // ─── importPersonalData ──────────────────────────────────────────

  await test('importPersonalData inserts into empty db and reports counts', async () => {
    const db = await createDb()
    const payload = emptyPayload()
    payload.data = {
      favorites: [{ manga_id: 'm1', title: '收藏一', cover_url: 'u', added_at: 100 }],
      readingHistory: [{ manga_id: 'm1', manga_title: '历史一', chapter_index: 1, page_index: 2, read_at: 200 }],
      searchHistory: [{ query: '搜索词', searched_at: 300 }],
      downloads: [{ id: 9, manga_id: 'm1', status: 'completed', total_pages: 5, downloaded_pages: 5, save_path: 'C:\\x', created_at: 400 }]
    }
    const result = importPersonalData(db, payload)
    assert.deepStrictEqual(result.imported, { favorites: 1, readingHistory: 1, searchHistory: 1, downloads: 1 })
    assert.strictEqual(result.skipped, 0)
    assert.strictEqual(countRows(db, 'favorites'), 1)
    assert.strictEqual(countRows(db, 'reading_history'), 1)
    assert.strictEqual(countRows(db, 'search_history'), 1)
    assert.strictEqual(countRows(db, 'downloads'), 1)
    assert.strictEqual(countRows(db, 'auth'), 0)
  })

  await test('importPersonalData merges: existing rows are kept, not overwritten', async () => {
    const db = await createDb()
    seedPersonalData(db)
    const payload = emptyPayload()
    payload.data = {
      favorites: [
        { manga_id: 'm1', title: '被覆盖的标题', cover_url: 'evil', added_at: 999 },
        { manga_id: 'm2', title: '新收藏', cover_url: 'new', added_at: 111 }
      ],
      readingHistory: [{ manga_id: 'm1', manga_title: '被覆盖', chapter_index: 99, page_index: 99, read_at: 999 }],
      searchHistory: [{ query: '搜索词', searched_at: 999 }],
      downloads: [{ id: 1, manga_id: 'm1', status: 'failed', total_pages: 0, downloaded_pages: 0, save_path: 'C:\\evil', created_at: 999 }]
    }
    const result = importPersonalData(db, payload)
    assert.deepStrictEqual(result.imported, { favorites: 1, readingHistory: 0, searchHistory: 0, downloads: 0 })
    const fav = db.exec(`SELECT title FROM favorites WHERE manga_id = 'm1'`)
    assert.strictEqual(fav[0].values[0][0], '收藏一')
    const hist = db.exec(`SELECT manga_title FROM reading_history WHERE manga_id = 'm1'`)
    assert.strictEqual(hist[0].values[0][0], '历史一')
    assert.strictEqual(countRows(db, 'favorites'), 2)
  })

  await test('importPersonalData converts pending/downloading downloads to failed', async () => {
    const db = await createDb()
    const payload = emptyPayload()
    payload.data = {
      favorites: [],
      readingHistory: [],
      searchHistory: [],
      downloads: [
        { id: 1, manga_id: 'm1', status: 'pending', total_pages: 3, downloaded_pages: 0, save_path: 'C:\\old', created_at: 1 },
        { id: 2, manga_id: 'm2', status: 'downloading', total_pages: 3, downloaded_pages: 1, save_path: 'C:\\old', created_at: 2 }
      ]
    }
    importPersonalData(db, payload)
    const rows = db.exec(`SELECT id, status FROM downloads ORDER BY id`)
    assert.deepStrictEqual(rows[0].values, [[1, 'failed'], [2, 'failed']])
  })

  await test('importPersonalData rejects unknown format', async () => {
    const db = await createDb()
    assert.throws(() => importPersonalData(db, { format: 'other', version: 1, data: {} }), /格式|format/i)
  })

  await test('importPersonalData skips malformed rows', async () => {
    const db = await createDb()
    const payload = emptyPayload()
    payload.data = {
      favorites: [
        { manga_id: '', title: '无ID' },
        { title: '缺ID' },
        { manga_id: 'ok', title: '有效' }
      ],
      readingHistory: [
        { manga_id: 'h1' },
        { manga_id: 'h2', chapter_index: 'x', page_index: 0 }
      ],
      searchHistory: [{ query: '' }],
      downloads: [{ id: 'not-number', manga_id: 'd1' }]
    }
    const result = importPersonalData(db, payload)
    assert.strictEqual(result.imported.favorites, 1)
    assert.strictEqual(result.imported.readingHistory, 0)
    assert.strictEqual(result.imported.searchHistory, 0)
    assert.strictEqual(result.imported.downloads, 0)
    assert.strictEqual(result.skipped, 6)
  })

  // ─── clearPersonalData ───────────────────────────────────────────

  await test('clearPersonalData wipes personal tables but keeps manga_cache', async () => {
    const db = await createDb()
    seedPersonalData(db)
    const counts = clearPersonalData(db)
    assert.deepStrictEqual(counts, { favorites: 1, readingHistory: 1, downloads: 1, auth: 1, searchHistory: 1 })
    assert.strictEqual(countRows(db, 'favorites'), 0)
    assert.strictEqual(countRows(db, 'reading_history'), 0)
    assert.strictEqual(countRows(db, 'downloads'), 0)
    assert.strictEqual(countRows(db, 'auth'), 0)
    assert.strictEqual(countRows(db, 'search_history'), 0)
    assert.strictEqual(countRows(db, 'manga_cache'), 1)
  })

  await test('clearPersonalData reports zero when already empty', async () => {
    const db = await createDb()
    const counts = clearPersonalData(db)
    assert.deepStrictEqual(counts, { favorites: 0, readingHistory: 0, downloads: 0, auth: 0, searchHistory: 0 })
  })

  console.log('\nAll tests completed.')
  if (process.exitCode) {
    console.log('Some tests failed.')
  } else {
    console.log('All tests passed!')
  }
}

void run()
