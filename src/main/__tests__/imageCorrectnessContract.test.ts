import assert from 'assert'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  buildSourceRowOrder,
  calculateStripCount,
  sourceRegionSha256
} from './helpers/descrambleContract'

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

const root = process.cwd()
const source = (path: string): string =>
  readFileSync(resolve(root, path), 'utf-8').replace(/\r\n/g, '\n')

test('reader MD5 source region is unchanged', () => {
  assert.strictEqual(
    sourceRegionSha256(
      resolve(root, 'src/renderer/src/pages/ReaderPage.tsx'),
      'function md5',
      '// get_num：'
    ),
    'd9e9704e9b1796c0e4321d7d002a54e8005690422d7477a9ec1b287e58f9a8b9'
  )
})

test('reader getNum source region is unchanged', () => {
  assert.strictEqual(
    sourceRegionSha256(
      resolve(root, 'src/renderer/src/pages/ReaderPage.tsx'),
      'function getNum',
      '// DescrambledImage'
    ),
    '76e0aae8d56435a2785bdaf36bf1d5a691c9adeacb1ff03ed57ede1366e02bdf'
  )
})

test('reader strip drawing source region is unchanged', () => {
  assert.strictEqual(
    sourceRegionSha256(
      resolve(root, 'src/renderer/src/pages/ReaderPage.tsx'),
      '    // 反打乱算法',
      '    // DESCRAMBLE MATH END'
    ),
    '45812838e4077fe7552a9ee33320621909cb002e080971dbc25c810808c38c44'
  )
})

test('download descramble source region is unchanged', () => {
  assert.strictEqual(
    sourceRegionSha256(
      resolve(root, 'src/main/imageDescrambler.ts'),
      'function buildDescrambleHtml'
    ),
    '35f398faa0723664e9ccfe6692f06e0aac7e8e0b61f89bc31c7bfa8cf091df52'
  )
})

test('strip counts preserve thresholds and filename-dependent MD5 rule', () => {
  assert.deepStrictEqual([
    calculateStripCount(0, 500000, '00001'),
    calculateStripCount(600000, 500000, '00001'),
    calculateStripCount(200000, 267000, '00001'),
    calculateStripCount(200000, 300000, '00001'),
    calculateStripCount(200000, 421925, '00012'),
    calculateStripCount(200000, 421926, '00012'),
    calculateStripCount(200000, 900000, '00007')
  ], [0, 0, 10, 16, 6, 8, 12])
})

test('strip rows preserve exact divisible-height reversal', () => {
  assert.deepStrictEqual(
    buildSourceRowOrder(12, 4),
    [9, 10, 11, 6, 7, 8, 3, 4, 5, 0, 1, 2]
  )
})

test('strip rows preserve first-strip remainder placement', () => {
  assert.deepStrictEqual(
    buildSourceRowOrder(11, 4),
    [6, 7, 8, 9, 10, 4, 5, 2, 3, 0, 1]
  )
})

test('page_arr index remains the source of online page order', () => {
  const text = source('src/main/scraperWindow.ts')
  assert.match(text, /page_arr\.forEach\(function\(f, i\)/)
  assert.match(text, /pages\.push\(\{ index: i, imageUrl: url \}\)/)
})

test('concurrent image results are written back to their input index', () => {
  const text = source('src/main/imageLoader.ts')
  assert.match(text, /const results: ImageResult\[\] = new Array\(urls\.length\)/)
  assert.match(text, /results\[index\] = \{ url, localPath: filepath, cached: false \}/)
})

test('download numbering uses the original missing page index', () => {
  const text = source('src/main/downloadManager.ts')
  assert.match(text, /const pageIndex = missingIndices\[k\]/)
  assert.match(text, /String\(pageIndex \+ 1\)\.padStart\(4, '0'\)/)
})
