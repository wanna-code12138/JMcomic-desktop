import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createImageRequestScheduler } from '../imageRequestScheduler'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function testSameKeySharesOneTask(): Promise<void> {
  const scheduler = createImageRequestScheduler(2)
  const work = deferred<string>()
  let invocations = 0
  const task = (): Promise<string> => {
    invocations++
    return work.promise
  }

  const first = scheduler.run('same-url', task)
  const second = scheduler.run('same-url', task)
  assert.equal(invocations, 1)
  assert.strictEqual(first, second)

  work.resolve('image-bytes')
  assert.equal(await first, 'image-bytes')
  assert.equal(await second, 'image-bytes')
  console.log('  PASS: same key shares one in-flight promise')
}

async function testConcurrencyAndFifo(): Promise<void> {
  const scheduler = createImageRequestScheduler(6)
  const work = Array.from({ length: 8 }, () => deferred<number>())
  const startOrder: number[] = []
  let active = 0
  let peak = 0

  const results = work.map((item, index) => scheduler.run(`url-${index}`, async () => {
    startOrder.push(index)
    active++
    peak = Math.max(peak, active)
    try {
      return await item.promise
    } finally {
      active--
    }
  }))

  assert.deepEqual(startOrder, [0, 1, 2, 3, 4, 5])
  assert.equal(scheduler.activeCount(), 6)
  assert.equal(scheduler.pendingCount(), 2)

  work[0].resolve(0)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(startOrder, [0, 1, 2, 3, 4, 5, 6])

  work[1].resolve(1)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(startOrder, [0, 1, 2, 3, 4, 5, 6, 7])

  for (let index = 2; index < work.length; index++) work[index].resolve(index)
  assert.deepEqual(await Promise.all(results), [0, 1, 2, 3, 4, 5, 6, 7])
  assert.equal(peak, 6)
  assert.equal(scheduler.activeCount(), 0)
  assert.equal(scheduler.pendingCount(), 0)
  console.log('  PASS: unique keys run FIFO with a maximum of six active tasks')
}

async function testRejectedKeyCanRetry(): Promise<void> {
  const scheduler = createImageRequestScheduler(1)
  let invocations = 0
  await assert.rejects(
    scheduler.run('retry-url', async () => {
      invocations++
      throw new Error('first request failed')
    }),
    /first request failed/
  )

  const value = await scheduler.run('retry-url', async () => {
    invocations++
    return 'retry succeeded'
  })
  assert.equal(value, 'retry succeeded')
  assert.equal(invocations, 2)
  console.log('  PASS: rejection removes the in-flight key so it can retry')
}

function testProtocolUsesSharedImmutableResult(): void {
  const text = readFileSync(resolve(process.cwd(), 'src/main/imageProtocol.ts'), 'utf8')
  assert.match(text, /createImageRequestScheduler\(6\)/)
  assert.match(text, /imageRequestScheduler\.run\(realUrl,/)
  assert.match(text, /new Response\(result\.body,/)
  console.log('  PASS: protocol shares immutable fetch results and creates independent responses')
}

async function testPriorityAndCancellation(): Promise<void> {
  const scheduler = createImageRequestScheduler({ maxConcurrent: 1, maxPerHost: 1 })
  const order: string[] = []
  const blockerDeferred = deferred<void>()
  const blocker = scheduler.run({ key: 'a', host: 'h', priority: 'background' }, async () => blockerDeferred.promise)
  const pB = scheduler.run({ key: 'b', host: 'h', priority: 'background' }, async () => {
    order.push('b')
  })
  const pC = scheduler.run({ key: 'c', host: 'h', priority: 'critical' }, async () => {
    order.push('c')
  })

  blockerDeferred.resolve()
  await blocker
  await Promise.all([pB, pC])
  assert.deepEqual(order, ['c', 'b'])
  console.log('  PASS: critical jumps ahead of pending background tasks')
}

async function testPerHostConcurrency(): Promise<void> {
  const scheduler = createImageRequestScheduler({ maxConcurrent: 4, maxPerHost: 2 })
  const dH1 = deferred<void>()
  const dH2 = deferred<void>()
  const started: string[] = []

  void scheduler.run({ key: 'h1-1', host: 'host1', priority: 'near' }, async () => {
    started.push('h1-1')
    return dH1.promise
  })
  void scheduler.run({ key: 'h1-2', host: 'host1', priority: 'near' }, async () => {
    started.push('h1-2')
    return dH1.promise
  })
  void scheduler.run({ key: 'h1-3', host: 'host1', priority: 'critical' }, async () => {
    started.push('h1-3')
    return dH1.promise
  })
  void scheduler.run({ key: 'h2-1', host: 'host2', priority: 'near' }, async () => {
    started.push('h2-1')
    return dH2.promise
  })

  await new Promise<void>((resolve) => setImmediate(resolve))
  // host1 达到 2 个并发上限，h1-3 虽然 critical 但受限于 host1 上限，而 host2 的 h2-1 可以并发运行
  assert.deepEqual(started, ['h1-1', 'h1-2', 'h2-1'])

  dH1.resolve()
  dH2.resolve()
  console.log('  PASS: perHost limit is enforced across hosts')
}

async function testCancellationWithSignal(): Promise<void> {
  const scheduler = createImageRequestScheduler({ maxConcurrent: 1 })
  const blocker = deferred<void>()
  void scheduler.run({ key: 'blocker', priority: 'near' }, () => blocker.promise)

  const controller = new AbortController()
  let taskRan = false
  const pendingPromise = scheduler.run(
    { key: 'cancelled-task', priority: 'near', signal: controller.signal },
    async () => {
      taskRan = true
    }
  )

  controller.abort()
  await assert.rejects(pendingPromise, /aborted|cancel/i)
  blocker.resolve()
  assert.equal(taskRan, false)
  console.log('  PASS: aborted pending task is cancelled without running')
}

async function main(): Promise<void> {
  await testSameKeySharesOneTask()
  await testConcurrencyAndFifo()
  await testRejectedKeyCanRetry()
  await testPriorityAndCancellation()
  await testPerHostConcurrency()
  await testCancellationWithSignal()
  testProtocolUsesSharedImmutableResult()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
