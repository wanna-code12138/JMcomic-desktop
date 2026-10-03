import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? discover(path) : /\.test\.(ts|mjs)$/.test(path) ? [path] : []
  })
}

const tests = [...discover('src'), ...discover('scripts')].sort()
let failed = 0
for (const path of tests) {
  const args = path.endsWith('.ts') ? ['--import', 'tsx', path] : ['--test', path]
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 60_000, windowsHide: true })
  if (result.status !== 0 || result.error) {
    failed++
    console.error(`FAIL ${path}\n${result.stdout ?? ''}${result.stderr ?? ''}${result.error ?? ''}`)
  } else {
    console.log(`PASS ${path}`)
  }
}
console.log(`TOTAL=${tests.length} PASSED=${tests.length - failed} FAILED=${failed}`)
if (failed > 0) process.exitCode = 1
