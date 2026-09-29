import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseSettingPayload,
  parseListPayload,
  parseAlbumPayload,
  parseComicReadPayload,
  JmApiSchemaError
} from '../content/jmAppApiSchemas'
import { validateCards, validateDetail, validatePages } from '../contentValidation'

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  PASS: ${name}`)
  } catch (error) {
    console.log(`  FAIL: ${name}`)
    console.log(error)
    process.exitCode = 1
  }
}

const loadFixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, 'fixtures/content-api/synthetic', name),
      'utf8'
    )
  )

const imageOrigin = 'https://cdn-msp.18comic.vip'

// 1. Setting 测试
test('parseSettingPayload parses valid setting and rejects invalid versions', () => {
  const setting = loadFixture('setting.json')
  const parsed = parseSettingPayload(setting)
  assert.equal(parsed.jm3Version, '2.0.30')
  assert.equal(parsed.imgHost, 'cdn-msp.18comic.vip')

  assert.throws(() => parseSettingPayload({ jm3_version: 'invalid' }), /JmApiSchemaError/)
  assert.throws(() => parseSettingPayload({}), /JmApiSchemaError/)
})

// 2. Search / List 测试
test('parseListPayload parses search fixture and passes card validation', () => {
  const search = loadFixture('search.json')
  const parsed = parseListPayload(search, imageOrigin)
  assert.equal(parsed.totalPages, 1) // App API page size is 80, not the website's 20.
  assert.equal(parsed.results.length, 2)
  assert.equal(parsed.results[0].id, '1215915')
  assert.equal(parsed.results[0].title, '男人配额制')
  assert.equal(parsed.results[0].coverUrl, 'https://cdn-msp.18comic.vip/media/albums/1215915.jpg')

  const cardValidation = validateCards(parsed.results)
  assert.equal(cardValidation.ok, true)
})

test('parseListPayload rejects malformed items (missing title, invalid id, non-https)', () => {
  assert.throws(
    () => parseListPayload({ total: 1, content: [{ id: '', name: 'test' }] }, imageOrigin),
    /JmApiSchemaError/
  )
  assert.throws(
    () => parseListPayload({ total: 1, content: [{ id: '1', name: '' }] }, imageOrigin),
    /JmApiSchemaError/
  )
})

// 3. Album / Detail 测试
test('parseAlbumPayload parses album fixture and passes detail validation', () => {
  const album = loadFixture('album.json')
  const parsed = parseAlbumPayload(album, imageOrigin)
  assert.equal(parsed.id, '1215915')
  assert.equal(parsed.title, '男人配额制')
  assert.equal(parsed.author, 'MALPOI, 達蘭')
  assert.equal(parsed.tags.length, 6) // Preserve all canonical tags returned by the API.
  assert.equal(parsed.chapters.length, 2)
  assert.equal(parsed.chapters[0].index, 0)
  assert.equal(parsed.chapters[0].title, '第 1 话')
  assert.equal(parsed.chapters[0].url, '/photo/220980')

  const detailValidation = validateDetail(parsed)
  assert.equal(detailValidation.ok, true)
})

test('parseAlbumPayload maps an explicitly empty series to the single album chapter', () => {
  for (const chapters of [{ series: [] }, { episodes: [] }]) {
    const parsed = parseAlbumPayload({ id: 1477646, name: '单篇合成样本', ...chapters }, imageOrigin)
    assert.deepEqual(parsed.chapters, [{ index: 0, title: '单篇合成样本', url: '/photo/1477646' }])
    assert.equal(validateDetail(parsed).ok, true)
  }
})

test('parseAlbumPayload still rejects missing or malformed chapter data and invalid fields', () => {
  for (const chapters of [{}, { series: null }, { series: {} }, { series: [null] }]) {
    assert.throws(() => parseAlbumPayload({ id: '1', name: 't', ...chapters }, imageOrigin), /JmApiSchemaError/)
  }
  assert.throws(() => parseAlbumPayload({ id: '', name: 't', series: [{ name: '1' }] }, imageOrigin), /JmApiSchemaError/)
})

// 4. Comic Read / Pages 测试
test('parseComicReadPayload parses pages and passes page validation', () => {
  const comic = loadFixture('comic-read.json')
  const parsed = parseComicReadPayload(comic, imageOrigin)
  assert.equal(parsed.scrambleId, 220980)
  assert.equal(parsed.pages.length, 3)
  assert.deepEqual(
    parsed.pages.map((p) => p.index),
    [0, 1, 2]
  )
  assert.equal(
    parsed.pages[0].imageUrl,
    'https://cdn-msp.18comic.vip/media/photos/220980/00001.webp'
  )

  const pagesValidation = validatePages(parsed)
  assert.equal(pagesValidation.ok, true)
})

test('parseComicReadPayload strictly rejects unordered or duplicate page indices without sorting', () => {
  // 必须直接失败，严禁暗中排序修复乱序
  const unordered = {
    scramble_id: 1,
    id: 10,
    pages: [
      { index: 1, imageUrl: 'https://cdn-msp.18comic.vip/1.webp' },
      { index: 0, imageUrl: 'https://cdn-msp.18comic.vip/0.webp' }
    ]
  }
  assert.throws(() => parseComicReadPayload(unordered, imageOrigin), /JmApiSchemaError/)

  const duplicate = {
    scramble_id: 1,
    id: 10,
    pages: [
      { index: 0, imageUrl: 'https://cdn-msp.18comic.vip/0.webp' },
      { index: 0, imageUrl: 'https://cdn-msp.18comic.vip/1.webp' }
    ]
  }
  assert.throws(() => parseComicReadPayload(duplicate, imageOrigin), /JmApiSchemaError/)
})

if (process.exitCode) console.log('Some tests failed.')
else console.log('All jmAppApiSchemas tests passed!')
