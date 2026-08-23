import assert from 'node:assert/strict'
import {
  createContentGateway,
  type ContentProvider,
  type GatewayListResult
} from '../contentGateway'
import type { ChapterPagesResult, MangaDetail, MangaListItem } from '../types'

function cards(title = '有效漫画'): MangaListItem[] {
  return [{ id: '1215915', title, coverUrl: 'https://cdn.example.com/cover.jpg' }]
}

function detail(title = '有效漫画'): MangaDetail {
  return {
    id: '1215915',
    title,
    author: '作者',
    coverUrl: 'https://cdn.example.com/cover.jpg',
    tags: ['韓漫'],
    description: '',
    chapters: [{ index: 0, title: '第1話', url: '/photo/1001' }]
  }
}

function pages(): ChapterPagesResult {
  return {
    pages: [
      { index: 0, imageUrl: 'https://cdn.example.com/0001.webp' },
      { index: 1, imageUrl: 'https://cdn.example.com/0002.webp' }
    ],
    scrambleId: 220980
  }
}

function listResult(): GatewayListResult {
  return { results: cards(), totalPages: 1 }
}

function provider(overrides: Partial<ContentProvider> = {}): ContentProvider {
  return {
    homepage: async () => cards(),
    search: async () => listResult(),
    category: async () => listResult(),
    detail: async () => detail(),
    pages: async () => pages(),
    ...overrides
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`  PASS: ${name}`)
  } catch (err) {
    console.log(`  FAIL: ${name}`)
    console.log(`        ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

async function main(): Promise<void> {
  await test('direct success avoids the browser provider', async () => {
    let directCalls = 0
    let browserCalls = 0
    const directValue = detail()
    const gateway = createContentGateway({
      direct: provider({ detail: async () => { directCalls++; return directValue } }),
      browser: provider({ detail: async () => { browserCalls++; return detail('浏览器') } }),
      ttlMs: 60_000
    })

    const result = await gateway.detail('1215915')
    assert.strictEqual(result.data, directValue)
    assert.deepEqual({ provider: result.provider, fallback: result.fallback }, {
      provider: 'direct',
      fallback: false
    })
    assert.equal(directCalls, 1)
    assert.equal(browserCalls, 0)
  })

  await test('rejected direct result falls back to the browser exactly once', async () => {
    let browserCalls = 0
    const browserValue = detail('浏览器结果')
    const gateway = createContentGateway({
      direct: provider({ detail: async () => { throw new Error('blocked') } }),
      browser: provider({ detail: async () => { browserCalls++; return browserValue } }),
      ttlMs: 60_000
    })

    const result = await gateway.detail('1215915')
    assert.strictEqual(result.data, browserValue)
    assert.equal(result.provider, 'browser')
    assert.equal(result.fallback, true)
    assert.equal(result.fallbackReason, 'direct-error')
    assert.equal(browserCalls, 1)
  })

  await test('invalid direct result falls back instead of entering the cache', async () => {
    let browserCalls = 0
    const gateway = createContentGateway({
      direct: provider({ detail: async () => detail('   ') }),
      browser: provider({ detail: async () => { browserCalls++; return detail('浏览器结果') } }),
      ttlMs: 60_000
    })

    const result = await gateway.detail('1215915')
    assert.equal(result.provider, 'browser')
    assert.equal(result.fallbackReason, 'detail-title')
    assert.equal(browserCalls, 1)
  })

  await test('concurrent identical detail calls share one direct request', async () => {
    const pending = deferred<MangaDetail>()
    let directCalls = 0
    const gateway = createContentGateway({
      direct: provider({ detail: () => { directCalls++; return pending.promise } }),
      browser: provider(),
      ttlMs: 60_000
    })

    const first = gateway.detail('1215915')
    const second = gateway.detail('1215915')
    assert.equal(directCalls, 1)
    const value = detail()
    pending.resolve(value)
    const results = await Promise.all([first, second])
    assert.strictEqual(results[0], results[1])
    assert.strictEqual(results[0].data, value)
  })

  await test('different detail keys remain independent', async () => {
    let directCalls = 0
    const gateway = createContentGateway({
      direct: provider({ detail: async (id) => { directCalls++; return { ...detail(), id } } }),
      browser: provider(),
      ttlMs: 60_000
    })

    const [first, second] = await Promise.all([
      gateway.detail('1215915'),
      gateway.detail('1215916')
    ])
    assert.equal(directCalls, 2)
    assert.equal(first.data.id, '1215915')
    assert.equal(second.data.id, '1215916')
  })

  await test('fresh TTL cache avoids a second provider call', async () => {
    let now = 1_000
    let directCalls = 0
    const gateway = createContentGateway({
      direct: provider({ homepage: async () => { directCalls++; return cards() } }),
      browser: provider(),
      ttlMs: 60_000,
      now: () => now
    })

    await gateway.homepage('recommended')
    now += 59_999
    await gateway.homepage('recommended')
    assert.equal(directCalls, 1)
  })

  await test('page gateway preserves the exact source array and index order', async () => {
    const directValue = pages()
    const gateway = createContentGateway({
      direct: provider({ pages: async () => directValue }),
      browser: provider(),
      ttlMs: 60_000
    })

    const result = await gateway.pages('/photo/1001')
    assert.strictEqual(result.data, directValue)
    assert.strictEqual(result.data.pages, directValue.pages)
    assert.deepEqual(result.data.pages.map((page) => page.index), [0, 1])
  })

  if (process.exitCode) console.log('Some tests failed.')
  else console.log('All tests passed!')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
