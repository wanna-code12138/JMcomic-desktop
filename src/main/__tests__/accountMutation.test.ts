import assert from 'node:assert/strict'
import { createAccountLibrary } from '../account/accountLibrary'
import { AccountError } from '../account/accountErrors'
import type { AccountService } from '../account/accountService'

async function main() {
  let favorite = false, tracking = false, writes = 0, failAfterWrite = false, failRead = false
  const service = {
    getState: () => ({ generation: 1, phase: 'authenticated' }), imageOrigin: () => 'https://cdn-msp.18comic.vip',
    async request(endpoint: string, params: Record<string, string>) {
      if (endpoint === 'album') { if (failRead) throw new AccountError('NETWORK'); return { id: '123', is_favorite: favorite ? '1' : '0' } }
      if (endpoint === 'trackingState') return false // 真实接口可能与列表不一致
      if (endpoint === 'tracking') return tracking ? { item: [{ id: '123', name: '连载' }], totalCnt: '1' } : { totalCnt: '0' }
      if (endpoint === 'favorite' || endpoint === 'trackingToggle') {
        writes++
        if (endpoint === 'favorite') favorite = !favorite; else tracking = !tracking
        if (failAfterWrite) throw new AccountError('NETWORK')
        return { status: 'ok' }
      }
      return { list: [], total: '0' }
    }
  } as unknown as AccountService
  const library = createAccountLibrary(service)
  const input = { id: '123', kind: 'favorite' as const, desired: true, generation: 1, operationId: 'fixture-operation-1' }
  assert.equal((await library.mutate(input)).favorite, true, '写后应核实远端实际状态')
  assert.equal(favorite, true); assert.equal(writes, 1)
  await library.mutate(input); assert.equal(writes, 1, '重复 operationId 不得再次 Toggle')
  await library.mutate({ ...input, operationId: 'fixture-operation-2' }); assert.equal(writes, 1, '已有期望状态无需发写入')
  failAfterWrite = true
  assert.equal((await library.mutate({ ...input, desired: false, operationId: 'fixture-operation-3' })).favorite, false, '响应丢失但读取已确认时可确定完成')
  assert.equal(writes, 2)
  failRead = true
  await assert.rejects(() => library.mutate({ ...input, operationId: 'fixture-operation-4' }), (e: any) => e.code === 'NETWORK')
  assert.equal(writes, 2, '发送前无法读取状态不得盲目切换')
  failRead = false; failAfterWrite = false
  await Promise.all([library.mutate({ ...input, operationId: 'fixture-operation-5' }), library.mutate({ ...input, operationId: 'fixture-operation-6' })])
  assert.equal(writes, 3, '同作品并发意图串行合并为一次必要写入')
  assert.equal((await library.mutate({ ...input, kind: 'tracking', operationId: 'fixture-operation-7' })).tracking, true)
  assert.equal((await library.album('123', 1)).tracking, true, '追更状态必须与真实列表一致')
  assert.equal((await library.mutate({ ...input, kind: 'tracking', desired: false, operationId: 'fixture-operation-9' })).tracking, false)
  await assert.rejects(() => library.mutate({ ...input, generation: 0, operationId: 'fixture-operation-8' }), (e: any) => e.code === 'CANCELLED')
  console.log('PASS account mutations: desired state, operation deduplication, serial toggle, outcome reconciliation, preflight failure, stale scope')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
