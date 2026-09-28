const { app, nativeImage } = require('electron')
const assert = require('node:assert/strict')
const { mkdirSync } = require('node:fs')
const { resolve } = require('node:path')
const root = resolve('work/descramble-qa')
mkdirSync(root, { recursive: true })
app.setPath('userData', root)
require('tsx/cjs')
const { descrambleImage } = require('../src/main/imageDescrambler.ts')
app.whenReady().then(async () => {
  const width = 16, height = 23
  const bytes = Buffer.alloc(width * height * 4)
  for (let row = 0; row < height; row++) for (let x = 0; x < width; x++) {
    const offset = (row * width + x) * 4
    bytes.fill(row * 10, offset, offset + 3)
    bytes[offset + 3] = 255
  }
  const input = nativeImage.createFromBitmap(bytes, { width, height }).toPNG()
  const output = await descrambleImage(input, 200000, 'https://cdn-msp.18comic.vip/media/photos/267000/00001.png')
  assert.deepEqual([...output.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'download decoding must be lossless PNG')
  const actual = nativeImage.createFromBuffer(output).toBitmap()
  const rows = [18, 19, 20, 21, 22, 16, 17, 14, 15, 12, 13, 10, 11, 8, 9, 6, 7, 4, 5, 2, 3, 0, 1]
  for (let y = 0; y < height; y++) {
    assert.deepEqual(actual.subarray(y * width * 4, (y + 1) * width * 4), bytes.subarray(rows[y] * width * 4, (rows[y] + 1) * width * 4), `row ${y}`)
  }
  assert.deepEqual(await descrambleImage(input, 300000, 'https://cdn-msp.18comic.vip/media/photos/267000/00001.png'), input)
  console.log('CANVAS GOLDEN PASS: production decoder, 23 rows, exact pixels, lossless output and unscrambled passthrough')
  app.exit(0)
}).catch((error) => { console.error(error); app.exit(1) })
setTimeout(() => { console.error('Canvas QA timeout'); app.exit(1) }, 20000).unref()
