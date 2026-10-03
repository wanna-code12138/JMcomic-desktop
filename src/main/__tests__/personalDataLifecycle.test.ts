import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadModule } from './helpers/loadModule'

test('personal data clear drains download workers and drops their queues before deleting records', async () => {
  const trace: string[] = [], handlers = new Map<string, Function>()
  let release!: () => void
  const worker = new Promise<void>(resolve => { release = resolve })
  const ipc = loadModule<typeof import('../ipc')>('src/main/ipc.ts', {
    electron: { ipcMain: { handle: (name: string, fn: Function) => handlers.set(name, fn) } },
    './database': { getDatabase: async () => ({}), saveDatabase: async () => { trace.push('save') } },
    './scraperWindow': {}, './imageLoader': {}, './settingsStore': {}, './windowChrome': {}, './contentApi': {},
    './localImageProtocol': { invalidateLocalImageAllowedRoots() {} }, './workspacePersistence': {},
    './downloadManager': { stopDownloadManager: async () => { trace.push('stop-images'); await worker }, clearStoppedDownloadQueue: () => trace.push('drop-images'), resumeDownloadManager: () => trace.push('resume-images') },
    './pdfDownloadManager': { stopPdfDownloads: async () => { trace.push('stop-pdf'); await worker }, clearStoppedPdfTasks: async () => { trace.push('drop-pdf') }, resumePdfDownloads: () => trace.push('resume-pdf') },
    './downloadExport': { stopDownloadExports: async () => { trace.push('stop-export'); await worker }, resumeDownloadExports: () => trace.push('resume-export') },
    './personalData': { clearPersonalData: () => { trace.push('clear'); return { downloads: 2 } } }
  })
  ipc.registerIpcHandlers()
  const clearing = handlers.get('data:clearPersonal')!({})
  await new Promise(resolve => setImmediate(resolve)); const clearedTooEarly = trace.includes('clear')
  release(); assert.deepEqual(await clearing, { downloads: 2 })
  assert.equal(clearedTooEarly, false)
  for (const kind of ['images', 'pdf']) assert.ok(trace.indexOf(`drop-${kind}`) < trace.indexOf('clear'))
  assert.ok(trace.indexOf('resume-pdf') > trace.indexOf('save'))
})
