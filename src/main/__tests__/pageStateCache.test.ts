import assert from 'node:assert/strict'
import {
  createPageCacheState,
  touchPage,
  saveSnapshot,
  takeSnapshot,
  type PrimaryPageId,
  type PageSnapshot,
  type PageCacheState
} from '../../renderer/src/navigation/pageStateCache'

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

test('page LRU bounded cache basic flow', () => {
  let state = createPageCacheState('home')
  assert.deepEqual(state.mounted, ['home'])

  state = touchPage(state, 'search', 3)
  state = touchPage(state, 'categories', 3)
  state = touchPage(state, 'favorites', 3)
  assert.deepEqual(state.mounted, ['search', 'categories', 'favorites'])

  state = saveSnapshot(state, 'search', { scrollTop: 420, page: 2, filters: { query: 'x' } })
  assert.equal(takeSnapshot(state, 'search')?.scrollTop, 420)
})

test('touching existing mounted page moves it to MRU position without growing', () => {
  let state = createPageCacheState('home')
  state = touchPage(state, 'search', 3)
  state = touchPage(state, 'categories', 3)
  assert.deepEqual(state.mounted, ['home', 'search', 'categories'])

  state = touchPage(state, 'search', 3)
  assert.deepEqual(state.mounted, ['home', 'categories', 'search'])
})

test('evicted page retains its saved snapshot', () => {
  let state = createPageCacheState('home')
  state = saveSnapshot(state, 'home', { scrollTop: 1200, page: 1 })
  state = touchPage(state, 'search', 3)
  state = touchPage(state, 'categories', 3)
  state = touchPage(state, 'favorites', 3)
  // 'home' 已经被从 mounted 淘汰
  assert.equal(state.mounted.includes('home'), false)
  assert.equal(takeSnapshot(state, 'home')?.scrollTop, 1200)
})

test('takeSnapshot returns defensive deep copy', () => {
  let state = createPageCacheState('home')
  const original: PageSnapshot = { scrollTop: 100, filters: { tags: ['a', 'b'] } }
  state = saveSnapshot(state, 'home', original)

  const retrieved = takeSnapshot(state, 'home')
  assert.notEqual(retrieved, original)
  assert.deepEqual(retrieved, original)

  if (retrieved && retrieved.filters) {
    ;(retrieved.filters as any).tags.push('c')
  }
  const retrievedAgain = takeSnapshot(state, 'home')
  assert.deepEqual(retrievedAgain?.filters, { tags: ['a', 'b'] })
})

test('rejects non-positive integer limit with RangeError', () => {
  const state = createPageCacheState('home')
  assert.throws(() => touchPage(state, 'search', 0), RangeError)
  assert.throws(() => touchPage(state, 'search', -1), RangeError)
})

if (process.exitCode) console.log('Some tests failed.')
else console.log('All pageStateCache tests passed!')
