import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createJmAppApiProvider } from '../content/jmAppApiProvider'
import { createJmAppApiTransport, JM_API_ENDPOINTS } from '../content/jmAppApiTransport'
import { BUILTIN_JM_API_PROFILES } from '../content/jmAppApiProfiles'
import { parseAlbumPayload, parseComicReadPayload, parseListPayload } from '../content/jmAppApiSchemas'
import { createImageRequestScheduler } from '../imageRequestScheduler'

const route = {
  apiOrigin: 'https://api.18comic.vip',
  imageOrigin: 'https://cdn-msp.18comic.vip',
  profile: BUILTIN_JM_API_PROFILES[0]
}
const card = { total: 1, content: [{ id: '101', name: 'Synthetic', image: '/media/albums/101.jpg' }] }

test('API search preserves tag mode and time filtering', async () => {
  let query: Record<string, string> | undefined
  const provider = createJmAppApiProvider({ async request(_key, input) { query = input; return card } })
  await provider.search({ query: 'x', page: 2, mainTag: 1, order: 'mv', time: 'w' })
  assert.equal(query?.main_tag, '1')
  assert.equal(query?.t, 'w')
})

test('API category uses filter endpoint and preserves category/ranking period', async () => {
  assert.equal(JM_API_ENDPOINTS.category.path, '/categories/filter')
  let query: Record<string, string> | undefined
  const provider = createJmAppApiProvider({ async request(_key, input) { query = input; return card } })
  await provider.category({ category: 'doujin', order: 'mv', time: 'm', page: 3 })
  assert.equal(query?.c, 'doujin')
  assert.equal(query?.o, 'mv_m')
  assert.equal(query?.page, '3')
})

test('unsupported API filters fail before network rather than return unrelated results', async () => {
  let calls = 0
  const provider = createJmAppApiProvider({ async request() { calls++; return card } })
  await assert.rejects(provider.category({ subCategory: 'chinese' }), /unsupported/i)
  await assert.rejects(provider.category({ category: 'doujin', tag: 'x' }), /unsupported/i)
  await assert.rejects(provider.search({ query: 'x', page: 1, mainTag: 0, category: 'doujin', order: 'mr', time: 'a' }), /unsupported/i)
  assert.equal(calls, 0)
})

test('API size limits count UTF-8 bytes rather than JS characters', async () => {
  const transport = createJmAppApiTransport({ route,
    endpoints: { setting: { ...JM_API_ENDPOINTS.setting, maxResponseBytes: 10 } },
    fetchPort: { async send() { return { status: 200, headers: {}, bodyText: '汉'.repeat(5) } } }
  })
  await assert.rejects(transport.request('setting'), /RESPONSE_TOO_LARGE/)
})

test('API timeout aborts a stalled fetch instead of hanging the fallback chain', async () => {
  let aborted = false
  const transport = createJmAppApiTransport({ route,
    endpoints: { setting: { ...JM_API_ENDPOINTS.setting, timeoutMs: 10 } },
    fetchPort: { send(req) {
      return new Promise((_resolve, reject) => {
        req.signal?.addEventListener('abort', () => { aborted = true; reject(req.signal?.reason) }, { once: true })
        setTimeout(() => reject(new Error('test watchdog: timeout not applied')), 100)
      })
    } }
  })
  await assert.rejects(transport.request('setting'), /TIMEOUT/)
  assert.equal(aborted, true)
})

test('API image URLs reject HTTP, userinfo and spoofed hosts instead of repairing them', () => {
  for (const image of ['http://cdn-msp.18comic.vip/a.jpg', 'https://cdn-msp.18comic.vip.evil.test/a.jpg', 'https://user@cdn-msp.18comic.vip/a.jpg']) {
    assert.throws(() => parseListPayload({ total: 1, content: [{ id: '1', name: 'x', image }] }, route.imageOrigin))
  }
  assert.throws(() => parseComicReadPayload({ scramble_id: 1, images: ['1.jpg'] }, route.imageOrigin))
})

test('streaming downloads hold the concurrency slot until the body completes', async () => {
  const scheduler = createImageRequestScheduler(1)
  let finish!: () => void
  const done = new Promise<void>((resolve) => { finish = resolve })
  const first = await scheduler.run('first', async () => ({ done }), (value) => value.done)
  let started = false
  const second = scheduler.run('second', async () => { started = true; return 2 })
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(started, false)
  assert.equal(scheduler.activeCount(), 1)
  finish()
  assert.equal(await second, 2)
  await first.done
})

test('mobile lists use the observed 80 item page size instead of multiplying pagination', () => {
  assert.equal(parseListPayload({ ...card, total: 81 }, route.imageOrigin).totalPages, 2)
})

test('mobile cards with an empty image field use the canonical album cover path', () => {
  const parsed = parseListPayload({ total: 1, content: [{ id: '101', name: 'Synthetic', image: '' }] }, route.imageOrigin)
  assert.equal(parsed.results[0].coverUrl, `${route.imageOrigin}/media/albums/101.jpg`)
})

test('mobile album shape preserves author arrays and all canonical tags', () => {
  const detail = parseAlbumPayload({ id: 101, name: 'Synthetic', author: ['A', 'B'], tags: ['1', '2', '3', '4', '5', '6'], total_views: '12', series: [{ id: '202', name: 'Chapter', sort: '1' }] }, route.imageOrigin)
  assert.equal(detail.coverUrl, `${route.imageOrigin}/media/albums/101.jpg`)
  assert.equal(detail.author, 'A, B')
  assert.equal(detail.tags.length, 6)
  assert.equal(detail.totalViews, '12')
})

test('comic_read validates 1-based page numbers and rejects page count/ID conflicts', () => {
  const payload = { id: 101, scramble_id: '220980', total_page: 2, images: [{ page: 1, image: '1.jpg' }, { page: 2, image: '2.jpg' }] }
  const result = parseComicReadPayload(payload, route.imageOrigin, '101')
  assert.deepEqual(result.pages.map((item) => item.index), [0, 1])
  assert.throws(() => parseComicReadPayload({ ...payload, total_page: 3 }, route.imageOrigin, '101'))
  assert.throws(() => parseComicReadPayload(payload, route.imageOrigin, '102'))
})

test('startup does not force browser verification or gate local download recovery on it', () => {
  const index = readFileSync('src/main/index.ts', 'utf8')
  assert.doesNotMatch(index, /warmupSession\(mainWindow\)/)
  assert.match(index, /warmAnonymousContentProvider\(\)/)
})

test('download manifest resolution uses the same public gateway as the reader', () => {
  const source = readFileSync('src/main/downloadManager.ts', 'utf8')
  assert.doesNotMatch(source, /import.*extractChapterPages.*scraperWindow/)
  assert.match(source, /getPublicChapterPages\(task.chapterUrl\)/)
  assert.match(source, /getPublicMangaDetail\(task.mangaId\)/)
})
