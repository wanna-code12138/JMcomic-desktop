import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCipheriv, createHash } from 'node:crypto'
import { createAnonymousApiProvider } from '../content/jmAppApiRuntime'
import { BUILTIN_JM_API_PROFILES } from '../content/jmAppApiProfiles'

const profile = BUILTIN_JM_API_PROFILES[0]
function envelope(value: unknown, tokenparam: string): string {
  const ts = tokenparam.split(',')[0]
  const key = createHash('md5').update(`${ts}${profile.dataSecret}`).digest('hex')
  const cipher = createCipheriv('aes-256-ecb', key, null)
  return JSON.stringify({ code: 200, data: Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]).toString('base64') })
}

test('anonymous API bootstrap is single-flight and applies verified version/CDN', async () => {
  let settings = 0
  const provider = createAnonymousApiProvider({ async send(req) {
    const path = new URL(req.url).pathname
    let value: unknown
    if (path === '/setting') {
      settings++
      value = { jm3_version: '2.1.7', img_host: 'https://cdn-msp3.jmdanjonproxy.vip' }
    } else {
      assert.match(req.headers.tokenparam, /,2\.1\.7$/)
      value = { total: 1, content: [{ id: '101', name: 'Synthetic', image: '/media/albums/101.jpg' }] }
    }
    return { status: 200, headers: {}, bodyText: envelope(value, req.headers.tokenparam) }
  } })
  const request = { query: 'x', page: 1, mainTag: 0 as const, order: 'mr', time: 'a' }
  const [first, second] = await Promise.all([provider.search(request), provider.search(request)])
  assert.equal(settings, 1)
  assert.equal(first.results[0].coverUrl, 'https://cdn-msp3.jmdanjonproxy.vip/media/albums/101.jpg')
  assert.deepEqual(first, second)
})

test('failed anonymous API discovery cools down instead of delaying every request', async () => {
  let calls = 0
  const provider = createAnonymousApiProvider({ async send() { calls++; return { status: 503, headers: {}, bodyText: '' } } })
  await assert.rejects(provider.prewarm())
  const initialCalls = calls
  await assert.rejects(provider.detail('101'), /unavailable/i)
  assert.equal(calls, initialCalls)
})

test('untrusted discovered image host cannot activate a route', async () => {
  const provider = createAnonymousApiProvider({ async send(req) {
    return { status: 200, headers: {}, bodyText: envelope({ jm3_version: '2.1.7', img_host: 'https://127.0.0.1' }, req.headers.tokenparam) }
  } })
  await assert.rejects(provider.prewarm(), /unavailable/i)
})

test('unsupported homepage/filter requests do not wait for API discovery before fallback', async () => {
  let calls = 0
  const provider = createAnonymousApiProvider({ async send() { calls++; throw new Error('unexpected discovery') } })
  await assert.rejects(provider.homepage('recommended'), /unsupported/)
  await assert.rejects(provider.category({ subCategory: 'chinese' }), /unsupported/)
  assert.equal(calls, 0)
})
