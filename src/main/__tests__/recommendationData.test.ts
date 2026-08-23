import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildAlbumListPath,
  buildRecommendationSourceRequests,
  selectRotatingTags
} from '../recommendationData'

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

test('builds exact direct paths for simple album lists and tag searches', () => {
  assert.equal(
    buildAlbumListPath({ order: 'mv', time: 'w', page: 1 }),
    '/albums?page=1&o=mv&t=w'
  )
  assert.equal(
    buildAlbumListPath({ tag: '純愛', order: 'mv', time: 'm', page: 1 }),
    '/search/photos?search_query=%E7%B4%94%E6%84%9B&page=1&main_tag=0&o=mv&t=m'
  )
})

test('rotates at most three equal-weight tags and wraps cyclically', () => {
  const tags = ['全彩', '純愛', '劇情', '校園', '百合', '科幻', '韓漫', '美漫']
  assert.deepEqual(selectRotatingTags(tags, 3, 0), {
    tags: ['全彩', '純愛', '劇情'],
    nextOffset: 3
  })
  assert.deepEqual(selectRotatingTags(tags, 3, 7), {
    tags: ['美漫', '全彩', '純愛'],
    nextOffset: 2
  })
  assert.deepEqual(selectRotatingTags(['全彩', '純愛'], 3, 0), {
    tags: ['全彩', '純愛'],
    nextOffset: 0
  })
})

test('recommendation requests include agreed base mix and monthly tag discovery', () => {
  const result = buildRecommendationSourceRequests(['全彩', '純愛', '劇情', '校園'], 1)
  assert.deepEqual(result.sources, [
    { source: 'latest', request: { order: 'mr', time: 'a', page: 1, recommendation: true } },
    { source: 'weekly', request: { order: 'mv', time: 'w', page: 1, recommendation: true } },
    { source: 'quality', request: { order: 'tf', time: 'a', page: 1, recommendation: true } },
    { source: 'quality', request: { order: 'tr', time: 'a', page: 1, recommendation: true } },
    { source: 'tag', tag: '純愛', request: { tag: '純愛', order: 'mv', time: 'm', page: 1, recommendation: true } },
    { source: 'tag', tag: '劇情', request: { tag: '劇情', order: 'mv', time: 'm', page: 1, recommendation: true } },
    { source: 'tag', tag: '校園', request: { tag: '校園', order: 'mv', time: 'm', page: 1, recommendation: true } }
  ])
  assert.equal(result.nextTagOffset, 0)
})

test('recommendation endpoint uses public content only and preload exposes it', () => {
  const contentApi = readFileSync(resolve(process.cwd(), 'src/main/contentApi.ts'), 'utf-8')
  const preload = readFileSync(resolve(process.cwd(), 'src/preload/index.ts'), 'utf-8')
  assert.match(contentApi, /content:recommendations/)
  assert.match(contentApi, /buildRecommendationSourceRequests/)
  assert.match(contentApi, /contentGateway\.category\(source\.request\)/)
  assert.match(contentApi, /request\.recommendation === true/)
  const start = contentApi.indexOf("ipcMain.handle('content:recommendations'")
  const end = contentApi.indexOf("ipcMain.handle('content:search'", start)
  const handler = contentApi.slice(start, end)
  assert.ok(start >= 0 && end > start)
  assert.doesNotMatch(handler, /favorites|reading_history|search_history|downloads|history:/)
  assert.match(preload, /contentRecommendations: \(tagOffset\?: number\)/)
  assert.match(preload, /ipcRenderer\.invoke\('content:recommendations', tagOffset\)/)
})

console.log('\nAll recommendation data tests completed.')
if (process.exitCode) console.log('Some tests failed.')
else console.log('All tests passed!')
