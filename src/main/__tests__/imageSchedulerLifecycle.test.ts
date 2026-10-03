import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createImageRequestScheduler } from '../imageRequestScheduler'

for (const secondHasSignal of [true, false]) {
  test(`canceling the first consumer preserves the other consumer (signal=${secondHasSignal})`, async () => {
    const scheduler = createImageRequestScheduler(1)
    const first = new AbortController()
    const second = new AbortController()
    let finish!: (value: string) => void
    let networkSignal!: AbortSignal
    let requests = 0
    const a = scheduler.run({ key: 'shared', signal: first.signal }, (signal) => {
      networkSignal = signal
      requests++
      return new Promise<string>((resolve) => { finish = resolve })
    })
    const b = scheduler.run({ key: 'shared', signal: secondHasSignal ? second.signal : undefined }, async () => {
      requests++
      return 'duplicate'
    })
    const rejected = assert.rejects(a, /left/)
    const other = b.then((value) => ({ value }), (error: Error) => ({ error: error.message }))
    first.abort(new Error('first consumer left'))
    await rejected
    finish('valid image')
    assert.deepEqual(await other, { value: 'valid image' })
    assert.equal(networkSignal.aborted, false)
    assert.equal(requests, 1)
  })
}

test('canceling the last consumer after headers aborts the held response body', async () => {
  const scheduler = createImageRequestScheduler(1)
  const consumer = new AbortController()
  let networkSignal!: AbortSignal
  let finish!: () => void
  const done = new Promise<void>((resolve) => { finish = resolve })
  await scheduler.run({ key: 'body', signal: consumer.signal }, async (signal) => {
    networkSignal = signal
    signal.addEventListener('abort', finish, { once: true })
    return { done }
  }, (result) => result.done)
  consumer.abort()
  await done
  assert.equal(networkSignal.aborted, true)
})

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
