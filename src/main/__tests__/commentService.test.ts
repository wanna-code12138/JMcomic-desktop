import assert from 'node:assert/strict'
import { createCommentService } from '../comments/commentService'

async function main() {
  let calls = 0, now = 0, offline = false
  const service = createCommentService(async (id, page) => {
    calls++
    if (offline) throw new Error('offline')
    return { list: [{ CID: id, content: `页 ${page}` }], total: '1' }
  }, { now: () => now, maxPages: 2, maxBytes: 10000 })
  assert.equal((await service.get('1', 1)).items[0].id, '1')
  await service.get('1', 1)
  assert.equal(calls, 1, '一分钟内重复打开应复用缓存')
  await service.get('1', 1, true); assert.equal(calls, 2)
  now = 61_000; offline = true
  assert.equal((await service.get('1', 1)).stale, true, '短暂断网保留最近评论并标记过期')
  now = 301_000
  await assert.rejects(() => service.get('1', 1), /offline/)
  offline = false
  await service.get('1', 1); await service.get('2', 1); await service.get('3', 1)
  const before = calls; await service.get('1', 1); assert.equal(calls, before + 1, '缓存页数必须有界')
  const abort = new AbortController(); abort.abort()
  await assert.rejects(() => service.get('1', 1, false, abort.signal))
  await assert.rejects(() => service.get('javascript:bad', 1), /INVALID/)
  const repeating = createCommentService(async () => ({ list: [{ CID: '777', content: 'same' }], total: '20' }))
  await repeating.get('123', 1)
  await assert.rejects(() => repeating.get('123', 2), /DUPLICATE_COMMENTS_PAGE/, '重复页不能当作下一页显示')
  console.log('PASS comment service: TTL, stale fallback, refresh, cache bounds, cancellation, validation')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
