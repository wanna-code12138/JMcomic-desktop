import assert from 'node:assert/strict'
import { createCipheriv, createHash } from 'node:crypto'
import { createAccountTransport } from '../account/accountTransport'
import { BUILTIN_JM_API_PROFILES } from '../content/jmAppApiProfiles'

const profile = BUILTIN_JM_API_PROFILES[0]
function encrypted(data: unknown) {
  const key = createHash('md5').update(`100${profile.dataSecret}`).digest('hex')
  const cipher = createCipheriv('aes-256-ecb', key, null)
  return JSON.stringify({ code: 200, data: Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]).toString('base64') })
}
async function main() {
  let requests: { url: string; init: RequestInit }[] = []
  let response = () => new Response(encrypted({ status: 'ok' }))
  let fail = false
  const make = (origin = 'https://www.cdnhjk.net', timeoutMs = 100) => createAccountTransport({ origin, profile, now: () => 100, timeoutMs,
    fetch: async (url, init) => { requests.push({ url, init }); if (fail) throw Error('sensitive raw network detail'); return response() } })
  const client = make()
  assert.deepEqual(await client.request('login', { username: 'synthetic', password: 'test-only' }), { status: 'ok' }, '必须解密真实协议封装')
  assert.equal(requests[0].url, 'https://www.cdnhjk.net/login')
  assert.equal(requests[0].init.redirect, 'manual')
  assert.equal(requests[0].init.credentials, 'include')
  assert.equal(requests[0].init.body, 'username=synthetic&password=test-only')
  assert.equal(new URL(requests[0].url).search, '', '密码不能放 URL')
  for (const origin of ['http://www.cdnhjk.net', 'https://www.cdnhjk.net.evil.com', 'https://api.18comic.vip', 'https://www.cdnhjk.net/path']) {
    assert.throws(() => make(origin), /无法执行/)
  }
  for (const [status, code] of [[302, 'PROTOCOL'], [401, 'AUTH_REQUIRED'], [403, 'CHALLENGE'], [429, 'RATE_LIMITED']] as const) {
    response = () => new Response('', { status })
    await assert.rejects(() => client.request('favorites'), (e: any) => e.code === code)
  }
  fail = true; requests = []
  await assert.rejects(() => client.request('favorite', { aid: '1' }), (e: any) => e.code === 'NETWORK' && !e.message.includes('sensitive'))
  assert.equal(requests.length, 1, '写请求断网后绝不重发')
  fail = false; response = () => new Response(JSON.stringify({ code: 401, errorMsg: 'secret' }))
  await assert.rejects(() => client.request('favorites'), (e: any) => e.code === 'AUTH_REQUIRED')
  response = () => new Response('x'.repeat(2 * 1024 * 1024))
  await assert.rejects(() => client.request('favorites'), (e: any) => e.code === 'PROTOCOL')
  const abort = new AbortController(); abort.abort(); requests = []
  await assert.rejects(() => client.request('favorite', { aid: '1' }, abort.signal), (e: any) => e.code === 'CANCELLED')
  assert.equal(requests.length, 0)
  console.log('PASS account transport: encrypted payload, exact origins, credentials, errors, redirects, body limit, no write retry')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
