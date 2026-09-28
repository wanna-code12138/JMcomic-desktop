import assert from 'node:assert/strict'
import {
  createDatabaseWriteCoordinator,
  type DatabaseWriteCoordinator
} from '../databaseWriteCoordinator'

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: any) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: any) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
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

async function main(): Promise<void> {
  // 1. 连续 100 次 schedule 合并为一次写入
  await test('coalesces 100 rapid schedules into a single write', async () => {
    let writeCount = 0
    const coordinator = createDatabaseWriteCoordinator({
      debounceMs: 20,
      writer: async () => {
        writeCount++
      }
    })

    for (let i = 0; i < 100; i++) {
      coordinator.schedule('history')
    }

    await coordinator.flush()
    assert.equal(writeCount, 1)
  })

  // 2. flush 期间再次 schedule 会触发第二次写入
  await test('schedules during active flush trigger a follow-up flush', async () => {
    let writeCount = 0
    const gate = deferred<void>()

    const coordinator = createDatabaseWriteCoordinator({
      debounceMs: 10,
      writer: async () => {
        writeCount++
        if (writeCount === 1) {
          await gate.promise
        }
      }
    })

    coordinator.schedule('history')
    // 启动第一次写入
    const firstFlush = coordinator.flush()

    // 正在写入时，有新的修改进入
    coordinator.schedule('favorite')

    // 放行第一次写入
    gate.resolve()
    await firstFlush

    // 等待第二次写入完成
    await coordinator.flush()
    assert.equal(writeCount, 2)
  })

  // 3. 失败后不吞掉下一次写
  await test('recovers after write failure and allows subsequent flush', async () => {
    let attempts = 0
    const coordinator = createDatabaseWriteCoordinator({
      debounceMs: 10,
      writer: async () => {
        attempts++
        if (attempts === 1) throw new Error('disk-error')
      }
    })

    coordinator.schedule('download')
    await assert.rejects(coordinator.flush(), /disk-error/)

    coordinator.schedule('history')
    await coordinator.flush()
    assert.equal(attempts, 2)
  })

  // 4. close 最多等待 timeoutMs 并返回状态
  await test('close finishes within timeoutMs and does not hang', async () => {
    const coordinator = createDatabaseWriteCoordinator({
      debounceMs: 10,
      writer: async () => {
        await new Promise((r) => setTimeout(r, 20))
      }
    })

    coordinator.schedule('settings')
    const result = await coordinator.close(500)
    assert.equal(result, 'flushed')

    // 悬挂写入测试
    const hangingCoordinator = createDatabaseWriteCoordinator({
      debounceMs: 10,
      writer: async () => {
        await new Promise((r) => setTimeout(r, 1000))
      }
    })

    hangingCoordinator.schedule('history')
    const timeoutResult = await hangingCoordinator.close(50)
    assert.equal(timeoutResult, 'timeout')
  })
}

main().then(() => {
  if (process.exitCode) console.log('Some tests failed.')
  else console.log('All databaseWriteCoordinator tests passed!')
})
