import assert from 'assert'
import { selectEvictionCandidates } from '../imageCacheCore'

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

interface CacheFile {
  name: string
  size: number
  mtimeMs: number
}

test('returns nothing when total is under limit', () => {
  const files: CacheFile[] = [
    { name: 'a', size: 100, mtimeMs: 1 },
    { name: 'b', size: 200, mtimeMs: 2 }
  ]
  assert.deepStrictEqual(selectEvictionCandidates(files, 1000), [])
})

test('evicts oldest first until under limit', () => {
  const files: CacheFile[] = [
    { name: 'a', size: 400, mtimeMs: 1 },
    { name: 'b', size: 400, mtimeMs: 2 },
    { name: 'c', size: 400, mtimeMs: 3 }
  ]
  assert.deepStrictEqual(selectEvictionCandidates(files, 1000), ['a'])
})

test('evicts all files when every file exceeds limit', () => {
  const files: CacheFile[] = [
    { name: 'a', size: 2000, mtimeMs: 1 },
    { name: 'b', size: 2000, mtimeMs: 2 }
  ]
  assert.deepStrictEqual(selectEvictionCandidates(files, 1000), ['a', 'b'])
})

test('stops once total drops under limit', () => {
  const files: CacheFile[] = [
    { name: 'a', size: 2000, mtimeMs: 1 },
    { name: 'b', size: 10, mtimeMs: 2 }
  ]
  assert.deepStrictEqual(selectEvictionCandidates(files, 1000), ['a'])
})

test('handles empty list', () => {
  assert.deepStrictEqual(selectEvictionCandidates([], 1000), [])
})

test('ties broken by name for determinism', () => {
  const files: CacheFile[] = [
    { name: 'b', size: 800, mtimeMs: 5 },
    { name: 'a', size: 800, mtimeMs: 5 }
  ]
  assert.deepStrictEqual(selectEvictionCandidates(files, 1000), ['a'])
})

console.log('\nAll tests completed.')
if (process.exitCode) {
  console.log('Some tests failed.')
} else {
  console.log('All tests passed!')
}
