import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/src/App.tsx'), 'utf-8')

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  PASS: ${name}`)
  } catch (error) {
    console.log(`  FAIL: ${name}`)
    console.log(`        ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

test('visited primary pages stay mounted while detail is open', () => {
  assert.match(appSource, /visitedPrimaryPages/)
  assert.match(appSource, /rememberPrimaryPage/)
  assert.match(appSource, /mountedPages\.map/)
  assert.doesNotMatch(appSource, /key=\{currentPage\}[\s\S]*?<ActivePage\s*\/>/)
})

test('reader keeps its detail source mounted until returning', () => {
  assert.match(appSource, /readerSourcePage === 'detail'/)
  assert.match(appSource, /currentPage === 'reader'/)
})

test('inactive preserved pages remain isolated from the visible page', () => {
  assert.match(appSource, /pageViewport:\s*\{[\s\S]*?overflow: 'hidden'/)
  assert.match(appSource, /display: page === currentPage \? 'block' : 'none'/)
})

if (process.exitCode) console.log('Some tests failed.')
else console.log('All tests passed!')
