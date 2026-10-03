import assert from 'node:assert/strict'
import { parseCommentPage } from '../comments/commentParser'

const raw = {
  total: '12',
  list: [{ CID: '101', AID: '123', username: 'synthetic', nickname: '测试读者',
    content: '<p>第一行<br>第二行 &amp; 正文</p><script>bad()</script>', addtime: '2026-10-02', spoiler: '2', likes: '7',
    replys: [{ CID: '102', content: '<b>回复</b>', username: 'reply', spoiler: '1' }] }]
}
const result = parseCommentPage(raw, 1)
assert.equal(result.items.length, 1, '主评论不能被丢弃')
assert.equal(result.items[0].id, '101')
assert.equal(result.items[0].author, '测试读者')
assert.equal(result.items[0].text, '第一行\n第二行 & 正文')
assert.equal(result.items[0].spoiler, true, '线上 2 代表剧透')
assert.equal(result.items[0].replies[0].id, '102', '线上嵌套回复使用 replys')
assert.equal(result.items[0].replies[0].spoiler, false, '线上 1 代表非剧透')
assert.equal(result.items[0].likes, 7)
assert.equal(result.total, 12, 'total 仅计主评论')
assert.equal(result.hasNext, true)
assert.deepEqual(parseCommentPage({ list: [], total: '0' }, 1).items, [])
assert.equal(parseCommentPage({ list: Array.from({ length: 10 }, (_, i) => ({ CID: String(i + 1), content: 'x' })) }, 1).hasNext, true)
assert.equal(parseCommentPage({ ...raw, list: [raw.list[0], raw.list[0], { content: 'bad' }] }, 2).items.length, 1)
for (const invalid of [null, {}, { list: {} }, { code: 401, error: 'login' }]) {
  assert.throws(() => parseCommentPage(invalid, 1), /INVALID_COMMENTS/, '坏数据不能伪装空评论')
}
assert.throws(() => parseCommentPage(raw, 0), /INVALID_PAGE/)
assert.equal(parseCommentPage({ list: Array.from({ length: 101 }, (_, i) => ({ CID: String(i), content: 'x' })) }, 1).truncated, true, '显示上限应明确报告截断')
const deep = { CID: '1', replys: [{ CID: '2', replys: [{ CID: '3', replys: [{ CID: '4' }] }] }] }
assert.equal(parseCommentPage({ list: [deep] }, 1).items[0].replies[0].replies[0].repliesTruncated, true)
console.log('PASS comment parser: replies, spoiler, text safety, totals, duplicate rows, malformed payload')
