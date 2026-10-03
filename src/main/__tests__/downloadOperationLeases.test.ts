import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolve } from 'node:path'
import { loadModule } from './helpers/loadModule'
import { leaseDownloadDirectories, isDownloadDirectoryLeased } from '../downloadLeases'

function fixture() {
  const handlers = new Map<string, Function>()
  const root = resolve('work/lease-fixture')
  const rows = [
    { id: 1, manga_id: '1', manga_title: 'Book', chapter_index: 0, chapter_title: 'A', storage_relpath: 'book/a', save_path: root, status: 'downloading' },
    { id: 2, manga_id: '1', manga_title: 'Book', chapter_index: 1, chapter_title: 'B', storage_relpath: 'book/b', save_path: root, status: 'failed' }
  ]
  const db = { exec: () => [{ columns: Object.keys(rows[0]), values: rows.map(row => Object.values(row)) }], run() {} }
  const manager = loadModule<any>('src/main/downloadManager.ts', {
    electron: { app: { getPath: () => root }, ipcMain: { handle: (name: string, fn: Function) => handlers.set(name, fn) }, BrowserWindow: { getAllWindows: () => [] } },
    './database': { getDatabase: async () => db, saveDatabase: async () => {}, scheduleDatabaseSave() {} },
    './settingsStore': { getSettings: async () => ({ downloadConcurrency: 0 }) },
    './contentApi': {}, './imageLoader': {}, './imageDescrambler': {}, './localImageProtocol': { invalidateLocalImageAllowedRoots() {} }
  }, 'exports.running = runningTasks; exports.queue = () => downloadQueue;')
  return { handlers, manager, root }
}

test('remove-manga holds every directory lease while awaiting active cancellation', async () => {
  const { handlers, manager, root } = fixture()
  let release!: () => void
  const running = new Promise<void>(resolve => { release = resolve })
  manager.running.set(1, running)
  const operation = handlers.get('download:removeManga')!({}, '1', false)
  await new Promise(resolve => setTimeout(resolve, 10))
  const protectedWhileWaiting = isDownloadDirectoryLeased(resolve(root, 'book/b'))
  release(); await operation
  assert.equal(protectedWhileWaiting, true)
  assert.equal(isDownloadDirectoryLeased(resolve(root, 'book/b')), false)
})

test('retry-all skips exported directories instead of parking tasks without a wake-up', async () => {
  const { handlers, manager, root } = fixture()
  const release = leaseDownloadDirectories([resolve(root, 'book/b')])
  try {
    const result = await handlers.get('download:retryFailed')!({})
    assert.equal(result.retried, 0)
    assert.equal(manager.queue().length, 0)
  } finally { release() }
})
