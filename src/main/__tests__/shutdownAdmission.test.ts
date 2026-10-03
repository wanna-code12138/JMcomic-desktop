import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadModule } from './helpers/loadModule'

test('shutdown detaches batch metadata and prohibits late or new download insertion', async () => {
  const handlers = new Map<string, Function>()
  let release!: (value: unknown) => void; let begin!: () => void
  const gate = new Promise(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { begin = resolve })
  let inserts = 0
  const database = { run(sql: string) { if (sql.startsWith('INSERT')) inserts++ }, exec: () => [] }
  const manager = loadModule<typeof import('../downloadManager')>('src/main/downloadManager.ts', {
    electron: { app: { getPath: () => 'D:\\unused' }, ipcMain: { handle: (name: string, fn: Function) => handlers.set(name, fn) }, BrowserWindow: { getAllWindows: () => [] } },
    './database': { getDatabase: async () => database, saveDatabase: async () => {}, scheduleDatabaseSave() {} },
    './settingsStore': { getSettings: async () => ({ downloadDir: 'D:\\unused', downloadConcurrency: 1 }) },
    './contentApi': { getPublicChapterPages: () => { begin(); return gate } },
    './imageLoader': {}, './imageDescrambler': {}, './localImageProtocol': { invalidateLocalImageAllowedRoots() {} }
  })
  const pending = handlers.get('download:addChapters')!({}, { mangaId: '1', mangaTitle: 'Book', chapters: [{ index: 0, title: 'One', url: 'chapter' }] })
  await started; await manager.stopDownloadManager()
  const detached = await Promise.race([pending.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 60))])
  release({ pages: [{ imageUrl: 'image' }], scrambleId: 0 }); await pending
  assert.equal(detached, true, 'shutdown cannot wait for shared metadata or resume after it')
  const result = await handlers.get('download:add')!({}, { mangaId: '2', mangaTitle: 'Book', chapterIndex: 0, chapterTitle: 'Two', imageUrls: [] })
  assert.equal(result.ok, false)
  assert.equal(inserts, 0)
})

test('shutdown cancels an export waiting for the save dialog and prevents late writes', async () => {
  const handlers = new Map<string, Function>()
  let choose!: (value: unknown) => void; let begin!: () => void
  const dialog = new Promise(resolve => { choose = resolve })
  const started = new Promise<void>(resolve => { begin = resolve })
  let writes = 0; let leased = false
  const exporting = loadModule<typeof import('../downloadExport')>('src/main/downloadExport.ts', {
    electron: { ipcMain: { handle: (name: string, fn: Function) => handlers.set(name, fn) }, dialog: { showSaveDialog: () => { begin(); return dialog } } },
    './database': { getDatabase: async () => ({ exec: () => [{ columns: ['id'], values: [[1]] }] }) },
    './downloadCore': { normalizeTaskRow: () => ({ status: 'completed', chapterIndex: 0, mangaTitle: 'Book' }), resolveTaskDirectory: () => 'chapter',
      inspectChapterFiles: async () => ({ available: true, files: [{ path: '1.png', index: 0, format: 'png' }] }), sanitizeFileName: (s: string) => s },
    './downloadLeases': { leaseDownloadDirectories: () => { leased = true; return () => { leased = false } } },
    './cbzExport': { writeCbz: async () => { writes++ } }
  })
  exporting.registerDownloadExport()
  const pending = handlers.get('download:exportCbz')!({}, { taskId: 1 })
  await started; await exporting.stopDownloadExports()
  const detached = await Promise.race([pending.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 60))])
  choose({ canceled: false, filePath: 'book.cbz' }); await pending
  assert.equal(detached, true)
  assert.equal(writes, 0)
  assert.equal(leased, false)
  assert.equal((await handlers.get('download:exportCbz')!({}, { taskId: 1 })).ok, false)
})
