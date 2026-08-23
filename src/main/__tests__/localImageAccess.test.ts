import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createAllowedRootsCache, openLocalImage } from '../localImageAccess'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn()
    console.log(`  PASS: ${name}`)
  } catch (err) {
    console.log(`  FAIL: ${name}`)
    console.log(`        ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

async function main(): Promise<void> {
await test('allowed roots are loaded once within the sixty-second TTL', async () => {
  let now = 1_000
  let calls = 0
  const cache = createAllowedRootsCache(async () => {
    calls++
    return ['D:\\downloads']
  }, 60_000, () => now)

  assert.deepEqual(await cache.get(), ['D:\\downloads'])
  now += 59_999
  assert.deepEqual(await cache.get(), ['D:\\downloads'])
  assert.equal(calls, 1)
  now += 1
  await cache.get()
  assert.equal(calls, 2)
})

await test('concurrent root requests share one loader promise', async () => {
  const pending = deferred<string[]>()
  let calls = 0
  const cache = createAllowedRootsCache(() => {
    calls++
    return pending.promise
  }, 60_000)

  const first = cache.get()
  const second = cache.get()
  assert.equal(calls, 1)
  pending.resolve(['D:\\downloads'])
  assert.deepEqual(await Promise.all([first, second]), [
    ['D:\\downloads'],
    ['D:\\downloads']
  ])
})

await test('invalidation forces the next root request to reload', async () => {
  let calls = 0
  const cache = createAllowedRootsCache(async () => [`root-${++calls}`], 60_000)
  assert.deepEqual(await cache.get(), ['root-1'])
  cache.invalidate()
  assert.deepEqual(await cache.get(), ['root-2'])
})

await test('failed root loads are never cached', async () => {
  let calls = 0
  const cache = createAllowedRootsCache(async () => {
    calls++
    if (calls === 1) throw new Error('database unavailable')
    return ['D:\\downloads']
  }, 60_000)

  await assert.rejects(cache.get(), /database unavailable/)
  assert.deepEqual(await cache.get(), ['D:\\downloads'])
  assert.equal(calls, 2)
})

await test('openLocalImage asynchronously returns the exact file bytes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'jm-local-image-'))
  const path = join(root, '0001.webp')
  try {
    writeFileSync(path, Buffer.from([1, 2, 3, 4]))
    const bytes = await openLocalImage(path)
    assert.deepEqual([...bytes], [1, 2, 3, 4])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

await test('local image protocol uses cached roots and no synchronous file read', () => {
  const protocol = readFileSync(resolve(process.cwd(), 'src/main/localImageProtocol.ts'), 'utf-8')
  const ipc = readFileSync(resolve(process.cwd(), 'src/main/ipc.ts'), 'utf-8')
  assert.doesNotMatch(protocol, /readFileSync/)
  assert.match(protocol, /allowedRootsCache\.get\(\)/)
  assert.match(protocol, /await openLocalImage\(filepath\)/)
  assert.match(ipc, /invalidateLocalImageAllowedRoots\(\)/)
})

if (process.exitCode) {
  console.log('Some tests failed.')
} else {
  console.log('All tests passed!')
}
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
