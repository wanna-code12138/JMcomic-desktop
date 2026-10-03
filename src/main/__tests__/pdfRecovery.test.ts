import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadModule } from './helpers/loadModule'

test('transient PDF startup failure can be retried and cannot permanently prevent normal shutdown', async () => {
  const handlers = new Map<string, Function>()
  let fail = true, attempts = 0
  class Service {
    async init() { attempts++; if (fail) throw Error('startup ENOSPC') }
    async stop() {}
    async add() { return { id: 1 } }
  }
  const manager = loadModule<typeof import('../pdfDownloadManager')>('src/main/pdfDownloadManager.ts', {
    electron: { BrowserWindow: {}, ipcMain: { handle: (name: string, fn: Function) => handlers.set(name, fn) } },
    './database': {}, './settingsStore': {}, './dataPaths': { getAppDataDir: () => 'D:\\unused' },
    './contentApi': {}, './imageLoader': {}, './imageDescrambler': {}, './pdfDownloadService': { PdfDownloadService: Service }
  })
  manager.registerPdfDownloads(); manager.initPdfDownloads()
  await new Promise(resolve => setImmediate(resolve)); fail = false
  await assert.doesNotReject(manager.stopPdfDownloads())
  const result = await handlers.get('download:pdfAdd')!({}, {})
  assert.equal(result.ok, true); assert.equal(attempts, 2)
})
