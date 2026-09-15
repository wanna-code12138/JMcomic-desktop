import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createImageRequestScheduler } from '../imageRequestScheduler'

test('canceling every subscriber removes a shared queued request immediately', async () => {
  const scheduler = createImageRequestScheduler(1)
  let release!: () => void
  const first = scheduler.run('active', () => new Promise<void>((resolve) => { release = resolve }))
  const a = new AbortController()
  const b = new AbortController()
  const pendingA = scheduler.run({ key: 'queued', signal: a.signal }, async () => 1)
  const pendingB = scheduler.run({ key: 'queued', signal: b.signal }, async () => 1)
  const rejectedA = assert.rejects(pendingA)
  const rejectedB = assert.rejects(pendingB)
  a.abort()
  b.abort()
  await Promise.all([rejectedA, rejectedB])
  const pendingCount = scheduler.pendingCount()
  release()
  await first
  assert.equal(pendingCount, 0)
})

test('a late subscriber receives already-resolved headers while body still holds the slot', async () => {
  const scheduler = createImageRequestScheduler(1)
  let finish!: () => void
  const done = new Promise<void>((resolve) => { finish = resolve })
  const first = await scheduler.run('image', async () => ({ done }), (result) => result.done)
  const controller = new AbortController()
  const second = scheduler.run({ key: 'image', signal: controller.signal }, async () => { throw new Error('must share') })
  const result = await Promise.race([second, new Promise((resolve) => setTimeout(() => resolve(null), 20))])
  finish()
  await done
  assert.equal(result, first)
})
