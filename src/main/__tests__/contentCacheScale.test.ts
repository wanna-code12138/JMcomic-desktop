import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createContentCache } from '../contentCache'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolvePromise = res
  })
  return { promise, resolve: resolvePromise }
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`  PASS: ${name}`)
  } catch (err) {
    console.log(`  FAIL: ${name}`)
    console.log(err)
    process.exitCode = 1
  }
}

async function withCacheDir(fn: (filePath: string) => Promise<void>): Promise<void> {
  const workDir = resolve(process.cwd(), 'work')
  await mkdir(workDir, { recursive: true })
  const dir = await mkdtemp(join(workDir, 'cache-scale-test-'))
  try {
    await fn(join(dir, 'cache.json'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const valid = (val: unknown): val is { id: number } =>
  Boolean(val && typeof val === 'object' && typeof (val as { id?: unknown }).id === 'number')

async function main(): Promise<void> {
  // 1. LRU 容量上限与淘汰测试
  await test('evicts least recently accessed entries when exceeding maxEntries', async () => {
    await withCacheDir(async (filePath) => {
      let currentTime = 1000
      const cache = createContentCache({
        filePath,
        maxEntries: 10,
        now: () => currentTime++
      })

      // 填充 10 条数据 (0..9)
      for (let i = 0; i < 10; i++) {
        await cache.resolve(`item:${i}`, async () => ({ id: i }), valid)
      }

      // 访问 item:0，将其 lastAccessedAt 刷新到最新
      await cache.resolve(`item:0`, async () => ({ id: 0 }), valid)

      // 写入第 11 条数据 item:10，触发容量淘汰
      await cache.resolve(`item:10`, async () => ({ id: 10 }), valid)
      await cache.waitForIdle()

      // item:1 是最旧未访问的，应该被淘汰；而 item:0 被刷新过，应依然在缓存中
      let item1Calls = 0
      const item1 = await cache.resolve(`item:1`, async () => { item1Calls++; return { id: 1 } }, valid)
      assert.equal(item1.state, 'miss')
      assert.equal(item1Calls, 1)

      let item0Calls = 0
      const item0 = await cache.resolve(`item:0`, async () => { item0Calls++; return { id: 0 } }, valid)
      assert.equal(item0.state, 'fresh')
      assert.equal(item0Calls, 0)
    })
  })

  // 2. 合并 Flush 批处理测试
  await test('coalesces rapid consecutive writes within flushDelayMs into minimal flushes', async () => {
    await withCacheDir(async (filePath) => {
      let currentTime = 1000
      const cache = createContentCache({
        filePath,
        flushDelayMs: 50,
        now: () => currentTime++
      })

      // 连续写入 20 个不同 key
      for (let i = 0; i < 20; i++) {
        void cache.resolve(`rapid:${i}`, async () => ({ id: i }), valid)
      }

      await cache.waitForIdle()
      const content = JSON.parse(await readFile(filePath, 'utf-8')) as { entries: Record<string, unknown> }
      assert.equal(Object.keys(content.entries).length, 20)
    })
  })

  // 3. Clear 与旧在途任务竞态隔离
  await test('clear invalidates in-flight refreshes and prevents stale persistence', async () => {
    await withCacheDir(async (filePath) => {
      let currentTime = 1000
      const pending = deferred<{ id: number }>()
      const cache = createContentCache({
        filePath,
        now: () => currentTime++
      })

      // 启动一个未完成的 resolve
      const inFlightPromise = cache.resolve('slow:1', () => pending.promise, valid)

      // 立即执行 clear
      await cache.clear()

      // 在途任务完成
      pending.resolve({ id: 999 })
      await inFlightPromise.catch(() => {})
      await cache.waitForIdle()

      // 确认 clear 后文件不存在或未被旧 generation 污染
      await assert.rejects(readFile(filePath, 'utf-8'), { code: 'ENOENT' })

      // 再次查询应为 miss
      let calls = 0
      const fresh = await cache.resolve('slow:1', async () => { calls++; return { id: 1 } }, valid)
      assert.equal(fresh.state, 'miss')
      assert.equal(calls, 1)
    })
  })

  // 4. Namespace 隔离测试
  await test('rejects disk entries with mismatched namespace', async () => {
    await withCacheDir(async (filePath) => {
      // 预先写入一个旧 namespace 的数据
      await writeFile(
        filePath,
        JSON.stringify({
          version: 1,
          namespace: 'legacy-v1',
          entries: { 'item:1': { savedAt: 1000, lastAccessedAt: 1000, value: { id: 1 } } }
        }),
        'utf-8'
      )

      const cache = createContentCache({
        filePath,
        namespace: 'current-v2',
        now: () => 1000
      })

      let calls = 0
      const res = await cache.resolve('item:1', async () => { calls++; return { id: 2 } }, valid)
      assert.equal(res.state, 'miss')
      assert.equal(calls, 1)
      assert.equal(res.value.id, 2)
    })
  })
}

main().then(() => {
  if (process.exitCode) console.log('Some tests failed.')
  else console.log('All contentCacheScale tests passed!')
})
