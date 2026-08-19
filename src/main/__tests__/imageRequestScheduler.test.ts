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

async function main(): Promise<void> {
  await testSameKeySharesOneTask()
  await testConcurrencyAndFifo()
  await testRejectedKeyCanRetry()
  testProtocolUsesSharedImmutableResult()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
