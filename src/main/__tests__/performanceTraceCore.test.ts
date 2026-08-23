import assert from 'assert'
import {
  createPerfEventBuffer,
  formatPerfEvent,
  startPerfSpan,
  type PerfEvent
} from '../../shared/performanceTraceCore'

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

test('span emits deterministic mark and finish events', () => {
  const times = [100, 125, 160]
  const events: PerfEvent[] = []
  const span = startPerfSpan(
    'image.online',
    { source: 'network' },
    () => times.shift()!,
    (event) => events.push(event)
  )

  span.mark('first-byte', { bytes: 1024 })
  span.finish('ok', { bytes: 4096 })

  assert.deepStrictEqual(events, [
    {
      name: 'image.online',
      phase: 'first-byte',
      elapsedMs: 25,
      outcome: undefined,
      metadata: { source: 'network', bytes: 1024 }
    },
    {
      name: 'image.online',
      phase: 'finish',
      elapsedMs: 60,
      outcome: 'ok',
      metadata: { source: 'network', bytes: 4096 }
    }
  ])
})

test('finish is idempotent and emits only once', () => {
  const times = [10, 20]
  const events: PerfEvent[] = []
  const span = startPerfSpan('database.save', {}, () => times.shift()!, (event) => {
    events.push(event)
  })

  const first = span.finish('ok')
  const second = span.finish('error')

  assert.strictEqual(first, second)
  assert.strictEqual(events.length, 1)
  assert.strictEqual(times.length, 0)
})

test('bounded buffer keeps newest events and returns defensive copies', () => {
  const buffer = createPerfEventBuffer(2)
  for (const elapsedMs of [1, 2, 3]) {
    buffer.push({
      name: 'image.online',
      phase: 'finish',
      elapsedMs,
      outcome: 'ok',
      metadata: { cache: true }
    })
  }

  const listed = buffer.list()
  assert.deepStrictEqual(listed.map((event) => event.elapsedMs), [2, 3])
  listed[0].metadata.cache = false
  assert.strictEqual(buffer.list()[0].metadata.cache, true)

  buffer.clear()
  assert.deepStrictEqual(buffer.list(), [])
})

test('bounded buffer rejects invalid capacity', () => {
  assert.throws(() => createPerfEventBuffer(0), /capacity must be positive/)
  assert.throws(() => createPerfEventBuffer(1.5), /capacity must be positive/)
})

test('formatter emits one parseable JSON line', () => {
  const event: PerfEvent = {
    name: 'content.pages',
    phase: 'finish',
    elapsedMs: 123.46,
    outcome: 'ok',
    metadata: { count: 42 }
  }
  const line = formatPerfEvent(event)
  assert.ok(line.startsWith('[perf] '))
  assert.deepStrictEqual(JSON.parse(line.slice('[perf] '.length)), event)
})
