import assert from 'assert'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf-8')
}

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

const env = source('src/renderer/src/env.d.ts')
const downloads = source('src/renderer/src/pages/DownloadsPage.tsx')
const detail = source('src/renderer/src/pages/MangaDetailPage.tsx')

test('renderer types expose downloaded-file availability without replacing existing fields', () => {
  assert.match(env, /interface DownloadedFileAvailability/)
  assert.match(env, /available\?: boolean/)
  assert.match(env, /availabilityReason\?: 'missing-root' \| 'missing-chapter' \| 'missing-pages'/)
  assert.match(downloads, /interface DownloadRow extends DownloadedFileAvailability/)
  assert.match(detail, /DownloadedFileAvailability/)
})

test('download task rows render a recoverable missing-file state', () => {
  assert.match(downloads, /task\.status === 'completed' && task\.available === false/)
  assert.match(downloads, />文件缺失</)
  assert.match(downloads, /downloadOpenTaskFolder\(task\.id\)/)
})

test('local detail guards reader opening for unavailable chapters', () => {
  assert.match(detail, /if \(ch\.available === false\) \{/)
  assert.match(detail, /文件缺失/)
  const guardIndex = detail.indexOf('if (ch.available === false) {')
  const readerIndex = detail.indexOf('openReader({', guardIndex)
  assert.ok(guardIndex >= 0 && readerIndex > guardIndex, 'availability guard must precede openReader')
  assert.match(detail, /downloadOpenTaskFolder\(ch\.taskId\)/)
})

if (process.exitCode) {
  console.log('Some tests failed.')
} else {
  console.log('All tests passed!')
}
