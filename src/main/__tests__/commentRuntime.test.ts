import assert from 'node:assert/strict'
import { createCipheriv, createHash } from 'node:crypto'
import { createAnonymousApiProvider } from '../content/jmAppApiRuntime'
import { BUILTIN_JM_API_PROFILES } from '../content/jmAppApiProfiles'

async function main() {
  const paths: string[] = []
  const provider = createAnonymousApiProvider({ async send(request) {
    const url = new URL(request.url)
    paths.push(url.pathname)
    const payload = url.pathname === '/setting' ? { img_host: 'cdn-msp.18comic.vip', jm3_version: '2.1.9' }
      : { list: [{ CID: '1', content: '公开评论' }], total: '1' }
    const ts = request.headers.tokenparam.split(',')[0]
    const key = createHash('md5').update(ts + BUILTIN_JM_API_PROFILES[0].dataSecret).digest('hex')
    const cipher = createCipheriv('aes-256-ecb', key, null)
    return { status: 200, headers: {}, bodyText: JSON.stringify({ code: 200,
      data: Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]).toString('base64') }) }
  } })
  assert.equal(paths.length, 0, '没有打开面板时不得提前请求')
  assert.equal(typeof (provider as any).comments, 'function', '公开 provider 应提供独立评论请求')
  const page = await (provider as any).comments('123', 1)
  assert.equal(page.total, '1')
  assert.deepEqual(paths, ['/setting', '/forum'])
  await (provider as any).comments('124', 2)
  assert.deepEqual(paths, ['/setting', '/forum', '/forum'], '复用匿名路由发现')
  const controller = new AbortController(); controller.abort()
  await assert.rejects(() => (provider as any).comments('123', 1, controller.signal))
  assert.equal(paths.length, 3)
  console.log('PASS comment runtime: lazy request, shared discovery, cancellation')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
