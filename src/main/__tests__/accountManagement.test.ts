import assert from 'node:assert/strict'
import { createAccountManagement } from '../account/accountManagement'
import type { AccountService } from '../account/accountService'
import { AccountError } from '../account/accountErrors'

async function main() {
  let generation = 1, lost = false, unknown = false
  let folders = [{ FID: '1', name: '原收藏夹' }], tags = ['原标签'], history = ['12']
  const members: Record<string, string[]> = { '1': ['12'] }
  let profile = { nickName: '原昵称', aboutMe: '原介绍', website: '', password: 'DO_NOT_EXPOSE', gender: 'unchanged' }
  const writes: { endpoint: string; params: Record<string, string> }[] = []
  const service = { getState: () => ({ generation, phase: 'authenticated', profile: { uid: '77' } }), imageOrigin: () => 'https://cdn-msp.18comic.vip',
    async request(endpoint: string, params: Record<string, string>) {
      if (endpoint === 'favorites') {
        if (unknown) throw new AccountError('NETWORK')
        const albums = params.folder_id === '0' ? Object.values(members).flat() : members[params.folder_id] ?? []
        return { list: albums.map(id => ({ id, name: '合成作品' })), total: String(albums.length), folder_list: folders }
      }
      if (endpoint === 'tags') return { list: tags.map(tag => ({ tag })) }
      if (endpoint === 'history') return { list: history.map(id => ({ id })), total: String(history.length) }
      if (endpoint === 'profile') return { ...profile }
      writes.push({ endpoint, params })
      if (endpoint === 'folder') {
        if (params.type === 'add') { folders.push({ FID: '2', name: params.folder_name }); members['2'] = [] }
        if (params.type === 'edit') folders.find(f => f.FID === params.folder_id)!.name = params.folder_name
        if (params.type === 'move') { for (const key of Object.keys(members)) members[key] = members[key].filter(id => id !== params.aid); members[params.folder_id].push(params.aid) }
        if (params.type === 'del') { folders = folders.filter(f => f.FID !== params.folder_id); delete members[params.folder_id] }
      }
      if (endpoint === 'tagsUpdate') tags = params.type === 'add' ? [...tags, params.tags] : tags.filter(tag => tag !== params.tags)
      if (endpoint === 'historyDelete') history = history.filter(id => id !== params.id)
      if (endpoint === 'profileUpdate') { const { uid: _uid, ...patch } = params; profile = { ...profile, ...patch } }
      if (lost) throw new AccountError('NETWORK')
      return { status: 'ok' }
    }
  } as unknown as AccountService
  const api = createAccountManagement(service), intent = { generation: 1, operationId: 'operation-folder-1' }
  const created = await api.folder({ ...intent, action: 'add', name: '新收藏夹' })
  assert.equal(created.find(f => f.name === '新收藏夹')?.id, '2', '创建必须回读出真实收藏夹')
  await api.folder({ ...intent, action: 'add', name: '新收藏夹' }); assert.equal(writes.length, 1)
  await assert.rejects(() => api.folder({ ...intent, operationId: 'not-empty-delete', action: 'delete', folderId: '1', confirmed: true }), (e: any) => e.code === 'NOT_EMPTY', '非空夹应给出可理解的拒绝原因')
  await assert.rejects(() => api.folder({ ...intent, operationId: 'default-delete', action: 'delete', folderId: '0', confirmed: true }))
  await assert.rejects(() => api.folder({ ...intent, operationId: 'no-confirm-delete', action: 'delete', folderId: '2', confirmed: false }))
  assert.equal(writes.length, 1, '非空、默认、未确认收藏夹不能删除')
  await api.folder({ ...intent, operationId: 'folder-rename', action: 'rename', folderId: '2', name: '新名称' })
  assert.equal(folders.find(f => f.FID === '2')?.name, '新名称')
  await api.folder({ ...intent, operationId: 'folder-move', action: 'move', folderId: '2', albumId: '12' })
  assert.deepEqual(members['2'], ['12'])
  await api.folder({ ...intent, operationId: 'folder-move-back', action: 'move', folderId: '1', albumId: '12' })
  lost = true
  await api.folder({ ...intent, operationId: 'folder-delete-lost', action: 'delete', folderId: '2', confirmed: true })
  assert.equal(folders.length, 1, '响应丢失但回读确认删除可成功')
  await api.tag({ ...intent, operationId: 'tag-add-once', tag: '新标签', desired: true })
  assert.deepEqual(tags, ['原标签', '新標籤'])
  await api.tag({ ...intent, operationId: 'tag-remove-once', tag: '新标签', desired: false })
  assert.deepEqual(tags, ['原标签'])
  await assert.rejects(() => api.tag({ ...intent, operationId: 'tag-comma', tag: 'A,B', desired: true }))
  await assert.rejects(() => api.removeHistory({ ...intent, operationId: 'history-no-confirm', albumId: '12', confirmed: false }))
  await api.removeHistory({ ...intent, operationId: 'history-delete', albumId: '12', confirmed: true })
  assert.equal(history.length, 0)
  const current = await api.profile(1)
  assert.deepEqual(Object.keys(current).sort(), ['aboutMe', 'nickName', 'website'], '不得把密码或未开放字段送往渲染器')
  const changed = { ...current, aboutMe: '新介绍' }
  assert.deepEqual(await api.editProfile({ ...intent, operationId: 'profile-save', expected: current, value: changed }), changed)
  assert.deepEqual(writes.at(-1), { endpoint: 'profileUpdate', params: { uid: '77', aboutMe: '新介绍' } }, '只发送明确修改的白名单字段')
  await assert.rejects(() => api.editProfile({ ...intent, operationId: 'stale-profile', expected: current, value: changed }), (e: any) => e.code === 'CONFLICT')
  await assert.rejects(() => api.editProfile({ ...intent, operationId: 'password-injection', expected: changed, value: { ...changed, password: 'bad' } as any }))
  const before = writes.length; unknown = true
  await assert.rejects(() => api.folder({ ...intent, operationId: 'unknown-preflight', action: 'add', name: '不能盲写' }))
  assert.equal(writes.length, before)
  generation++
  await assert.rejects(() => api.tags(1), (e: any) => e.code === 'CANCELLED')
  console.log('PASS management: empty-only deletion, desired tags, once-only writes, reconciliation, confirmed history deletion, narrow profile and stale scope')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
