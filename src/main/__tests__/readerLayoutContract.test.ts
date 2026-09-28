import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pageSize, positionAtOffset } from '../../renderer/src/reader/readerLayout'
import { DEFAULT_READER_PREFERENCES } from '../../shared/readerContracts'

test('reader reserves dimensions and preserves aspect ratio across fit modes', () => {
  const viewport = { width: 1000, height: 800 }
  const fallback = pageSize(undefined, viewport, DEFAULT_READER_PREFERENCES)
  assert.equal(fallback.height / fallback.width, 1.5)
  const portrait = pageSize({ width: 720, height: 1800 }, viewport, { ...DEFAULT_READER_PREFERENCES, readerFit: 'height' })
  assert.ok(portrait.height + 96 + 80 <= viewport.height, '100% fit-height must include both reader insets')
  const original = pageSize({ width: 1200, height: 600 }, viewport, { ...DEFAULT_READER_PREFERENCES, readerFit: 'original', readerZoom: 2 })
  assert.deepEqual(original, { width: 1920, height: 960 })
})
test('actual reading line determines page and offset independently of overscan', () => {
  const rows = [0, 1, 2, 3].map(index => ({ index, start: index * 1000, size: 1000 }))
  assert.deepEqual(positionAtOffset(rows, 2350), { pageIndex: 2, pageOffset: 0.35 })
  assert.deepEqual(positionAtOffset(rows, 3000), { pageIndex: 3, pageOffset: 0 })
})
