import assert from 'node:assert/strict'
import {
  reduceWarmupState,
  type WarmupState,
  type WarmupEvent
} from '../../shared/sessionWarmupContracts'

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  PASS: ${name}`)
  } catch (err) {
    console.log(`  FAIL: ${name}`)
    console.log(`        ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

// 1. 基本转换与红灯用例
test('reduceWarmupState handles verifying to failed(timeout)', () => {
  assert.deepEqual(
    reduceWarmupState({ phase: 'verifying', attempt: 1 }, { type: 'timeout' }),
    { phase: 'failed', reason: 'timeout', retryable: true }
  )
})

test('reduceWarmupState rejects verified transition from idle', () => {
  assert.throws(
    () => reduceWarmupState({ phase: 'idle' }, { type: 'verified', evidence: 'known-page' } as WarmupEvent),
    /WARMUP_INVALID_TRANSITION/
  )
})

test('reduceWarmupState expires verified state upon challenge', () => {
  assert.deepEqual(
    reduceWarmupState({ phase: 'verified', verifiedAt: 1, evidence: 'known-page' }, { type: 'challenge' }),
    { phase: 'expired', reason: 'challenge' }
  )
})

// 2. 正常工作流与边界测试
test('idle starts verification', () => {
  const next = reduceWarmupState({ phase: 'idle' }, { type: 'start', reason: 'startup' })
  assert.equal(next.phase, 'verifying')
  assert.equal(next.attempt, 1)
})

test('verifying succeeds with evidence', () => {
  const verified = reduceWarmupState(
    { phase: 'verifying', attempt: 1 },
    { type: 'verified', evidence: 'known-page' }
  )
  assert.equal(verified.phase, 'verified')
  if (verified.phase === 'verified') {
    assert.equal(verified.evidence, 'known-page')
  }
})

test('verifying fails with network error', () => {
  const failed = reduceWarmupState(
    { phase: 'verifying', attempt: 1 },
    { type: 'fail', reason: 'network-error' }
  )
  assert.equal(failed.phase, 'failed')
  if (failed.phase === 'failed') {
    assert.equal(failed.reason, 'network-error')
    assert.equal(failed.retryable, true)
  }
})

test('failed and expired states can be restarted with incremented attempt', () => {
  const restartedFromFailed = reduceWarmupState(
    { phase: 'failed', reason: 'timeout', retryable: true, attempt: 1 },
    { type: 'start', reason: 'manual' }
  )
  assert.equal(restartedFromFailed.phase, 'verifying')
  assert.equal(restartedFromFailed.attempt, 2)

  const restartedFromExpired = reduceWarmupState(
    { phase: 'expired', reason: 'challenge' },
    { type: 'start', reason: 'browser-fallback' }
  )
  assert.equal(restartedFromExpired.phase, 'verifying')
  assert.equal(restartedFromExpired.attempt, 1)
})

test('reset returns to idle from any phase', () => {
  assert.deepEqual(reduceWarmupState({ phase: 'failed', reason: 'timeout', retryable: true }, { type: 'reset' }), { phase: 'idle' })
  assert.deepEqual(reduceWarmupState({ phase: 'verified', verifiedAt: 1, evidence: 'known-page' }, { type: 'reset' }), { phase: 'idle' })
})

// 3. Coordinator 并发与单实例测试
import { createWarmupCoordinator } from '../sessionWarmup'

test('ten concurrent ensureWarmup calls share single verification attempt', async () => {
  let runs = 0
  let finishVerification!: (state: WarmupState) => void
  const coordinator = createWarmupCoordinator({
    runVerification: async () => {
      runs++
      return new Promise<WarmupState>((resolve) => {
        finishVerification = resolve
      })
    }
  })

  assert.equal(coordinator.getWarmupState().phase, 'idle')

  const fakeWindow = {} as any
  const promises = Array.from({ length: 10 }, () =>
    coordinator.ensureWarmup('browser-fallback', fakeWindow)
  )

  assert.equal(runs, 1)
  assert.equal(coordinator.getWarmupState().phase, 'verifying')

  finishVerification({ phase: 'verified', verifiedAt: 100, evidence: 'known-page' })
  const results = await Promise.all(promises)

  for (const res of results) {
    assert.equal(res.phase, 'verified')
    if (res.phase === 'verified') {
      assert.equal(res.evidence, 'known-page')
    }
  }
  assert.equal(runs, 1)
})

test('timeout transitions coordinator to failed and rejects assumption of verification', async () => {
  const coordinator = createWarmupCoordinator({
    runVerification: async () => {
      return { phase: 'failed', reason: 'timeout', retryable: true }
    }
  })

  const result = await coordinator.ensureWarmup('startup', {} as any)
  assert.equal(result.phase, 'failed')
  if (result.phase === 'failed') {
    assert.equal(result.reason, 'timeout')
    assert.equal(result.retryable, true)
  }
  assert.equal(coordinator.getWarmupState().phase, 'failed')
})

test('retry increments attempt number', async () => {
  let attempts = 0
  const coordinator = createWarmupCoordinator({
    runVerification: async (_reason, _host, attempt) => {
      attempts = attempt
      return { phase: 'failed', reason: 'timeout', retryable: true, attempt }
    }
  })

  await coordinator.ensureWarmup('startup', {} as any)
  assert.equal(attempts, 1)

  await coordinator.retryWarmup({} as any)
  assert.equal(attempts, 2)
})

test('subscribers receive state transitions and unsubscribe cleanly', async () => {
  const received: string[] = []
  const coordinator = createWarmupCoordinator({
    runVerification: async () => {
      return { phase: 'verified', verifiedAt: Date.now(), evidence: 'validated-cookie' }
    }
  })

  const unsubscribe = coordinator.subscribeWarmup((s) => {
    received.push(s.phase)
  })

  await coordinator.ensureWarmup('manual', {} as any)
  assert.deepEqual(received, ['verifying', 'verified'])

  unsubscribe()
  coordinator.reset()
  assert.deepEqual(received, ['verifying', 'verified'])
})

if (process.exitCode) console.log('Some tests failed.')
else console.log('All warmup state tests passed!')
