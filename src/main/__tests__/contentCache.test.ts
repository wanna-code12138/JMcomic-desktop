import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createContentCache } from '../contentCache'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>((resolveValue) => { resolvePromise = resolveValue })
  return { promise, resolve: resolvePromise }
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`  PASS: ${name}`)
  } catch (error) {
    console.log(`  FAIL: ${name}`)
    console.log(`        ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

async function withCacheDir(fn: (filePath: string) => Promise<void>): Promise<void> {
  const workDir = resolve(process.cwd(), 'work')
  await mkdir(workDir, { recursive: true })
  const directory = await mkdtemp(join(workDir, 'content-cache-test-'))
  try {
    await fn(join(directory, 'content-cache.json'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const valid = (value: unknown): value is { title: string } => {
  return Boolean(value && typeof value === 'object' && typeof (value as { title?: unknown }).title === 'string')
}

async function main(): Promise<void> {
  await test('fresh data returns without calling the provider again', async () => {
    await withCacheDir(async (filePath) => {
      let now = 1_000
      let calls = 0
      const cache = createContentCache({ filePath, now: () => now })
      const first = await cache.resolve('detail:1', async () => { calls++; return { title: 'first' } }, valid)
      now += 10 * 60_000 - 1
      const second = await cache.resolve('detail:1', async () => { calls++; return { title: 'second' } }, valid)
      assert.equal(first.state, 'miss')
      assert.equal(second.state, 'fresh')
      assert.equal(second.value.title, 'first')
      assert.equal(calls, 1)
    })
  })

  await test('stale data returns immediately and starts one background refresh', async () => {
    await withCacheDir(async (filePath) => {
      let now = 1_000
      let calls = 0
      const pending = deferred<{ title: string }>()
      const cache = createContentCache({ filePath, now: () => now })
      await cache.resolve('detail:1', async () => { calls++; return { title: 'old' } }, valid)
      now += 10 * 60_000 + 1

      const first = await cache.resolve('detail:1', () => { calls++; return pending.promise }, valid)
      const second = await cache.resolve('detail:1', () => { calls++; return pending.promise }, valid)
      assert.equal(first.state, 'stale')
      assert.equal(second.state, 'stale')
      assert.equal(first.value.title, 'old')
      assert.equal(calls, 2)

      pending.resolve({ title: 'new' })
      await cache.waitForIdle()
      const refreshed = await cache.resolve('detail:1', async () => { calls++; return { title: 'unused' } }, valid)
      assert.equal(refreshed.state, 'fresh')
      assert.equal(refreshed.value.title, 'new')
    })
  })

  await test('expired data blocks until the provider returns', async () => {
    await withCacheDir(async (filePath) => {
      let now = 1_000
      const pending = deferred<{ title: string }>()
      const cache = createContentCache({ filePath, now: () => now })
      await cache.resolve('detail:1', async () => ({ title: 'old' }), valid)
      now += 24 * 60 * 60_000 + 1

      let settled = false
      const resultPromise = cache.resolve('detail:1', () => pending.promise, valid).then((result) => {
        settled = true
        return result
      })
      await Promise.resolve()
      assert.equal(settled, false)
      pending.resolve({ title: 'new' })
      const result = await resultPromise
      assert.equal(result.state, 'miss')
      assert.equal(result.value.title, 'new')
    })
  })

  await test('malformed disk entries are ignored and replaced by valid data', async () => {
    await withCacheDir(async (filePath) => {
      await writeFile(filePath, JSON.stringify({
        version: 1,
        entries: { 'detail:1': { savedAt: 'not-a-number', value: { title: 'bad' } } }
      }), 'utf-8')
      let calls = 0
      const cache = createContentCache({ filePath, now: () => 1_000 })
      const result = await cache.resolve('detail:1', async () => { calls++; return { title: 'good' } }, valid)
      assert.equal(result.state, 'miss')
      assert.equal(result.value.title, 'good')
      assert.equal(calls, 1)
      await cache.waitForIdle()
      const disk = JSON.parse(await readFile(filePath, 'utf-8')) as { entries: Record<string, { value: { title: string } }> }
      assert.equal(disk.entries['detail:1'].value.title, 'good')
    })
  })

  await test('failed background refresh preserves the stale value', async () => {
    await withCacheDir(async (filePath) => {
      let now = 1_000
      const cache = createContentCache({ filePath, now: () => now })
      await cache.resolve('detail:1', async () => ({ title: 'old' }), valid)
      now += 10 * 60_000 + 1
      const result = await cache.resolve('detail:1', async () => { throw new Error('offline') }, valid)
      assert.equal(result.state, 'stale')
      await cache.waitForIdle()
      const preserved = await cache.resolve('detail:1', async () => { throw new Error('offline') }, valid)
      assert.equal(preserved.value.title, 'old')
    })
  })

  await test('clear removes both memory and the persisted cache file', async () => {
    await withCacheDir(async (filePath) => {
      let calls = 0
      const cache = createContentCache({ filePath, now: () => 1_000 })
      await cache.resolve('detail:1', async () => { calls++; return { title: 'first' } }, valid)
      await cache.clear()
      await assert.rejects(readFile(filePath, 'utf-8'), { code: 'ENOENT' })
      const result = await cache.resolve('detail:1', async () => { calls++; return { title: 'second' } }, valid)
      assert.equal(result.state, 'miss')
      assert.equal(result.value.title, 'second')
      assert.equal(calls, 2)
    })
  })

  if (process.exitCode) console.log('Some tests failed.')
  else console.log('All tests passed!')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
