import assert from 'node:assert/strict'
import { createAccountSessionFactory } from '../account/accountSession'
import { BUILTIN_JM_API_PROFILES } from '../content/jmAppApiProfiles'

async function main() {
  const partitions: string[] = [], jar: any[] = [], events: string[] = []
  const factory = createAccountSessionFactory({
    openSession(partition, options) {
      assert.equal(options.cache, false); partitions.push(partition)
      return { cookies: { async get() { return jar }, async set(cookie: any) { jar.push({ ...cookie, domain: 'www.cdnhjk.net' }) } },
        async clearStorageData() { events.push('clear') }, async closeAllConnections() { events.push('close') }, fetch: async () => new Response('') } as any
    }, async discover() { return { apiOrigin: 'https://www.cdnhjk.net', imageOrigin: 'https://cdn-msp.18comic.vip', profile: BUILTIN_JM_API_PROFILES[0] } },
    async register() { events.push('register'); return () => { events.push('unregister') } }
  })
  const session = await factory()
  assert.equal(partitions.length, 1)
  assert.equal(partitions[0].startsWith('persist:'), false)
  await session.installAvs('synthetic-avs')
  jar.push({ name: 'unrelated', value: 'must-not-save', domain: '.evil.test', path: '/' })
  jar.push({ name: 'session-extra', value: 'extra-cookie', domain: '.www.cdnhjk.net', path: '/', httpOnly: true, secure: true })
  const snapshot = await session.snapshot({ uid: '7', username: 'synthetic', nickname: '', level: null, coins: null, experience: null, favorites: null, favoriteLimit: null, checkedAt: 1 })
  assert.deepEqual(snapshot.cookies.map(c => c.name), ['AVS', 'session-extra'], '保存同源完整 Cookie，排除其他域')
  assert.equal(snapshot.cookies[0].secure, true)
  await session.dispose(); await session.dispose()
  assert.equal(events.filter(e => e === 'clear').length, 1, '释放幂等')
  await assert.rejects(() => session.request('favorites'), (e: any) => e.code === 'CANCELLED')
  await factory(snapshot)
  assert.notEqual(partitions[0], partitions[1], '每次恢复都新建内存分区')
  assert.equal(jar.filter(c => c.name === 'session-extra').length, 2, '恢复全部必要 Cookie')
  console.log('PASS account sessions: memory partitions, complete cookies, exact domains, restore, disposal')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
