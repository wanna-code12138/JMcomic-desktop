import assert from 'node:assert/strict'
import {
  type ImagePriority,
  priorityRank,
  shouldRetryImage,
  IMAGE_REQUEST_LIMITS
} from '../imageRequestPolicy'

// 1. 优先级顺序测试
const input: ImagePriority[] = ['background', 'critical', 'visible-grid', 'near']
const sorted = input.sort((a, b) => priorityRank(a) - priorityRank(b))
assert.deepEqual(sorted, ['critical', 'near', 'visible-grid', 'background'])

// 2. 限制常量测试
assert.equal(IMAGE_REQUEST_LIMITS.global, 6)
assert.equal(IMAGE_REQUEST_LIMITS.perHost, 4)
assert.equal(IMAGE_REQUEST_LIMITS.firstByteMs, 10_000)
assert.equal(IMAGE_REQUEST_LIMITS.totalMs, 30_000)
assert.equal(IMAGE_REQUEST_LIMITS.retries, 2)

// 3. 重试判定测试
assert.equal(shouldRetryImage(429, 0), true)
assert.equal(shouldRetryImage(503, 1), true)
assert.equal(shouldRetryImage(500, 0), true)
assert.equal(shouldRetryImage(502, 1), true)
assert.equal(shouldRetryImage(504, 1), true)

// 4. 不可重试场景（403 forbidden、404 not found、400 bad request 或达到重试上限）
assert.equal(shouldRetryImage(403, 0), false)
assert.equal(shouldRetryImage(404, 0), false)
assert.equal(shouldRetryImage(401, 0), false)
assert.equal(shouldRetryImage(200, 0), false)
assert.equal(shouldRetryImage(500, 2), false)
assert.equal(shouldRetryImage(429, 2), false)

console.log('All imageStreamingPolicy tests passed!')
