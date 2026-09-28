import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { md5, getDescrambleStripCount, buildDescrambleSlices } from '../../shared/imageDescrambleCore'

test('production MD5 and strip thresholds agree with independent cryptographic values', () => {
  for (const value of ['26700000001', '42192600012', '90000000007']) {
    assert.equal(md5(value), createHash('md5').update(value).digest('hex'))
  }
  assert.deepEqual([
    getDescrambleStripCount(0, 500000, '00001'), getDescrambleStripCount(600000, 500000, '00001'),
    getDescrambleStripCount(200000, 267000, '00001'), getDescrambleStripCount(200000, 300000, '00001'),
    getDescrambleStripCount(200000, 421925, '00012'), getDescrambleStripCount(200000, 421926, '00012'),
    getDescrambleStripCount(200000, 900000, '00007')
  ], [0, 0, 10, 16, 6, 8, 12])
})
test('production row mapping preserves independent golden row orders', () => {
  for (const [height, expected] of [[12, [9,10,11,6,7,8,3,4,5,0,1,2]], [11, [6,7,8,9,10,4,5,2,3,0,1]]] as const) {
    const rows: number[] = []
    for (const slice of buildDescrambleSlices(16, height, 4)) {
      for (let row = 0; row < slice.height; row++) rows[slice.dstY + row] = slice.srcY + row
    }
    assert.deepEqual(rows, expected)
  }
})
// scripts/descramble-smoke.cjs also verifies the production Electron Canvas output byte-for-byte.
