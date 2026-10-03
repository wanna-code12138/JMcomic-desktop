import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createShutdownController } from '../shutdownController'

test('close waits for renderer persistence and active work, and deduplicates concurrent close attempts', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const order: string[] = []
  const controller = createShutdownController({
    saveRenderer: async () => { order.push('renderer'); await gate },
    stopWork: async () => { order.push('downloads') },
    closeDatabase: async () => { order.push('database') }
  })
  const first = controller.prepare(); const second = controller.prepare()
  assert.equal(first, second)
  assert.deepEqual(order, ['renderer'])
  release(); await first
  assert.deepEqual(order, ['renderer', 'downloads', 'database'])
})

test('save failure blocks shutdown and permits explicit retry', async () => {
  let attempts = 0; let closed = false
  const controller = createShutdownController({ saveRenderer: async () => { if (++attempts === 1) throw Error('disk full') },
    stopWork: async () => {}, closeDatabase: async () => { closed = true } })
  await assert.rejects(controller.prepare(), /disk full/)
  assert.equal(closed, false)
  await controller.prepare(); assert.equal(closed, true)
})

test('failed final persistence reopens work admission while retaining the window', async () => {
  const order: string[] = []
  const controller = createShutdownController({ saveRenderer: async () => {}, stopWork: async () => { order.push('stop') },
    closeDatabase: async () => { throw Error('disk full') }, resumeWork: () => { order.push('resume') } })
  await assert.rejects(controller.prepare(), /disk full/)
  assert.deepEqual(order, ['stop', 'resume'])
})
