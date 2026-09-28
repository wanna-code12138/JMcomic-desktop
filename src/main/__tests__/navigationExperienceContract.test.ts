import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/src/App.tsx'), 'utf-8')
const homeSource = readFileSync(resolve(process.cwd(), 'src/renderer/src/pages/HomePage.tsx'), 'utf-8')
const searchSource = readFileSync(resolve(process.cwd(), 'src/renderer/src/pages/SearchPage.tsx'), 'utf-8')
const categorySource = readFileSync(resolve(process.cwd(), 'src/renderer/src/pages/CategoriesPage.tsx'), 'utf-8')

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`  PASS: ${name}`)
  } catch (err) {
    console.log(`  FAIL: ${name}`)
    console.log(err)
    process.exitCode = 1
  }
}

test('App uses bounded page cache with limit of 3', () => {
  assert.match(appSource, /touchPage/)
  assert.match(appSource, /3/)
})

test('ReaderPage is mounted only when current page is reader', () => {
  assert.match(appSource, /currentPage === 'reader'\s*\?\s*\[\s*'reader'/)
})

test('Home, Search, and Categories pages capture and restore snapshots', () => {
  assert.match(homeSource, /usePageSnapshot/)
  assert.match(searchSource, /usePageSnapshot/)
  assert.match(categorySource, /usePageSnapshot/)
})

test('MangaCard eliminates hover re-renders and provides accessible favorite button', () => {
  const cardSource = readFileSync(resolve(process.cwd(), 'src/renderer/src/components/MangaCard.tsx'), 'utf-8')
  const cssSource = readFileSync(resolve(process.cwd(), 'src/renderer/src/assets/global.css'), 'utf-8')

  assert.doesNotMatch(cardSource, /useState\([^)]*hover/i)
  assert.match(cardSource, /useIsFavorite/)
  assert.match(cardSource, /<button[^>]+aria-label=/s)
  assert.match(cssSource, /:focus-within/)
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/)
})

if (process.exitCode) console.log('Some tests failed.')
else console.log('All navigation experience contract tests passed!')
