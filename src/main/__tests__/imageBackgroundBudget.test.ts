import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createImageRequestScheduler } from '../imageRequestScheduler'

test('background downloads leave capacity for a foreground page on the same host', async () => {
  const scheduler = createImageRequestScheduler({ maxConcurrent: 4, maxPerHost: 3, maxBackground: 2 } as any)
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const started: string[] = []
  const downloads = [0, 1, 2, 3].map((i) => scheduler.run({ key: String(i), host: 'cdn', priority: 'background' }, async () => { started.push(String(i)); await gate }))
  const foreground = scheduler.run({ key: 'reader', host: 'cdn', priority: 'critical' }, async () => { started.push('reader') })
  const beforeRelease = [...started]
  release()
  await Promise.all([...downloads, foreground])
  assert.deepEqual(beforeRelease, ['0', '1', 'reader'])
})

test('a reader joining a queued background URL immediately uses idle foreground capacity', async () => {
  const scheduler = createImageRequestScheduler({ maxConcurrent: 3, maxBackground: 1 })
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const a = scheduler.run({ key: 'a', priority: 'background' }, () => gate)
  let started = false
  const b = scheduler.run({ key: 'b', priority: 'background' }, async () => { started = true })
  const reader = scheduler.run({ key: 'b', priority: 'critical' }, async () => {})
  const immediately = started
  release()
  await Promise.all([a, b, reader])
  assert.equal(immediately, true)
})
