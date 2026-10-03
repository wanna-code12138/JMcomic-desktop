import assert from 'node:assert/strict'
import { test } from 'node:test'
import { focusReaderContent } from '../../renderer/src/reader/readerFocus'

test('delayed reader focus respects a newer keyboard choice of tab', () => {
  const originalDocument = globalThis.document, originalFrame = globalThis.requestAnimationFrame
  let frame: FrameRequestCallback | undefined, focused = false
  const origin = {}
  const tab = {}
  const viewport = { focus: () => { focused = true } }
  const document = { activeElement: origin, body: {}, getElementById: () => ({ querySelector: () => viewport }) }
  Object.assign(globalThis, { document, requestAnimationFrame: (callback: FrameRequestCallback) => { frame = callback; return 1 } })
  try {
    focusReaderContent()
    document.activeElement = tab
    frame!(0)
    assert.equal(focused, false, 'an older content-focus request must not steal focus from a tab')
    document.activeElement = origin
    focusReaderContent(); frame!(0)
    assert.equal(focused, true, 'unchanged initiating control still moves focus into reading')
  } finally { Object.assign(globalThis, { document: originalDocument, requestAnimationFrame: originalFrame }) }
})
