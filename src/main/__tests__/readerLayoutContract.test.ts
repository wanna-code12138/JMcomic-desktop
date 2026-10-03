import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pageSize, positionAtOffset } from '../../renderer/src/reader/readerLayout'
import { DEFAULT_READER_PREFERENCES } from '../../shared/readerContracts'

test('reader reserves dimensions and preserves aspect ratio across fit modes', () => {
  const viewport = { width: 1000, height: 800 }
  const fallback = pageSize(undefined, viewport, DEFAULT_READER_PREFERENCES)
  assert.equal(fallback.height / fallback.width, 1.5)
  const portrait = pageSize({ width: 720, height: 1800 }, viewport, { ...DEFAULT_READER_PREFERENCES, readerFit: 'height' })
  assert.equal(portrait.height, viewport.height - 16, 'fit-height uses the measured viewport with only 8px page margins; docked tools are outside it')
  const toolsOpen = pageSize({ width: 720, height: 1800 }, { ...viewport, height: 760 }, { ...DEFAULT_READER_PREFERENCES, readerFit: 'height' })
  assert.equal(portrait.height - toolsOpen.height, 40, 'folding a 40px tool row returns those pixels to the page')
  const original = pageSize({ width: 1200, height: 600 }, viewport, { ...DEFAULT_READER_PREFERENCES, readerFit: 'original', readerZoom: 2 })
  assert.deepEqual(original, { width: 1920, height: 960 })
})
test('actual reading line determines page and offset independently of overscan', () => {
  const rows = [0, 1, 2, 3].map(index => ({ index, start: index * 1000, size: 1000 }))
  assert.deepEqual(positionAtOffset(rows, 2350), { pageIndex: 2, pageOffset: 0.35 })
  assert.deepEqual(positionAtOffset(rows, 3000), { pageIndex: 3, pageOffset: 0 })
})
test('restoring a fractional page boundary tolerates browser pixel rounding without losing real offsets', () => {
  const rows = [{ index: 6, start: 10000, size: 1445.333333333332 }, { index: 7, start: 11445.333333333332, size: 1500 }]
  assert.deepEqual(positionAtOffset(rows, 11445), { pageIndex: 7, pageOffset: 0 })
  assert.deepEqual(positionAtOffset(rows, 11445.5), { pageIndex: 7, pageOffset: 0 })
  assert.equal(positionAtOffset(rows, 11440)?.pageIndex, 6, 'real previous-page positions must remain there')
  assert.deepEqual(positionAtOffset(rows, 12195.333333333332), { pageIndex: 7, pageOffset: 0.5 })
})
