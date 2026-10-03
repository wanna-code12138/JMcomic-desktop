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

test('summarizer groups by provider, cacheState, priority and handles outcome statistics', () => {
  const directory = mkdtempSync(join(tmpdir(), 'jmcomic-perf-group-'))
  try {
    const logFile = join(directory, 'perf.log')
    writeFileSync(logFile, [
      '[perf] {"name":"content.request","phase":"finish","elapsedMs":100,"outcome":"ok","metadata":{"provider":"api","cacheState":"miss"}}',
      '[perf] {"name":"content.request","phase":"finish","elapsedMs":200,"outcome":"timeout","metadata":{"provider":"api","cacheState":"miss"}}',
      '[perf] {"name":"content.request","phase":"finish","elapsedMs":50,"outcome":"cancelled","metadata":{"provider":"api","cacheState":"miss"}}',
      '[perf] {"name":"content.request","phase":"finish","elapsedMs":800,"outcome":"ok","metadata":{"provider":"browser","cacheState":"hit"}}',
      '[perf] {"name":"image.request","phase":"finish","elapsedMs":30,"outcome":"ok","metadata":{"priority":"critical"}}',
      '[perf] {"name":"image.request","phase":"finish","elapsedMs":90,"outcome":"ok","metadata":{"priority":"background"}}'
    ].join('\n'))

    const result = spawnSync(process.execPath, [
      resolve('scripts/summarize-performance.mjs'),
      logFile
    ], { encoding: 'utf8' })

    assert.equal(result.status, 0, result.stderr)
    const summary = JSON.parse(result.stdout)

    // provider 分组
    assert.ok(summary['content.request.finish.provider.api'])
    assert.equal(summary['content.request.finish.provider.api'].count, 3)
    assert.ok(summary['content.request.finish.provider.browser'])
    assert.equal(summary['content.request.finish.provider.browser'].count, 1)

    // cacheState 分组且不混算
    assert.ok(summary['content.request.finish.cacheState.miss'])
    assert.equal(summary['content.request.finish.cacheState.miss'].count, 3)
    assert.ok(summary['content.request.finish.cacheState.hit'])
    assert.equal(summary['content.request.finish.cacheState.hit'].count, 1)

    // priority 分组
    assert.ok(summary['image.request.finish.priority.critical'])
    assert.equal(summary['image.request.finish.priority.critical'].p50, 30)
    assert.ok(summary['image.request.finish.priority.background'])
    assert.equal(summary['image.request.finish.priority.background'].p50, 90)

    // 取消不计入成功率分母（如果有 successRate，或者 outcome.cancelled 独立记录且不影响 ok 统计）
    assert.equal(summary['content.request.finish.outcome.cancelled'].count, 1)
    assert.equal(summary['content.request.finish.outcome.ok'].count, 2)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
