import assert from 'node:assert/strict'
import { test } from 'node:test'
import initSqlJs from 'sql.js'
import { normalizeSettings } from '../settingsCore'
import { useAppStore } from '../../renderer/src/stores/appStore'
import { loadModule } from './helpers/loadModule'

test('reader preferences survive storage strings and reject invalid dimensions', () => {
  const preferences = normalizeSettings({ readerMode: 'single', readerFit: 'height', readerDirection: 'rtl', readerZoom: '1.5', readerMaxWidth: '960', readerAutoHide: 'false' }) as any
  assert.equal(preferences.readerMode, 'single')
  assert.equal(preferences.readerFit, 'height')
  assert.equal(preferences.readerDirection, 'rtl')
  assert.equal(preferences.readerZoom, 1.5)
  assert.equal(preferences.readerMaxWidth, 960)
  assert.equal(preferences.readerAutoHide, false)
  const invalid = normalizeSettings({ readerZoom: Infinity, readerMaxWidth: -1, readerMode: 'bad' }) as any
  assert.equal(invalid.readerZoom, 1)
  assert.equal(invalid.readerMaxWidth, 480)
  assert.equal(invalid.readerMode, 'scroll')
})

test('changing chapters inside the reader preserves the original return destination', () => {
  useAppStore.setState({ currentPage: 'detail' })
  const reader = { mangaId: '1', mangaTitle: 'Book', mangaCoverUrl: '', chapterIndex: 0, chapterTitle: 'One', chapterUrl: 'one' }
  useAppStore.getState().openReader(reader)
  useAppStore.getState().openReader({ ...reader, chapterIndex: 1, chapterUrl: 'two' })
  useAppStore.getState().closeReader()
  assert.equal(useAppStore.getState().currentPage, 'detail')
})

test('history IPC saves in-page offsets and ignores a late previous-chapter update', async () => {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  const schema = loadModule<any>('src/main/database.ts', {
    electron: {}, './dataPaths': { getDatabasePath: () => '' }
  }, 'exports.testInit = initTables;')
  schema.testInit(db)
  const handlers = new Map<string, Function>()
  let scheduled = 0
  const ipc = loadModule<typeof import('../ipc')>('src/main/ipc.ts', {
    electron: { ipcMain: { handle: (name: string, fn: Function) => handlers.set(name, fn) } },
    './database': { getDatabase: async () => db, saveDatabase: async () => {}, scheduleDatabaseSave: () => { scheduled++ } },
    './scraperWindow': {}, './imageLoader': {}, './settingsStore': {}, './windowChrome': {}, './localImageProtocol': {}, './contentApi': {}
  })
  ipc.registerIpcHandlers()
  const call = (name: string, ...args: unknown[]) => handlers.get(name)!(null, ...args)
  try {
    await call('history:upsert', { manga_id: '1', chapter_index: 2, page_index: 4, page_offset: 0.4, total_pages: 20, is_local: 1, reader_session: 'new' })
    await call('history:upsertPage', '1', 15, { chapterIndex: 1, pageOffset: 0.9, session: 'old' })
    let row = await call('history:getLocal', '1')
    assert.equal(row.page_index, 4, 'previous chapter cannot corrupt current progress')
    assert.equal(row.page_offset, 0.4)
    assert.equal(row.is_local, 1)
    await call('history:upsertPage', '1', 6, { chapterIndex: 2, pageOffset: 0.75, session: 'new' })
    row = await call('history:getLocal', '1')
    assert.equal(row.page_index, 6)
    assert.equal(row.page_offset, 0.75)
    assert.equal(scheduled, 1)
  } finally { db.close() }
})
