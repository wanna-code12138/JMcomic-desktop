import assert from 'node:assert/strict'
import { createAccountService } from '../account/accountService'
import { AccountError } from '../account/accountErrors'
import type { AccountSession, SavedAccountSession } from '../account/accountSessionTypes'

function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((a,b) => { resolve=a; reject=b }); return { promise, resolve, reject } }
function setup() {
  let saved: SavedAccountSession | null = null, proofFailure = false, optionalFailure = false, proofReads = 0
  const pending = new Map<string, ReturnType<typeof deferred<unknown>>>()
  const sessions: AccountSession[] = [], disposed: string[] = [], phases: string[] = []
  const service = createAccountService({
    publish: state => phases.push(state.phase),
    vault: { async load() { return saved }, async save(v) { saved = v }, async clear() { saved = null }, async flush() {} },
    async createSession(restored) {
      const session: AccountSession = { id: String(sessions.length), origin: 'https://www.cdnhjk.net', imageOrigin: 'https://cdn-msp.18comic.vip', profileId: 'python-current', appVersion: '2.1.9',
        async request(endpoint, params) {
          const wait = pending.get(`${session.id}:${endpoint}`); if (wait) return wait.promise
          if (endpoint === 'login') return { uid: '7', username: params!.username, s: 'synthetic' }
          if (endpoint === 'favorites') { proofReads++; if (proofFailure) throw new AccountError('AUTH_REQUIRED'); return { list: [], total: '0' } }
          if (endpoint === 'notifications' && optionalFailure) throw new AccountError('AUTH_REQUIRED')
          if (endpoint === 'notifications') return []
          return { status: 'ok' }
        }, async installAvs() {}, async snapshot(profile) { return { version: 1, origin: session.origin, imageOrigin: session.imageOrigin, profileId: session.profileId, appVersion: session.appVersion, profile, cookies: [] } },
        async dispose() { disposed.push(session.id) }
      }; sessions.push(session); return session
    }
  })
  return { service, pending, sessions, disposed, phases, setSaved(v: SavedAccountSession | null) { saved=v }, setProofFailure(v: boolean) { proofFailure=v }, setOptionalFailure(v: boolean) { optionalFailure=v }, saved: () => saved, proofReads: () => proofReads }
}
async function main() {
  const t = setup()
  await t.service.login('synthetic', 'test', true)
  assert.equal(t.service.getState().phase, 'authenticated', '登录必须通过证明后提交身份')
  assert.equal(t.service.getState().profile?.username, 'synthetic')
  assert.equal(t.proofReads(), 1)
  assert.ok(t.saved())
  t.setOptionalFailure(true)
  t.phases.length = 0
  await assert.rejects(() => t.service.request('notifications', {}, 1), (e: any) => e.code === 'UNAVAILABLE')
  assert.equal(t.service.getState().phase, 'authenticated', '可选接口 401 不能直接踢掉有效会话')
  assert.equal(t.proofReads(), 2, '真正向服务器重新核实身份')
  assert.equal(t.phases.includes('verification-required'), false, '可选接口核查不得制造页面重载循环')
  t.setProofFailure(true)
  await assert.rejects(() => t.service.verify(1), (e: any) => e.code === 'EXPIRED')
  assert.equal(t.service.getState().phase, 'expired')
  assert.equal(t.service.getState().profile, null)
  assert.equal(t.saved(), null)

  for (let i = 0; i < 100; i++) {
    const r = setup(); await r.service.login('a', 'test', false)
    const old = deferred<unknown>(); r.pending.set('0:notifications', old)
    const result = r.service.request('notifications', {}, 1).catch(e => e)
    await r.service.login('b', 'test', false)
    if (i % 2) old.reject(new AccountError('AUTH_REQUIRED')); else old.resolve([{ id: 'old-private-data' }])
    assert.equal((await result as AccountError).code, 'CANCELLED')
    assert.equal(r.service.getState().profile?.username, 'b')
    assert.equal(r.service.getState().generation, 2)
  }
  const r = setup(); const login = deferred<unknown>(); r.pending.set('0:login', login)
  const candidate = r.service.login('c', 'test', true).catch(e => e)
  await Promise.resolve(); await Promise.resolve()
  await r.service.logout(); login.resolve({ uid: '7', username: 'c', s: 'synthetic' })
  assert.equal((await candidate).code, 'CANCELLED')
  assert.equal(r.service.getState().phase, 'anonymous'); assert.equal(r.saved(), null)
  const n = setup(); await n.service.login('d', 'test', false); n.service.setNetworkPaused(true)
  await assert.rejects(() => n.service.request('favorites', {}, 1), (e: any) => e.code === 'BUSY')
  n.service.setNetworkPaused(false); await n.service.request('favorites', {}, 1)
  const writes = deferred<unknown>(); n.pending.set('0:favorite', writes)
  const request = n.service.request('favorite', { aid: '1' }, 1).catch(e => e)
  await n.service.logout(); writes.resolve({ status: 'ok' })
  assert.equal((await request as AccountError).code, 'CANCELLED')
  const p = setup(); const pausedLogin = deferred<unknown>(); p.pending.set('0:login', pausedLogin)
  const interrupted = p.service.login('e', 'test', false).catch(e => e)
  await Promise.resolve(); await Promise.resolve()
  p.service.setNetworkPaused(true); p.service.setNetworkPaused(false)
  pausedLogin.resolve({ uid: '7', username: 'e', s: 'synthetic' })
  assert.equal((await interrupted).code, 'CANCELLED')
  assert.equal(p.service.getState().phase, 'anonymous', '切代理取消登录后不能永远卡在登录中')
  const remembered = setup(); await remembered.service.login('restore-user', 'test', true)
  const restored = setup(); restored.setSaved(remembered.saved())
  await restored.service.restore(); assert.equal(restored.service.getState().phase, 'authenticated')
  assert.equal(restored.proofReads(), 1, '恢复必须重新进行远端认证证明')
  const expired = setup(); expired.setSaved(remembered.saved()); expired.setProofFailure(true)
  const offlineRestore = setup(); offlineRestore.setSaved(remembered.saved())
  const offlineProof = deferred<unknown>(); offlineRestore.pending.set('0:favorites', offlineProof)
  const offlineResult = offlineRestore.service.restore().catch(error => error)
  await Promise.resolve(); await Promise.resolve(); offlineProof.reject(new AccountError('NETWORK'))
  assert.equal((await offlineResult as AccountError).code, 'NETWORK')
  assert.equal(offlineRestore.service.getState().remembered, true, '短暂断网后仍应提供无需密码的恢复重试入口')
  assert.equal(offlineRestore.service.getState().profile, null, '未经验证不能展示已登录资料')
  offlineRestore.pending.clear(); await offlineRestore.service.restore()
  assert.equal(offlineRestore.service.getState().phase, 'authenticated')
  await assert.rejects(() => expired.service.restore(), (e: any) => e.code === 'EXPIRED')
  assert.equal(expired.service.getState().phase, 'expired')
  assert.equal(expired.saved(), null, '恢复时已证实失效的会话应清除')
  const retry = setup(); await retry.service.login('reader', 'test', false)
  const transport = retry.sessions[0].request.bind(retry.sessions[0]); let optionalAttempts = 0, writeAttempts = 0
  retry.sessions[0].request = async (endpoint, params, signal) => {
    if (endpoint === 'tracking' && ++optionalAttempts === 1) throw new AccountError('AUTH_REQUIRED')
    if (endpoint === 'tracking') return { totalCnt: '0' }
    if (endpoint === 'favorite') { writeAttempts++; throw new AccountError('AUTH_REQUIRED') }
    return transport(endpoint, params, signal)
  }
  assert.deepEqual(await retry.service.request('tracking', { page: '1' }, 1), { totalCnt: '0' }, '重新证明有效后允许只读请求一次恢复尝试')
  assert.equal(optionalAttempts, 2)
  await assert.rejects(() => retry.service.request('favorite', { aid: '123' }, 1), (e: any) => e.code === 'UNAVAILABLE')
  assert.equal(writeAttempts, 1, '恢复重试严格排除写请求')
  assert.equal(typeof retry.service.onInvalidate, 'function', '账户退出必须通知私有结果缓存清除')
  let invalidations = 0
  retry.service.onInvalidate(() => invalidations++)
  await retry.service.logout(); assert.equal(invalidations, 1)
  await retry.service.close(); assert.equal(invalidations, 2)
  console.log('PASS account lifecycle: proof, optional 401, expiry, 100 stale races, login cancellation, logout, proxy pause')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
