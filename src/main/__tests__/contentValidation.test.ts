import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateCards, validateDetail, validatePages } from '../contentValidation'
import type { ChapterPagesResult, MangaDetail, MangaListItem } from '../types'

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

const validCards: MangaListItem[] = [{
  id: '1215915',
  title: '示例漫画',
  coverUrl: 'https://cdn.example.com/1215915.jpg'
}]

const validDetail: MangaDetail = {
  id: '1215915',
  title: '示例漫画',
  author: '作者甲, 作者乙',
  coverUrl: 'https://cdn.example.com/1215915.jpg',
  tags: ['韓漫', '連載中'],
  description: '',
  chapters: [
    { index: 0, title: '第1話', url: '/photo/1001' },
    { index: 1, title: '第2話', url: '/photo/1002' }
  ]
}

test('validateCards accepts a non-empty valid card list without copying it', () => {
  const result = validateCards(validCards)
  assert.equal(result.ok, true)
  if (result.ok) assert.strictEqual(result.data, validCards)
})

test('validateCards rejects empty direct results', () => {
  assert.deepEqual(validateCards([]), { ok: false, reason: 'cards-empty' })
})

test('validateDetail accepts a valid JM1215915-shaped detail without copying it', () => {
  const result = validateDetail(validDetail)
  assert.equal(result.ok, true)
  if (result.ok) assert.strictEqual(result.data, validDetail)
})

test('validateDetail rejects a missing title', () => {
  assert.deepEqual(validateDetail({ ...validDetail, title: '   ' }), {
    ok: false,
    reason: 'detail-title'
  })
})

test('validateDetail rejects empty chapters', () => {
  assert.deepEqual(validateDetail({ ...validDetail, chapters: [] }), {
    ok: false,
    reason: 'detail-chapters'
  })
})

function pages(indices = [0, 1, 2]): ChapterPagesResult {
  return {
    pages: indices.map((index) => ({
      index,
      imageUrl: `https://cdn.example.com/album/${String(index + 1).padStart(4, '0')}.webp`
    })),
    scrambleId: 220980
  }
}

test('validatePages accepts ordered pages and preserves their exact array identity', () => {
  const input = pages()
  const result = validatePages(input)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.strictEqual(result.data, input)
    assert.strictEqual(result.data.pages, input.pages)
    assert.deepEqual(result.data.pages.map((page) => page.index), [0, 1, 2])
  }
})

test('validatePages rejects duplicate or gapped indices instead of sorting them', () => {
  assert.deepEqual(validatePages(pages([0, 0, 2])), {
    ok: false,
    reason: 'pages-indices'
  })
  assert.deepEqual(validatePages(pages([0, 2, 3])), {
    ok: false,
    reason: 'pages-indices'
  })
})

test('validatePages rejects non-HTTPS image URLs', () => {
  const input = pages()
  input.pages[1].imageUrl = 'http://cdn.example.com/0002.webp'
  assert.deepEqual(validatePages(input), { ok: false, reason: 'pages-url' })
})

test('validatePages rejects an invalid scramble threshold', () => {
  assert.deepEqual(validatePages({ ...pages(), scrambleId: -1 }), {
    ok: false,
    reason: 'pages-scramble'
  })
})

test('direct adapter retains canonical metadata selectors and chapter scrambleId', () => {
  const adapter = readFileSync(resolve(process.cwd(), 'src/main/siteAdapter.ts'), 'utf-8')
  const types = readFileSync(resolve(process.cwd(), 'src/main/types.ts'), 'utf-8')
  assert.match(adapter, /\[data-type="author"\] a\[name="vote_"\]\.visible/)
  assert.match(adapter, /\[data-type="tags"\] a\[name="vote_"\]\.visible/)
  assert.match(adapter, /return \{ pages, scrambleId \}/)
  assert.match(types, /getChapterPages\(chapterUrl: string\): Promise<ChapterPagesResult>/)
})

test('direct adapter uses current Cheerio types and matches the paged favorites contract', () => {
  const adapter = readFileSync(resolve(process.cwd(), 'src/main/siteAdapter.ts'), 'utf-8')
  const types = readFileSync(resolve(process.cwd(), 'src/main/types.ts'), 'utf-8')
  assert.doesNotMatch(adapter, /declare module 'cheerio'/)
  assert.match(types, /getFavorites\?\(page\?: number\): Promise<\{\s*results: MangaListItem\[\];\s*totalPages: number\s*\}>/)
})

if (process.exitCode) {
  console.log('Some tests failed.')
} else {
  console.log('All tests passed!')
}
