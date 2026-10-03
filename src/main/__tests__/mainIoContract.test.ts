import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

const root = process.cwd()
const readFile = (p: string) => readFileSync(resolve(root, p), 'utf-8')

test('networkProbe does not call execSync or execFileSync for proxy detection', () => {
  const code = readFile('src/main/networkProbe.ts')
  assert.doesNotMatch(code, /execSync\(/)
  assert.doesNotMatch(code, /execFileSync\(/)
})

test('imageLoader clearCache and cacheSize IPC handlers do not call synchronous readdirSync', () => {
  const code = readFile('src/main/imageLoader.ts')
  // 校验 image:clearCache 与 image:cacheSize 委托给异步实现
  assert.match(code, /ipcMain\.handle\('image:clearCache',\s*async\s*\(\)\s*=>\s*\{?\s*return\s+clearImageCacheAsync\(/)
  assert.match(code, /ipcMain\.handle\('image:cacheSize',\s*async\s*\(\)\s*=>\s*\{?\s*return\s+getImageCacheSizeAsync\(/)
})

test('downloadManager uses asynchronous page resolution and directory inspection', () => {
  const code = readFile('src/main/downloadManager.ts')
  assert.match(code, /await inspectChapterFiles\(/)
  const core = readFile('src/main/downloadCore.ts')
  assert.doesNotMatch(core, /readdirSync|statSync|readFileSync/)
})

if (process.exitCode) console.log('Some tests failed.')
else console.log('All main process IO contract tests passed!')
