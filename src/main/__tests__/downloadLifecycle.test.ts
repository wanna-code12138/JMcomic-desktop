import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { loadModule } from './helpers/loadModule'

interface ImageResult { url: string; localPath: string | null; cached: boolean; error?: string }
interface LoadOptions { signal?: AbortSignal; onImage?: (image: ImageResult, index: number) => Promise<void> }
async function fixture(run: (f: {
  root: string; raw: string; task: any; progress: any[]; handlers: Map<string, Function>
  download: () => Promise<void>; cancel: () => void
}) => Promise<void>, load: (urls: string[], options: LoadOptions, raw: string) => Promise<ImageResult[]>, descramble?: () => Promise<Buffer>): Promise<void> {
  await mkdir(resolve('work'), { recursive: true })
  const root = await mkdtemp(resolve('work/download-regression-'))
  const raw = join(root, 'source.png')
  await writeFile(raw, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]))
  const handlers = new Map<string, Function>()
  const progress: any[] = []
  const ports = {
    electron: { app: { getPath: () => root }, ipcMain: { handle: (name: string, fn: Function) => handlers.set(name, fn) }, BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { isDestroyed: () => false, send: (_name: string, value: any) => progress.push(value) } }] } },
    './database': { getDatabase: async () => ({ run() {} }), saveDatabase() {}, scheduleDatabaseSave() {} },
    './ioMetrics': { beginIoPerfSpan: () => ({ finish() {} }) },
    './settingsStore': { getSettings: async () => ({ downloadRetries: 0 }) },
    './contentApi': {},
    './imageDescrambler': { descrambleImage: descramble ?? (async (b: Buffer) => b) },
    './imageLoader': { loadImages: (urls: string[], options: LoadOptions) => load(urls, options, raw) }
  }
  const loaded = loadModule<any>('src/main/downloadManager.ts', ports, 'exports.testTask = downloadTask; exports.active = activeDownloads;')
  const task = { id: 1, mangaId: '100', mangaTitle: 'Book', chapterIndex: 0, chapterTitle: 'Chapter', status: 'downloading', totalPages: 2, downloadedPages: 0, savePath: root, imageUrls: ['https://cdn-msp.jmapiproxy1.cc/1.png', 'https://cdn-msp.jmapiproxy1.cc/2.png'], scrambleId: 0, createdAt: 0 }
  try { await run({ root, raw, task, progress, handlers, download: () => loaded.testTask(task), cancel: () => loaded.active.get(1)?.abort() }) }
  finally { await rm(root, { recursive: true, force: true }) }
}

async function deliver(urls: string[], options: LoadOptions, raw: string, failed = -1): Promise<ImageResult[]> {
  const results = urls.map((url, index) => ({ url, cached: false, localPath: index === failed ? null : raw, error: index === failed ? 'network failed' : undefined }))
  for (let i = 0; i < results.length; i++) await options.onImage?.(results[i], i)
  return results
}

test('missing first page cannot be reported as complete even when last page succeeds', async () => {
  await fixture(async ({ task, root, download }) => {
    await download()
    assert.equal(task.status, 'failed')
    assert.equal(task.downloadedPages, 1)
    assert.match(task.error, /1.*2|缺|失败/)
    const files = await readdir(root, { recursive: true })
    assert.equal(files.some((name) => /0002\.png$/.test(name)), true)
    assert.equal(files.some((name) => /0001\.png$/.test(name)), false)
  }, (urls, options, raw) => deliver(urls, options, raw, 0))
})

test('descramble failure does not leave an apparently readable raw page', async () => {
  await fixture(async ({ task, root, download }) => {
    task.scrambleId = 100
    await download()
    assert.equal(task.status, 'failed')
    assert.equal(task.downloadedPages, 0)
    const files = await readdir(root, { recursive: true })
    assert.equal(files.some((name) => /000[12]\./.test(name)), false)
  }, (urls, options, raw) => deliver(urls, options, raw), async () => { throw new Error('canvas decode failed') })
})

test('cancellation reaches image network before it finishes and prevents late output', async () => {
  let seenSignal: AbortSignal | undefined
  let started!: () => void
  let release!: () => void
  const began = new Promise<void>((resolve) => { started = resolve })
  const gate = new Promise<void>((resolve) => { release = resolve })
  await fixture(async ({ task, root, download, cancel }) => {
    const pending = download()
    await began
    cancel()
    const aborted = seenSignal?.aborted
    release()
    await pending
    assert.equal(aborted, true, 'AbortSignal must reach network port')
    assert.equal(task.status, 'cancelled')
    assert.equal(task.downloadedPages, 0)
    assert.equal((await readdir(root, { recursive: true })).some((name) => /000[12]\./.test(name)), false)
  }, async (urls, options, raw) => { seenSignal = options.signal; started(); await gate; return deliver(urls, options, raw) })
})
