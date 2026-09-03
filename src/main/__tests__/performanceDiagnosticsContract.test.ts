import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseRendererPerfEvent } from '../performanceDiagnosticsIpc'

// 1. 静态源码契约断言（计划指定）
const preload = readFileSync('src/preload/index.ts', 'utf8')
const ipc = readFileSync('src/main/performanceDiagnosticsIpc.ts', 'utf8')

assert.match(preload, /performanceSnapshot.*performance:snapshot/s)
assert.match(preload, /performanceClear.*performance:clear/s)
assert.match(preload, /performanceRecord.*performance:record/s)
assert.match(ipc, /app\.getGPUFeatureStatus\(\)/)
assert.match(ipc, /app\.getAppMetrics\(\)/)
assert.doesNotMatch(ipc, /cookies|getPassword|authGet/i)

// 2. parseRendererPerfEvent 严格校验测试
// 合法事件
const valid = parseRendererPerfEvent({
  name: 'renderer.long-task',
  phase: 'finish',
  elapsedMs: 52.4,
  outcome: 'ok',
  metadata: { page: 'home' }
})
assert.ok(valid)
assert.equal(valid?.name, 'renderer.long-task')
assert.equal(valid?.phase, 'finish')
assert.equal(valid?.elapsedMs, 52.4)
assert.equal(valid?.outcome, 'ok')
assert.deepEqual(valid?.metadata, { page: 'home' })

// 缺少 name / phase
assert.equal(parseRendererPerfEvent(null), null)
assert.equal(parseRendererPerfEvent({ phase: 'finish', elapsedMs: 10 }), null)
assert.equal(parseRendererPerfEvent({ name: 'test', elapsedMs: 10 }), null)

// 恶意/异常 elapsedMs
assert.equal(parseRendererPerfEvent({ name: 'test', phase: 'finish', elapsedMs: -1 }), null)
assert.equal(parseRendererPerfEvent({ name: 'test', phase: 'finish', elapsedMs: Infinity }), null)
assert.equal(parseRendererPerfEvent({ name: 'test', phase: 'finish', elapsedMs: NaN }), null)
assert.equal(parseRendererPerfEvent({ name: 'test', phase: 'finish', elapsedMs: 999999999 }), null)

// 非法 outcome
assert.equal(parseRendererPerfEvent({ name: 'test', phase: 'finish', elapsedMs: 10, outcome: 'hacked' }), null)

// 超长或非法 metadata
assert.equal(parseRendererPerfEvent({
  name: 'test',
  phase: 'finish',
  elapsedMs: 10,
  metadata: { longVal: 'a'.repeat(300) }
}), null)

console.log('All performance diagnostics IPC contract tests passed!')
