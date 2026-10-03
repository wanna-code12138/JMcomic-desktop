import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { loadModule } from './helpers/loadModule'

test('images without filename extensions remain cacheable, and corrupted entries miss', async () => {
  await mkdir(resolve('work'), { recursive: true })
  const root = await mkdtemp(resolve('work/image-loader-'))
  const loader = loadModule<typeof import('../imageLoader')>('src/main/imageLoader.ts', {
    electron: { ipcMain: { handle() {} } }, './dataPaths': { getAppDataDir: () => root },
    './imageNetwork': {}, './ioMetrics': { beginIoPerfSpan: () => ({ finish() {} }) }
  })
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1])
  const url = 'https://cdn-msp.jmapiproxy1.cc/asset?id=5'
  try {
    const path = await loader.storeImage(url, bytes, 'image/png')
    await loader.scheduleCacheMaintenance()
    assert.deepEqual((await loader.readCachedImage(url))?.buffer, bytes)
    await writeFile(path, 'not an image')
    assert.equal(await loader.readCachedImage(url), null)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('download workers deliver each page before completion in stable input order, even when cache cannot store', async () => {
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1])
  let releaseFirst!: () => void
  const secondDelivered = new Promise<void>(resolve => { releaseFirst = resolve })
  const loader = loadModule<typeof import('../imageLoader')>('src/main/imageLoader.ts', {
    electron: { ipcMain: { handle() {} } }, './dataPaths': { getAppDataDir: () => resolve('work/nonexistent-image-cache') },
    './ioMetrics': { beginIoPerfSpan: () => ({ finish() {} }) },
    './imageNetwork': { requestImage: async (url: string) => {
      if (url === 'first') await secondDelivered
      return { status: 200, bytes: bytes.length, done: Promise.resolve(), takeStream: () => new Response(bytes).body! }
    } }
  })
  const delivered: number[] = []
  const results = await loader.loadImages(['first', 'second'], { maxRetries: 0, onImage: async (result, index) => {
    assert.deepEqual((result as any).buffer, bytes)
    delivered.push(index)
    if (index === 1) releaseFirst()
  } })
  assert.deepEqual(delivered, [1, 0])
  assert.deepEqual(results.map((r) => r.url), ['first', 'second'])
  assert.ok(results.every((r) => !r.error))
})

test('cache eviction and clear leave in-flight atomic writes untouched', async () => {
  await mkdir(resolve('work'), { recursive: true })
  const root = await mkdtemp(resolve('work/cache-write-'))
  const loader = loadModule<typeof import('../imageLoader')>('src/main/imageLoader.ts', {
    electron: { ipcMain: { handle() {} } }, './dataPaths': { getAppDataDir: () => root },
    './imageNetwork': {}, './ioMetrics': { beginIoPerfSpan: () => ({ finish() {} }) }
  })
  try {
    const dir = join(root, 'jmcomic-images'); await mkdir(dir)
    const temporary = join(dir, 'active.png.123.1.tmp')
    await writeFile(temporary, 'unfinished write')
    loader.setImageCacheLimit(1)
    await loader.scheduleCacheMaintenance()
    await loader.clearImageCacheAsync()
    assert.equal(await readFile(temporary, 'utf8'), 'unfinished write')
  } finally { await rm(root, { recursive: true, force: true }) }
})
