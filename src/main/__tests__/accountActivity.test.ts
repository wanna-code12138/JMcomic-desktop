import assert from 'node:assert/strict'
import { createAccountActivity, parseDaily, parseTasks } from '../account/accountActivity'
import type { AccountService } from '../account/accountService'
import { AccountError } from '../account/accountErrors'

async function main() {
  const rawDaily = { daily_id: 67, event_name: '本月签到', currentProgress: '10%', record: [[{ date: '01', signed: true, bonus: false }, { date: '02', signed: null }]] }
  assert.equal(parseDaily(rawDaily)?.days[0].signed, true, '日历必须保留服务端签到记录')
  assert.equal(parseDaily(rawDaily).days[1].signed, null, '未知签到状态不能显示未签到')
  assert.throws(() => parseDaily({}), /无法识别/)
  assert.equal(parseTasks({ status: 'ok', list: [{ id: '8', name: '<b>任务</b>', content: '说明', done: true }] })[0].name, '任务')
  assert.throws(() => parseTasks({ status: 'fail', list: [] }), /暂不可用/)
  let generation = 1, writes = 0, mode = 'ok', lastParams: Record<string, string> = {}
  const calls: string[] = []
  const service = { getState: () => ({ generation, phase: 'authenticated', profile: { uid: '77' } }),
    async request(endpoint: string, params: Record<string, string>) {
      calls.push(endpoint); lastParams = params
      if (endpoint === 'myComments') return { list: [{ CID: '1', AID: '123', content: '自己的评论' }], total: '11' }
      if (endpoint === 'daily') return rawDaily
      if (endpoint === 'checkIn') { writes++; return { msg: mode === 'already' ? '已签到过' : '签到成功' } }
      if (endpoint === 'postComment') { writes++; if (mode === 'lost') throw new AccountError('NETWORK'); return { status: mode } }
      return { status: 'ok', list: [] }
    }
  } as unknown as AccountService
  const activity = createAccountActivity(service)
  assert.equal((await activity.myComments(1, 1)).hasNext, true)
  assert.equal(lastParams.uid, '77', '我的评论身份必须来自当前会话')
  const query = { albumId: '123', parentId: '0', text: '正常评论', generation: 1, operationId: 'comment-operation-1' }
  assert.equal((await activity.postComment(query)).status, 'sent')
  assert.deepEqual(lastParams, { aid: '123', comment_id: '0', comment: '正常评论' })
  await activity.postComment(query); assert.equal(writes, 1, '相同发送意图不得重复公开发布')
  await assert.rejects(() => activity.postComment({ ...query, text: '   ', operationId: 'blank-operation' }), /输入内容/)
  mode = 'fail'
  await assert.rejects(() => activity.postComment({ ...query, operationId: 'comment-operation-2' }), (e: any) => e.code === 'UNAVAILABLE')
  mode = 'lost'
  const lost = { ...query, parentId: '1', operationId: 'comment-operation-3' }
  await assert.rejects(() => activity.postComment(lost), (e: any) => e.code === 'OUTCOME_UNKNOWN')
  const afterLost = writes
  await assert.rejects(() => activity.postComment(lost), (e: any) => e.code === 'OUTCOME_UNKNOWN')
  assert.equal(writes, afterLost, '结果未知也不能重发相同评论')
  mode = 'already'
  assert.equal((await activity.checkIn(1, 'daily-operation-1')).status, 'already')
  mode = 'ok'
  assert.equal((await activity.checkIn(1, 'daily-operation-2')).status, 'signed')
  assert.equal(calls.filter(c => c === 'checkIn').length, 2, '读取日历不得自动签到')
  generation = 2
  await assert.rejects(() => activity.postComment({ ...query, operationId: 'stale-operation' }), (e: any) => e.code === 'CANCELLED')
  console.log('PASS account activity: strict daily/tasks, own identity, explicit comment/reply, once-only writes, unknown result, manual check-in')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
