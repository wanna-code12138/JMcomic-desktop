import assert from 'node:assert/strict'
import { createCommentDrafts } from '../../renderer/src/stores/commentDraftStore'

const drafts = createCommentDrafts()
drafts.write('1:123:0', '作品草稿')
drafts.write('1:123:9', '回复草稿')
assert.equal(drafts.read('1:123:0').text, '作品草稿', '作品和回复目标之间应保留独立草稿')
assert.equal(drafts.read('1:123:9').text, '回复草稿')
drafts.markUncertain('1:123:0')
drafts.write('1:123:0', '修改后的草稿')
assert.equal(drafts.read('1:123:0').uncertain, true, '编辑文本不能自动解锁未知结果的再次发送')
drafts.acknowledge('1:123:0'); assert.equal(drafts.read('1:123:0').uncertain, false)
drafts.clear(); assert.equal(drafts.read('1:123:0').text, '', '退出清除草稿')
for (let i = 0; i < 30; i++) drafts.write(String(i), '内容')
assert.equal(drafts.read('0').text, '', '内存草稿容量应有界')
console.log('PASS comment drafts: target isolation, uncertain-send lock, explicit acknowledgement, privacy clearing, bounds')
