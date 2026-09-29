import assert from 'node:assert/strict'
import { test } from 'node:test'
import { beginMainPerfSpan, clearMainPerfEvents, listMainPerfEvents } from '../performanceTrace'

test('performance diagnostics remain available when the launcher output pipe is gone', () => {
  clearMainPerfEvents()
  const original = console.info
  console.info = () => { throw Object.assign(new Error('broken pipe, write'), { code: 'EPIPE' }) }
  try {
    assert.doesNotThrow(() => {
      for (let index = 0; index < 32; index++) beginMainPerfSpan('image.online', { cache: true }).finish('ok')
    }, 'background image metrics must not turn a closed launch terminal into repeated main-process exceptions')
    const events = listMainPerfEvents()
    assert.equal(events.length, 32)
    assert.ok(events.every(event => event.name === 'image.online' && event.outcome === 'ok'))
  } finally { console.info = original; clearMainPerfEvents() }
})
