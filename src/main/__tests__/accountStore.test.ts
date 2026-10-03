import assert from 'node:assert/strict'
import { useAccountStore, installAccountState } from '../../renderer/src/stores/accountStore'
import type { AccountState } from '../../shared/accountContracts'

async function main() {
  const profile = { uid: '7', username: 'synthetic', nickname: 'test', level: null, coins: null, experience: null, favorites: null, favoriteLimit: null, checkedAt: 1 }
  const logged: AccountState = { phase: 'authenticated', generation: 3, profile, remembered: false }
  useAccountStore.getState().accept(logged)
  assert.equal(useAccountStore.getState().state.profile?.uid, '7', '主进程身份更新必须进入渲染状态')
  useAccountStore.getState().accept({ ...logged, generation: 2, profile: { ...profile, uid: '8' } })
  assert.equal(useAccountStore.getState().state.profile?.uid, '7', '旧代数据不能覆盖新账户')
  let listener!: (state: AccountState) => void, resolve!: (value: any) => void, detached = false
  ;(globalThis as any).window = { electronAPI: {
    onAccountChanged(fn: typeof listener) { listener = fn; return () => { detached = true } },
    accountState: () => new Promise(r => { resolve = r })
  } }
  const stop = installAccountState()
  listener({ phase: 'anonymous', generation: 4, profile: null, remembered: false })
  resolve({ ok: true, data: logged }); await Promise.resolve(); await Promise.resolve()
  assert.equal(useAccountStore.getState().state.profile, null, '初始快照迟到不能恢复退出的身份')
  stop(); assert.equal(detached, true)
  console.log('PASS renderer account state: trusted updates, stale generation, logout isolation, listener cleanup')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
