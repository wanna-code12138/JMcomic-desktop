import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWarmupCoordinator } from '../sessionWarmup'
import type { WarmupState } from '../../shared/sessionWarmupContracts'

test('reset invalidates a late verification result without disturbing the new attempt', async () => {
  const resolvers: Array<(state: WarmupState) => void> = []
  const coordinator = createWarmupCoordinator({ runVerification: () => new Promise((resolve) => resolvers.push(resolve)) })
  const old = coordinator.ensureWarmup('startup', {} as any)
  coordinator.reset()
  const current = coordinator.ensureWarmup('manual', {} as any)
  resolvers[0]({ phase: 'verified', evidence: 'known-page', verifiedAt: 1 })
  await old
  assert.equal(coordinator.getWarmupState().phase, 'verifying')
  assert.strictEqual(coordinator.ensureWarmup('manual', {} as any), current)
  resolvers[1]({ phase: 'failed', reason: 'timeout', retryable: true })
  await current
})
