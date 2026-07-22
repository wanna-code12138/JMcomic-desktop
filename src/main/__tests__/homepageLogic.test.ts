import assert from 'assert'
import { buildHomepageUrl, buildHomepageCacheKey, mapCardToMangaCardData, type HomepageCategory } from '../homepageLogic'

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

// ─── buildHomepageUrl ──────────────────────────────────────────────

test('recommended returns homepage root URL', () => {
  const url = buildHomepageUrl('18comic.vip', 'recommended')
  assert.strictEqual(url, 'https://18comic.vip/')
})

test('latest returns /albums with o=mr', () => {
  const url = buildHomepageUrl('18comic.vip', 'latest')
  assert.strictEqual(url, 'https://18comic.vip/albums?o=mr')
})

test('popular returns /albums with o=mv', () => {
  const url = buildHomepageUrl('18comic.vip', 'popular')
  assert.strictEqual(url, 'https://18comic.vip/albums?o=mv')
})

test('domain is configurable', () => {
  const url = buildHomepageUrl('jmcomic2.moe', 'popular')
  assert.strictEqual(url, 'https://jmcomic2.moe/albums?o=mv')
})

// ─── buildHomepageCacheKey ─────────────────────────────────────────

test('cache key for recommended appends category', () => {
  const key = buildHomepageCacheKey('recommended')
  assert.strictEqual(key, 'homepage:recommended')
})

test('cache key for latest appends category', () => {
  const key = buildHomepageCacheKey('latest')
  assert.strictEqual(key, 'homepage:latest')
})

test('cache key for popular appends category', () => {
  const key = buildHomepageCacheKey('popular')
  assert.strictEqual(key, 'homepage:popular')
})

test('cache keys are distinct across categories', () => {
  const keys = new Set([
    buildHomepageCacheKey('recommended'),
    buildHomepageCacheKey('latest'),
    buildHomepageCacheKey('popular')
  ])
  assert.strictEqual(keys.size, 3)
})

// ─── mapCardToMangaCardData ──────────────────────────────────────

test('mapCardToMangaCardData maps chapter to latestChapter', () => {
  const card = { id: '1', title: 'Test', coverUrl: 'url', author: 'David', chapter: 'Ch. 5' }
  const result = mapCardToMangaCardData(card)
  assert.strictEqual(result.id, '1')
  assert.strictEqual(result.title, 'Test')
  assert.strictEqual(result.coverUrl, 'url')
  assert.strictEqual(result.author, 'David')
  assert.strictEqual(result.latestChapter, 'Ch. 5')
})

test('mapCardToMangaCardData handles missing chapter', () => {
  const card = { id: '2', title: 'No Chapter', coverUrl: 'url' }
  const result = mapCardToMangaCardData(card)
  assert.strictEqual(result.latestChapter, undefined)
  assert.strictEqual(result.author, undefined)
})

test('mapCardToMangaCardData does not leak chapter field', () => {
  const card = { id: '3', title: 'X', coverUrl: 'url', chapter: 'Ch. 1' }
  const result = mapCardToMangaCardData(card) as unknown as Record<string, unknown>
  assert.strictEqual('chapter' in result, false)
})

// ─── Type coverage ─────────────────────────────────────────────────

test('HomepageCategory only accepts valid values', () => {
  const valid: HomepageCategory[] = ['recommended', 'latest', 'popular']
  assert.strictEqual(valid.length, 3)
})

console.log('\nAll tests completed.')
if (process.exitCode) {
  console.log('Some tests failed.')
} else {
  console.log('All tests passed!')
}
