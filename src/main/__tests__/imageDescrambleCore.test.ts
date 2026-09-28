import assert from 'node:assert/strict'
import {
  getDescrambleStripCount,
  buildDescrambleSlices,
  type DescrambleSlice
} from '../../shared/imageDescrambleCore'

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  PASS: ${name}`)
  } catch (err) {
    console.log(`  FAIL: ${name}`)
    console.log(err)
    process.exitCode = 1
  }
}

test('getDescrambleStripCount boundary cases', () => {
  // 1. scrambleId = 0 返回 0
  assert.equal(getDescrambleStripCount(0, 300000, '00001'), 0)

  // 2. aid < scrambleId 返回 0
  assert.equal(getDescrambleStripCount(220000, 200000, '00001'), 0)

  // 3. aid < 268850 固定返回 10
  assert.equal(getDescrambleStripCount(100000, 250000, '00001'), 10)
  assert.equal(getDescrambleStripCount(220000, 268849, '00002'), 10)

  // 4. 268850 <= aid < 421926 (模 10)
  const countMid = getDescrambleStripCount(220000, 300000, '00001')
  assert.ok(countMid >= 2 && countMid <= 20 && countMid % 2 === 0)

  // 5. aid >= 421926 (模 8)
  const countHigh = getDescrambleStripCount(220000, 450000, '00001')
  assert.ok(countHigh >= 2 && countHigh <= 16 && countHigh % 2 === 0)
})

test('buildDescrambleSlices when remainder f == 0', () => {
  const slices = buildDescrambleSlices(800, 1000, 10)
  assert.equal(slices.length, 10)

  let totalHeight = 0
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i]
    assert.equal(s.height, 100)
    assert.equal(s.dstY, i * 100)
    assert.equal(s.srcY, 1000 - 100 * (i + 1))
    totalHeight += s.height
  }
  assert.equal(totalHeight, 1000)
})

test('buildDescrambleSlices when remainder f > 0', () => {
  // height = 1005, strips = 10 -> stripH = 100, f = 5
  const slices = buildDescrambleSlices(800, 1005, 10)
  assert.equal(slices.length, 10)

  // g = 0: stripH = 105, dstY = 0, srcY = 1005 - 100*1 - 5 = 900
  assert.equal(slices[0].height, 105)
  assert.equal(slices[0].dstY, 0)
  assert.equal(slices[0].srcY, 900)

  // g = 1: stripH = 100, dstY = 100*1 + 5 = 105, srcY = 1005 - 100*2 - 5 = 800
  assert.equal(slices[1].height, 100)
  assert.equal(slices[1].dstY, 105)
  assert.equal(slices[1].srcY, 800)

  // 所有切片的高度之和必须恰好等于原始图片高度 1005
  const sumHeight = slices.reduce((acc, cur) => acc + cur.height, 0)
  assert.equal(sumHeight, 1005)
})

test('buildDescrambleSlices with invalid dimensions or strips returns empty', () => {
  assert.deepEqual(buildDescrambleSlices(0, 1000, 10), [])
  assert.deepEqual(buildDescrambleSlices(800, 0, 10), [])
  assert.deepEqual(buildDescrambleSlices(800, 1000, 0), [])
})

if (process.exitCode) console.log('Some tests failed.')
else console.log('All imageDescrambleCore tests passed!')
