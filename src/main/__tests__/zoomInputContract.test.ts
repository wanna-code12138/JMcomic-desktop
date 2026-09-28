import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(process.cwd(), 'src/renderer/src/components/ZoomableImage.tsx'),
  'utf-8'
)

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

test('ZoomableImage uses Pointer Events with pointer capture', () => {
  assert.match(source, /pointerdown|onPointerDown/i)
  assert.match(source, /setPointerCapture/)
  assert.match(source, /releasePointerCapture/)
})

test('ZoomableImage uses requestAnimationFrame to coalesce transform updates', () => {
  assert.match(source, /requestAnimationFrame/)
  assert.match(source, /cancelAnimationFrame/)
})

test('ZoomableImage caches dimensions using ResizeObserver', () => {
  assert.match(source, /ResizeObserver/)
})

test('pointermove and wheel handlers do not synchronously trigger React state commits', () => {
  // 不在 wheel 或 pointermove 主体内直接同步调用 setState
  assert.doesNotMatch(source, /handleMouseMove[^{]*\{[^}]*setZoomDisplay/s)
  assert.doesNotMatch(source, /onPointerMove[^{]*\{[^}]*setZoomDisplay/s)
})

if (process.exitCode) console.log('Some tests failed.')
else console.log('All zoom input contract tests passed!')
