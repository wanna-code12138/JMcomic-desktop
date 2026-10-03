import assert from 'node:assert/strict'
import {
  sanitizePerfEvent,
  summarizePerfEvents,
  type PerfEvent
} from '../../shared/performanceTraceCore'

// 1. 基本聚合测试
const events: PerfEvent[] = [
  { name: 'image.request', phase: 'finish', elapsedMs: 10, outcome: 'ok', metadata: { provider: 'api' } },
  { name: 'image.request', phase: 'finish', elapsedMs: 30, outcome: 'timeout', metadata: { provider: 'api' } },
  { name: 'image.request', phase: 'finish', elapsedMs: 20, outcome: 'error', metadata: { provider: 'api' } },
  { name: 'image.request', phase: 'finish', elapsedMs: 15, outcome: 'cancelled', metadata: { provider: 'api' } },
  { name: 'reader.canvas', phase: 'finish', elapsedMs: 5, outcome: 'ok', metadata: { width: 800 } }
]

const summary = summarizePerfEvents(events)

// 校验 image.request
assert.equal(summary['image.request'].count, 4)
assert.equal(summary['image.request'].ok, 1)
assert.equal(summary['image.request'].timeout, 1)
assert.equal(summary['image.request'].error, 1)
assert.equal(summary['image.request'].cancelled, 1)
// values: [10, 15, 20, 30]
// nearest-rank p50: ceil(4 * 0.5) - 1 = index 1 -> 15 (或 10，依公式)
// 计划 Step 1 中：[10, 30] 两个数，p50 是 10，max 是 30
assert.equal(summary['image.request'].maxMs, 30)

// 校验 reader.canvas
assert.equal(summary['reader.canvas'].count, 1)
assert.equal(summary['reader.canvas'].ok, 1)
assert.equal(summary['reader.canvas'].p50Ms, 5)
assert.equal(summary['reader.canvas'].p95Ms, 5)
assert.equal(summary['reader.canvas'].maxMs, 5)

// 2. 计划中指定的契约测试
const planSummary = summarizePerfEvents([
  { name: 'image.request', phase: 'finish', elapsedMs: 10, outcome: 'ok', metadata: { provider: 'api' } },
  { name: 'image.request', phase: 'finish', elapsedMs: 30, outcome: 'timeout', metadata: { provider: 'api' } }
])
assert.deepEqual(planSummary['image.request'].count, 2)
assert.equal(planSummary['image.request'].p50Ms, 10)
assert.equal(planSummary['image.request'].maxMs, 30)

// 3. 脱敏测试
const safe = sanitizePerfEvent({
  name: 'content.request',
  phase: 'finish',
  elapsedMs: 1,
  metadata: { url: 'https://secret/a', provider: 'api', cookie: 'secret', token: 'xyz' }
})
assert.deepEqual(safe.metadata, { provider: 'api' })
assert.equal(safe.name, 'content.request')
assert.equal(safe.phase, 'finish')
assert.equal(safe.elapsedMs, 1)

// 4. 空数组安全测试
const emptySummary = summarizePerfEvents([])
assert.deepEqual(emptySummary, {})

const stages = summarizePerfEvents([
  { name: 'reader.image', phase: 'decoded', elapsedMs: 40, metadata: {} },
  { name: 'reader.image', phase: 'finish', elapsedMs: 50, outcome: 'ok', metadata: {} }
])
assert.equal(stages['reader.image'].count, 1, 'milestones must not count as additional completed requests')
assert.equal(stages['reader.image'].p50Ms, 50)
assert.deepEqual(sanitizePerfEvent({ name: 'image.online', phase: 'finish', elapsedMs: 1,
  metadata: { cache: true, source: 'local', scrambled: false, count: 3, url: 'private' } }).metadata,
  { cache: true, source: 'local', scrambled: false, count: 3 })

console.log('All performanceMetricsCore tests passed!')
