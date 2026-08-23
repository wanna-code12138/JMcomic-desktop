import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/main/contentApi.ts'), 'utf-8')

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

test('all public content endpoints route through the validated gateway', () => {
  assert.match(source, /createContentGateway/)
  for (const method of ['homepage', 'search', 'category', 'detail', 'pages']) {
    assert.match(source, new RegExp(`contentGateway\\.${method}\\(`))
  }
})

test('BrowserWindow warmup belongs to the browser provider, not the direct fast path', () => {
  assert.match(source, /const browserProvider: ContentProvider/)
  assert.match(source, /await ensureReady\(\)/)
  const directStart = source.indexOf('const directProvider: ContentProvider')
  const browserStart = source.indexOf('const browserProvider: ContentProvider')
  assert.ok(directStart >= 0 && browserStart > directStart)
  assert.doesNotMatch(source.slice(directStart, browserStart), /ensureReady/)
})

test('unverified direct detail metadata remains on the browser fallback', () => {
  assert.match(source, /throw new Error\('direct-detail-unverified'\)/)
})

test('IPC responses keep existing fields and page stream preserves pages and scrambleId', () => {
  assert.match(source, /return \{ ok: true, data: result\.data \}/)
  assert.match(source, /data: result\.data\.results, totalPages: result\.data\.totalPages/)
  assert.match(source, /data: result\.data\.pages, scrambleId: result\.data\.scrambleId/)
  assert.match(source, /pages: result\.data\.pages/)
  assert.match(source, /scrambleId: result\.data\.scrambleId/)
})

test('provider metrics are privacy-safe and content URLs are not logged', () => {
  assert.match(source, /provider: result\.provider/)
  assert.match(source, /fallback: result\.fallback/)
  assert.doesNotMatch(source, /first URL|console\.log\('\[content:pages\]', chapterUrl/)
  assert.doesNotMatch(source, /metadata: \{[^}]*url/s)
})

if (process.exitCode) console.log('Some tests failed.')
else console.log('All tests passed!')
