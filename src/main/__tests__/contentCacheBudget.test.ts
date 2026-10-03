import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createContentCache } from '../contentCache'

test('byte budget evicts actual serialized bytes and oversized entries do not stay in memory', async () => {
  const root = resolve('work')
  await mkdir(root, { recursive: true })
  const dir = await mkdtemp(join(root, 'cache-budget-'))
  const filePath = join(dir, 'cache.json')
  const cache = createContentCache({ filePath, maxBytes: 300, maxEntries: 100, now: () => 1000 })
  const valid = (value: unknown): value is string => typeof value === 'string'
  try {
    await cache.resolve('small', async () => 'ok', valid)
    await cache.resolve('large', async () => '漫'.repeat(1024), valid)
    await cache.waitForIdle()
    assert.ok(Buffer.byteLength(await readFile(filePath, 'utf8')) <= 300)
    const result = await cache.resolve('large', async () => 'replacement', valid)
    assert.equal(result.state, 'miss')
    assert.equal((await cache.resolve('small', async () => 'unwanted', valid)).value, 'ok')
  } finally {
    await cache.waitForIdle()
    await rm(dir, { recursive: true, force: true })
  }
})

test('combined entry sizes obey the byte budget while preserving recently read entries', async () => {
  const root = resolve('work')
  await mkdir(root, { recursive: true })
  const dir = await mkdtemp(join(root, 'cache-budget-'))
  const filePath = join(dir, 'cache.json')
  let time = 1000
  const cache = createContentCache({ filePath, maxBytes: 400, now: () => time++ })
  const valid = (value: unknown): value is string => typeof value === 'string'
  try {
    for (const key of ['a', 'b']) await cache.resolve(key, async () => key.repeat(100), valid)
    await cache.resolve('a', async () => '', valid)
    await cache.resolve('c', async () => 'c'.repeat(100), valid)
    await cache.waitForIdle()
    const json = await readFile(filePath, 'utf8')
    assert.ok(Buffer.byteLength(json) <= 400)
    const disk = JSON.parse(json)
    assert.ok(disk.entries.a)
    assert.ok(disk.entries.c)
    assert.equal(disk.entries.b, undefined)
  } finally {
    await cache.waitForIdle()
    await rm(dir, { recursive: true, force: true })
  }
})
