import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { loadModule } from './helpers/loadModule'

test('accepting a download in a custom root invalidates cached local protocol permissions', async () => {
  let invalidated = 0
  const handlers = new Map<string, Function>()
  loadModule('src/main/downloadManager.ts', {
    electron: { app: { getPath: () => resolve('work/default') }, ipcMain: { handle: (name: string, fn: Function) => handlers.set(name, fn) }, BrowserWindow: { getAllWindows: () => [] } },
    './database': { getDatabase: async () => ({ run() {}, exec: (sql: string) => sql.includes('last_insert') ? [{ values: [[1]] }] : [] }), saveDatabase: async () => {}, scheduleDatabaseSave() {} },
    './settingsStore': { getSettings: async () => ({ downloadConcurrency: 0 }) }, './contentApi': {}, './imageLoader': {}, './imageDescrambler': {},
    './localImageProtocol': { invalidateLocalImageAllowedRoots: () => { invalidated++ } }
  })
  const result = await handlers.get('download:add')!({}, { mangaId: '1', mangaTitle: 'Book', chapterIndex: 0, chapterTitle: 'One', imageUrls: [], savePath: resolve('work/custom') })
  assert.equal(result.ok, true)
  assert.equal(invalidated, 1)
})
