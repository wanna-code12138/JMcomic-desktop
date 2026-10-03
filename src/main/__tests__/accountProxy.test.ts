import assert from 'node:assert/strict'
import { createSessionProxyRegistry, type ProxySession, type SessionProxyConfig } from '../account/sessionProxyRegistry'

async function main() {
  const registry = createSessionProxyRegistry()
  const events: string[] = [], states = new Map<string, SessionProxyConfig>()
  let fail = false
  const target = (name: string): ProxySession => ({
    async setProxy(config) { if (name === 'account' && fail && config.mode === 'fixed_servers') throw Error('proxy unavailable'); states.set(name, config); events.push(`${name}:set`) },
    async closeAllConnections() { events.push(`${name}:close`) }
  })
  const primary = target('anonymous'), account = target('account')
  registry.onPause(paused => events.push(paused ? 'pause' : 'resume'))
  const unregister = await registry.register(account)
  assert.equal(states.get('account')?.mode, 'system', '新账户分区必须应用当前代理')
  events.length = 0
  await registry.apply({ mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:7890' }, primary)
  assert.equal(states.get('account')?.proxyRules, 'http://127.0.0.1:7890')
  assert.equal(events[0], 'pause'); assert.equal(events.at(-1), 'resume')
  assert.ok(events.includes('account:close')); assert.ok(events.includes('anonymous:close'))
  await registry.apply({ mode: 'system' }, primary)
  fail = true
  await assert.rejects(() => registry.apply({ mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:9000' }, primary))
  assert.equal(states.get('anonymous')?.mode, 'system', '部分失败必须恢复匿名分区')
  assert.equal(states.get('account')?.mode, 'system', '部分失败必须恢复账户分区')
  unregister(); fail = false; events.length = 0
  await registry.apply({ mode: 'system' }, primary)
  assert.equal(events.includes('account:set'), false)
  console.log('PASS session proxy registry: inherited config, freeze, connection reset, rollback, unregister')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
