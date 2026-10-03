import assert from 'node:assert/strict'
import { createCipheriv, createHash } from 'node:crypto'
import {
  validateApiOrigin,
  type JmApiRoute
} from '../content/jmAppApiDomainResolver'
import {
  createJmAppApiTransport,
  JM_API_ENDPOINTS,
  type JmApiFetchPort,
  type JmApiFetchRequest
} from '../content/jmAppApiTransport'
import {
  BUILTIN_JM_API_PROFILES,
  withRuntimeVersion
} from '../content/jmAppApiProfiles'

function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(
      () => console.log(`  PASS: ${name}`),
      (error) => {
        console.log(`  FAIL: ${name}`)
        console.log(error)
        process.exitCode = 1
      }
    )
}

const profile = BUILTIN_JM_API_PROFILES[0]
let route: JmApiRoute = Object.freeze({
  apiOrigin: 'https://api.18comic.vip',
  imageOrigin: 'https://cdn-msp.18comic.vip',
  profile
})

function envelope(value: unknown, ts: number): string {
  const key = createHash('md5').update(`${ts}${profile.dataSecret}`).digest('hex')
  const cipher = createCipheriv('aes-256-ecb', key, null)
  return JSON.stringify({
    code: 200,
    data: Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final()
    ]).toString('base64')
  })
}

async function main(): Promise<void> {
  // 1. Origin 校验
  await test('rejects unsafe origins (userinfo, http, ports, IP, spoofing)', () => {
    assert.equal(validateApiOrigin('http://api.18comic.vip').ok, false)
    assert.equal(validateApiOrigin('https://user:pass@api.18comic.vip').ok, false)
    assert.equal(validateApiOrigin('https://api.18comic.vip:8443').ok, false)
    assert.equal(validateApiOrigin('https://127.0.0.1').ok, false)
    assert.equal(validateApiOrigin('https://192.168.1.1').ok, false)
    assert.equal(validateApiOrigin('https://api.18comic.vip.evil.com').ok, false)
    assert.equal(validateApiOrigin('https://api.18comic.vip').ok, true)
  })

  // 2. 只读 GET 重试一次并重构时间戳 token
  await test('GET retries once on network error and rebuilds token with new ts', async () => {
    let sends = 0
    const sent: JmApiFetchRequest[] = []
    let second = 100

    const transport = createJmAppApiTransport({
      route,
      endpoints: JM_API_ENDPOINTS,
      clock: { nowSeconds: () => second++ },
      fetchPort: {
        async send(req) {
          sent.push(req)
          sends++
          if (sends === 1) throw new Error('connection reset')
          return { status: 200, headers: {}, bodyText: envelope({ ok: true }, 101) }
        }
      }
    })

    const result = await transport.request('detail', { id: '123' })
    assert.deepEqual(result, { ok: true })
    assert.equal(sends, 2)
    assert.notEqual(sent[0].headers.token, sent[1].headers.token)
  })

  // 3. 3xx Redirect 严格禁止
  await test('rejects 3xx redirects without following', async () => {
    const transport = createJmAppApiTransport({
      route,
      endpoints: JM_API_ENDPOINTS,
      clock: { nowSeconds: () => 100 },
      fetchPort: {
        async send() {
          return { status: 302, headers: { location: 'https://api.18comic.vip/redirect' }, bodyText: '' }
        }
      }
    })

    await assert.rejects(
      () => transport.request('search', { q: 'test' }),
      /UPSTREAM_CHANGED/
    )
  })

  // 4. 超大 Body 防护
  await test('rejects response exceeding maxResponseBytes', async () => {
    const transport = createJmAppApiTransport({
      route,
      endpoints: JM_API_ENDPOINTS,
      clock: { nowSeconds: () => 100 },
      fetchPort: {
        async send() {
          // setting 端点上限为 64KB
          return { status: 200, headers: {}, bodyText: 'x'.repeat(70 * 1024) }
        }
      }
    })

    await assert.rejects(
      () => transport.request('setting'),
      /RESPONSE_TOO_LARGE/
    )
  })

  // 5. 401/403 错误映射
  await test('rejects 401 and 403 HTTP status codes', async () => {
    for (const status of [401, 403]) {
      const transport = createJmAppApiTransport({
        route,
        endpoints: JM_API_ENDPOINTS,
        clock: { nowSeconds: () => 100 },
        fetchPort: {
          async send() {
            return { status, headers: {}, bodyText: 'unauthorized' }
          }
        }
      })

      await assert.rejects(
        () => transport.request('category'),
        /UNAUTHORIZED|FORBIDDEN/
      )
    }
  })

  // 6. 坏 Envelope 与解密异常
  await test('rejects bad envelope or invalid padding', async () => {
    const transport = createJmAppApiTransport({
      route,
      endpoints: JM_API_ENDPOINTS,
      clock: { nowSeconds: () => 100 },
      fetchPort: {
        async send() {
          return { status: 200, headers: {}, bodyText: JSON.stringify({ code: 500, data: 'invalid' }) }
        }
      }
    })

    await assert.rejects(
      () => transport.request('detail', { id: '1' }),
      /BAD_ENVELOPE/
    )
  })

  // 7. AbortSignal 取消
  await test('aborts request when signal is triggered', async () => {
    const controller = new AbortController()
    controller.abort()

    const transport = createJmAppApiTransport({
      route,
      endpoints: JM_API_ENDPOINTS,
      clock: { nowSeconds: () => 100 },
      fetchPort: {
        async send() {
          return { status: 200, headers: {}, bodyText: envelope({ ok: true }, 100) }
        }
      }
    })

    await assert.rejects(
      () => transport.request('pages', { id: '1' }, controller.signal),
      /aborted|cancelled/i
    )
  })

  // 8. Runtime version 更新
  await test('updates runtime version in transport route', () => {
    const updated = withRuntimeVersion(route.profile, '2.0.35')
    route = { ...route, profile: updated }
    assert.equal(route.profile.bootstrapVersion, '2.0.35')
  })
}

main().then(() => {
  if (process.exitCode) console.log('Some tests failed.')
  else console.log('All jmAppApiTransport tests passed!')
})
