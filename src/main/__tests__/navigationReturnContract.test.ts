import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/src/App.tsx'), 'utf-8')
const hostSource = readFileSync(resolve(process.cwd(), 'src/renderer/src/components/PageHost.tsx'), 'utf-8')

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
  assert.match(hostSource, /mountedPages\.map/)
  assert.doesNotMatch(appSource, /key=\{currentPage\}[\s\S]*?<ActivePage\s*\/>/)
})

test('inactive preserved pages remain isolated from the visible page', () => {
  const css = readFileSync(resolve('src/renderer/src/assets/global.css'), 'utf8')
  assert.match(css, /\.app-page-stack \{[^}]*height: 100%;[^}]*overflow: hidden/)
  assert.match(css, /\.app-page-surface \{[^}]*position: absolute; inset: 0; min-height: 0; overflow: hidden/)
  assert.match(hostSource, /element\.inert = !isCurrent/)
  assert.match(hostSource, /display: isCurrent \? 'block' : 'none'/)
  assert.match(hostSource, /aria-hidden=\{!isCurrent\}/)
})

if (process.exitCode) console.log('Some tests failed.')
else console.log('All tests passed!')
