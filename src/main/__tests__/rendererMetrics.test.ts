import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startRendererMetrics } from '../../renderer/src/performance/rendererMetrics'
import type { PerfEvent } from '../../shared/performanceTraceCore'

test('frame percentiles include normal frames, exclude background intervals and stop cleanly', () => {
  let callback: FrameRequestCallback = () => {}; let cancelled = false
  const previous = { request: globalThis.requestAnimationFrame, cancel: globalThis.cancelAnimationFrame, document: globalThis.document }
  const document = { visibilityState: 'visible' }
  globalThis.document = document as Document
  globalThis.requestAnimationFrame = fn => { callback = fn; return 1 }
  globalThis.cancelAnimationFrame = () => { cancelled = true }
  const events: PerfEvent[] = []
  const stop = startRendererMetrics(event => events.push(event))
  try {
    callback(100); callback(116); callback(132); callback(192)
    document.visibilityState = 'hidden'; callback(1000)
    document.visibilityState = 'visible'; callback(1100); callback(1116)
    assert.deepEqual(events.filter(event => event.name === 'renderer.frame-interval').map(event => event.elapsedMs), [16, 16, 60, 16])
  } finally { stop(); globalThis.requestAnimationFrame = previous.request; globalThis.cancelAnimationFrame = previous.cancel; globalThis.document = previous.document }
  assert.equal(cancelled, true)
})
