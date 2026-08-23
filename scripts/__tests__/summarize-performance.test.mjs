import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('summarizer merges logs and reports cache and outcome breakdowns', () => {
  const directory = mkdtempSync(join(tmpdir(), 'jmcomic-perf-'))
  try {
    const first = join(directory, 'main.log')
    const second = join(directory, 'renderer.log')
    writeFileSync(first, [
      '[perf] {"name":"image.online","phase":"finish","elapsedMs":2,"outcome":"ok","metadata":{"cache":true}}',
      '[perf] {"name":"image.online","phase":"finish","elapsedMs":20,"outcome":"ok","metadata":{"cache":false}}'
    ].join('\n'))
    writeFileSync(second,
      '[perf] {"name":"image.online","phase":"finish","elapsedMs":10,"outcome":"error","metadata":{"cache":false}}\n')

    const result = spawnSync(process.execPath, [
      resolve('scripts/summarize-performance.mjs'),
      first,
      second
    ], { encoding: 'utf8' })

    assert.equal(result.status, 0, result.stderr)
    const summary = JSON.parse(result.stdout)
    assert.deepEqual(summary['image.online.finish'], { count: 3, p50: 10, p95: 20, max: 20 })
    assert.deepEqual(summary['image.online.finish.cache.hit'], { count: 1, p50: 2, p95: 2, max: 2 })
    assert.deepEqual(summary['image.online.finish.cache.miss'], { count: 2, p50: 10, p95: 20, max: 20 })
    assert.deepEqual(summary['image.online.finish.outcome.error'], { count: 1, p50: 10, p95: 10, max: 10 })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
