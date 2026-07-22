import assert from 'assert'
import { diffCards, shouldStopPolling } from '../homepageStream'

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

// ─── diffCards ──────────────────────────────────────────────────────

test('diffCards: empty knownIds returns all', () => {
  const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const result = diffCards(new Set(), cards)
  assert.strictEqual(result.length, 3)
  assert.strictEqual(result[0].id, 'a')
  assert.strictEqual(result[1].id, 'b')
  assert.strictEqual(result[2].id, 'c')
})

test('diffCards: filters known ids', () => {
  const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const result = diffCards(new Set(['a', 'c']), cards)
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].id, 'b')
})

test('diffCards: preserves current order', () => {
  const cards = [{ id: 'z' }, { id: 'a' }, { id: 'm' }]
  const result = diffCards(new Set(['a']), cards)
  assert.strictEqual(result.length, 2)
  assert.strictEqual(result[0].id, 'z')
  assert.strictEqual(result[1].id, 'm')
})

test('diffCards: all known returns empty', () => {
  const cards = [{ id: 'a' }, { id: 'b' }]
  const result = diffCards(new Set(['a', 'b', 'c']), cards)
  assert.strictEqual(result.length, 0)
})

test('diffCards: empty current returns empty', () => {
  const result = diffCards(new Set(['a']), [])
  assert.strictEqual(result.length, 0)
})

test('diffCards: duplicate id in current still filtered by knownIds', () => {
  const cards = [{ id: 'a' }, { id: 'b' }, { id: 'a' }]
  const result = diffCards(new Set(['a']), cards)
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].id, 'b')
})

// ─── shouldStopPolling ──────────────────────────────────────────────

test('shouldStopPolling: [5,5,5] stableCount=3 → true', () => {
  assert.strictEqual(shouldStopPolling([5, 5, 5], 3), true)
})

test('shouldStopPolling: [5,5,5] stableCount=2 → true', () => {
  assert.strictEqual(shouldStopPolling([5, 5, 5], 2), true)
})

test('shouldStopPolling: [5,5,6] stableCount=3 → false', () => {
  assert.strictEqual(shouldStopPolling([5, 5, 6], 3), false)
})

test('shouldStopPolling: [5,5] stableCount=3 → false (insufficient length)', () => {
  assert.strictEqual(shouldStopPolling([5, 5], 3), false)
})

test('shouldStopPolling: [0,0,0] stableCount=3 → false (count is 0)', () => {
  assert.strictEqual(shouldStopPolling([0, 0, 0], 3), false)
})

test('shouldStopPolling: [5,5,5,5] stableCount=3 → true (only last 3 matter)', () => {
  assert.strictEqual(shouldStopPolling([5, 5, 5, 5], 3), true)
})

test('shouldStopPolling: empty array → false', () => {
  assert.strictEqual(shouldStopPolling([], 3), false)
})

test('shouldStopPolling: [3,4,5] stableCount=2 → false (last 2 differ)', () => {
  assert.strictEqual(shouldStopPolling([3, 4, 5], 2), false)
})

test('shouldStopPolling: [3,5,5] stableCount=2 → true', () => {
  assert.strictEqual(shouldStopPolling([3, 5, 5], 2), true)
})

console.log('\nAll tests completed.')
if (process.exitCode) {
  console.log('Some tests failed.')
} else {
  console.log('All tests passed!')
}
