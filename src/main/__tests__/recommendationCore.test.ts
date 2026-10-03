import assert from 'node:assert/strict'
import {
  RECOMMENDATION_BATCH_COUNT,
  RECOMMENDATION_EXPOSURE_TTL_MS,
  RECOMMENDATION_INITIAL_COUNT,
  buildRecommendationFeed,
  nextRecommendationVisibleCount,
  normalizeRecommendationTags,
  pruneRecommendationExposures,
  recordRecommendationExposures,
  type RecommendationPool
} from '../../shared/recommendationCore'
import type { MangaListItem } from '../types'

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

function cards(prefix: string, count: number, author?: string): MangaListItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    title: `${prefix} ${index}`,
    coverUrl: `https://cdn/${prefix}-${index}.jpg`,
    author
  }))
}

test('normalizes curated tags, removes duplicates, and limits selection to eight', () => {
  assert.deepEqual(
    normalizeRecommendationTags([
      '全彩', '純愛', '全彩', '劇情', '校園', '百合', '韓漫', '美漫', '科幻', '不存在'
    ]),
    ['全彩', '純愛', '劇情', '校園', '百合', '韓漫', '美漫', '科幻']
  )
})

test('normalizes recommendation tags from persisted JSON and rejects malformed values', () => {
  assert.deepEqual(normalizeRecommendationTags('["全彩","純愛"]'), ['全彩', '純愛'])
  assert.deepEqual(normalizeRecommendationTags('not-json'), [])
  assert.deepEqual(normalizeRecommendationTags({ tag: '全彩' }), [])
})

test('weighted feed follows 35/25/20/20 source allocation', () => {
  const pools: RecommendationPool[] = [
    { source: 'latest', cards: cards('latest', 30) },
    { source: 'weekly', cards: cards('weekly', 30) },
    { source: 'quality', cards: cards('quality', 30) },
    { source: 'tag', tag: '全彩', cards: cards('tag', 30) }
  ]
  const feed = buildRecommendationFeed(pools, [], { now: 10_000, seed: 1, limit: 40 })
  const count = (prefix: string): number => feed.filter((card) => card.id.startsWith(prefix)).length
  assert.equal(feed.length, 40)
  assert.equal(count('latest'), 14)
  assert.equal(count('weekly'), 10)
  assert.equal(count('quality'), 8)
  assert.equal(count('tag'), 8)
})

test('missing tag preferences redistribute their share across base sources', () => {
  const pools: RecommendationPool[] = [
    { source: 'latest', cards: cards('latest', 30) },
    { source: 'weekly', cards: cards('weekly', 30) },
    { source: 'quality', cards: cards('quality', 30) }
  ]
  const feed = buildRecommendationFeed(pools, [], { now: 10_000, seed: 2, limit: 40 })
  assert.equal(feed.length, 40)
  assert.equal(feed.filter((card) => card.id.startsWith('latest')).length, 17)
  assert.equal(feed.filter((card) => card.id.startsWith('weekly')).length, 13)
  assert.equal(feed.filter((card) => card.id.startsWith('quality')).length, 10)
})

test('equal-weight tag pools both contribute to the preferred-tag share', () => {
  const pools: RecommendationPool[] = [
    { source: 'latest', cards: cards('latest', 30) },
    { source: 'weekly', cards: cards('weekly', 30) },
    { source: 'quality', cards: cards('quality', 30) },
    { source: 'tag', tag: '全彩', cards: cards('color', 20) },
    { source: 'tag', tag: '純愛', cards: cards('love', 20) }
  ]
  const feed = buildRecommendationFeed(pools, [], { now: 10_000, seed: 3, limit: 40 })
  const color = feed.filter((card) => card.id.startsWith('color')).length
  const love = feed.filter((card) => card.id.startsWith('love')).length
  assert.equal(color + love, 8)
  assert.ok(Math.abs(color - love) <= 1)
})

test('items exposed in the last seven days rank behind unseen alternatives', () => {
  const now = 10 * RECOMMENDATION_EXPOSURE_TTL_MS
  const pool: RecommendationPool = {
    source: 'latest',
    cards: [
      { id: 'seen', title: 'seen', coverUrl: 'u' },
      { id: 'unseen', title: 'unseen', coverUrl: 'u' }
    ]
  }
  const feed = buildRecommendationFeed(
    [pool],
    [{ id: 'seen', exposedAt: now - RECOMMENDATION_EXPOSURE_TTL_MS + 1 }],
    { now, seed: 4 }
  )
  assert.deepEqual(feed.map((card) => card.id), ['unseen', 'seen'])
})

test('exposure helpers prune expired rows and update duplicate ids', () => {
  const now = 10 * RECOMMENDATION_EXPOSURE_TTL_MS
  const pruned = pruneRecommendationExposures([
    { id: 'expired', exposedAt: now - RECOMMENDATION_EXPOSURE_TTL_MS },
    { id: 'active', exposedAt: now - 1 }
  ], now)
  assert.deepEqual(pruned, [{ id: 'active', exposedAt: now - 1 }])
  assert.deepEqual(
    recordRecommendationExposures(pruned, ['active', 'new', 'new'], now),
    [{ id: 'active', exposedAt: now }, { id: 'new', exposedAt: now }]
  )
})

test('feed avoids adjacent same-author cards when an alternative is available', () => {
  const pools: RecommendationPool[] = [
    { source: 'latest', cards: cards('same', 3, '作者甲') },
    { source: 'latest', cards: cards('other', 2, '作者乙') }
  ]
  const feed = buildRecommendationFeed(pools, [], { now: 10_000, seed: 5 })
  for (let index = 1; index < feed.length; index++) {
    if (feed[index].author === feed[index - 1].author) {
      const laterAlternative = feed.slice(index + 1).some((card) => card.author !== feed[index - 1].author)
      assert.equal(laterAlternative, false)
    }
  }
})

test('visible count starts at 24 and grows by batches of 12 without exceeding total', () => {
  assert.equal(RECOMMENDATION_INITIAL_COUNT, 24)
  assert.equal(RECOMMENDATION_BATCH_COUNT, 12)
  assert.equal(nextRecommendationVisibleCount(0, 100), 24)
  assert.equal(nextRecommendationVisibleCount(24, 100), 36)
  assert.equal(nextRecommendationVisibleCount(36, 40), 40)
  assert.equal(nextRecommendationVisibleCount(0, 10), 10)
})

console.log('\nAll recommendation core tests completed.')
if (process.exitCode) console.log('Some tests failed.')
else console.log('All tests passed!')
