import { protocol, net, session } from 'electron'
import { getActiveDomain } from './networkProbe'
import { getCachedImagePath, storeImage } from './imageLoader'
import { readFileSync } from 'fs'
import { beginMainPerfSpan } from './performanceTrace'

// 必须与 httpClient.ts 保持完全一致，否则 Cloudflare 会因 UA 不完整
// 把请求识别为爬虫并返回 403 / challenge 页面，<img> 就显示破损图标。
const FULL_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * 自定义 jmimg:// 协议：主进程代理 CDN 图片请求
 *
 * URL 格式: jmimg://img/<base64url-encoded-cdn-url>
 *
 * 为什么 base64 放在 path 而不是 host？
 *   因为 jmimg 注册为 standard scheme 后，Chromium 会对 host 做规范化
 *   （强制转小写），而 base64 是大小写敏感的 — host 转小写后 base64
 *   解码出乱码 URL，所有图片请求都会失败。
 *   path 不会做大小写规范化，所以 base64 放在 path 里是安全的。
 *
 * 渲染进程使用 <img src="jmimg://img/<base64url>">，
 * 主进程转发到 CDN，自动附加：
 *   - Referer: https://18comic.vip/
 *   - 会话 Cookie（Cloudflare 绕过所需）
 *   - 完整 User-Agent
 *
 * 编码采用 base64url（-/_ 替代 +/，去掉 = 填充），
 * 因为标准 base64 的 = 会被 Chromium 百分号编码为 %3D。
 */

// ─── base64url 编解码工具 ───────────────────────────────────────
function base64UrlEncode(s: string): string {
  return Buffer.from(s, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlDecode(s: string): string {
  let std = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = std.length % 4
  if (pad) std += '='.repeat(4 - pad)
  return Buffer.from(std, 'base64').toString('utf-8')
}

export function contentTypeForFile(filepath: string): string {
  const ext = filepath.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i)?.[1]?.toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    default:
      return 'application/octet-stream'
  }
}

/**
 * 必须在 app.ready 之前调用：把 jmimg 注册为 standard + privileged scheme。
 *
 * 不注册为 standard 的话，Chromium 把 jmimg 当作非标准协议，
 * URL 解析行为不确定。注册后 CSP img-src 可以正确匹配 jmimg:。
 *
 * secure: true 让该协议获得与 https 同源的安全待遇。
 * supportFetchAPI: true 让 protocol.handle 生效。
 * corsEnabled: true 允许跨域访问。
 */
export function registerImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'jmimg',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        bypassCSP: false,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

export function registerImageProtocol(): void {
  protocol.handle('jmimg', async (request) => {
    const perf = beginMainPerfSpan('image.online')
    try {
      // URL 格式: jmimg://img/<base64url>
      // 用正则从 path 提取 base64url，避免 host 规范化问题
      const match = request.url.match(/^jmimg:\/\/img\/(.+)$/)
      if (!match) {
        console.warn('[jmimg] URL format mismatch:', request.url.slice(0, 100))
        perf.finish('error', { reason: 'bad-url' })
        return new Response('Bad URL format', { status: 400 })
      }

      const encoded = match[1]
      const realUrl = base64UrlDecode(encoded)

      if (!realUrl.startsWith('http')) {
        console.warn('[jmimg] decoded URL invalid:', realUrl.slice(0, 100))
        perf.finish('error', { reason: 'bad-target' })
        return new Response('Invalid decoded URL', { status: 400 })
      }

      // 安全：只允许代理到 18comic 相关域名
      // 章节图片可能用 cdn-msp / cdn-msp2 / cdn-msp3 等多种 CDN 域名
      const allowed = /^https:\/\/(cdn-.*18comic|.*\.18comic\.)/i.test(realUrl)
      if (!allowed) {
        console.warn('[jmimg] blocked non-CDN url:', realUrl.slice(0, 100))
        perf.finish('error', { reason: 'blocked-target' })
        return new Response('Blocked: not a CDN URL', { status: 403 })
      }

      // 磁盘缓存命中：直接返回本地文件，避免重复网络加载
      const cachedPath = getCachedImagePath(realUrl)
      if (cachedPath) {
        try {
          const buf = readFileSync(cachedPath)
          perf.finish('ok', { cache: true, bytes: buf.length })
          return new Response(buf, {
            status: 200,
            headers: {
            'Content-Type': contentTypeForFile(cachedPath),
              'Cache-Control': 'public, max-age=86400',
              'Access-Control-Allow-Origin': '*'
            }
          })
        } catch (err) {
          console.warn('[jmimg] cache read failed, refetching:', err)
        }
      }

      // 从会话取 Cookie（Cloudflare cf_clearance 等）
      const cookies = await session.defaultSession.cookies.get({ url: realUrl })
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

      console.log('[jmimg] requesting:', realUrl.slice(0, 80), 'cookies:', cookieHeader.length > 0 ? 'yes' : 'no')

      return await new Promise<Response>((resolve) => {
        const req = net.request({ method: 'GET', url: realUrl })
        let receivedFirstByte = false

        req.setHeader('Referer', `https://${getActiveDomain()}/`)
        req.setHeader('User-Agent', FULL_USER_AGENT)
        req.setHeader('Accept', 'image/avif,image/webp,image/*,*/*;q=0.8')
        req.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8')
        if (cookieHeader) req.setHeader('Cookie', cookieHeader)

        const chunks: Buffer[] = []

        req.on('response', (response) => {
          if (response.statusCode >= 400) {
            console.warn(`[jmimg] HTTP ${response.statusCode} for ${realUrl.slice(0, 80)}`)
            response.on('data', () => {})
            response.on('end', () => {
              perf.finish('error', { status: response.statusCode })
              resolve(new Response('Image fetch failed', { status: response.statusCode }))
            })
            return
          }

          response.on('data', (chunk: Buffer) => {
            if (!receivedFirstByte) {
              receivedFirstByte = true
              perf.mark('first-byte')
            }
            chunks.push(chunk)
          })
          response.on('end', () => {
            const buf = Buffer.concat(chunks)
            // Electron 的 response.headers 可能返回 string 或 string[]，
            // 用 [0] 取 string[] 第一个元素，但如果值是 string 就会取到第一个字符！
            // 所以需要先判断类型。
            const rawCt = response.headers['content-type']
            const ct = Array.isArray(rawCt) ? rawCt[0] ?? '' : (rawCt ?? '')
            if (ct.includes('text/html')) {
              console.warn('[jmimg] got HTML instead of image (Cloudflare?)')
              perf.finish('error', { reason: 'html-response' })
              resolve(new Response('Blocked by Cloudflare', { status: 502 }))
              return
            }
            console.log('[jmimg] OK:', realUrl.slice(0, 60), 'size:', buf.length, 'type:', ct)
            if (ct.includes('image/')) {
              try {
                storeImage(realUrl, buf, ct)
              } catch (err) {
                console.warn('[jmimg] cache write failed:', err)
              }
            }
            const headers: Record<string, string> = {
              'Content-Type': ct || 'image/jpeg',
              'Cache-Control': 'public, max-age=86400',
              'Access-Control-Allow-Origin': '*'
            }
            perf.finish('ok', { cache: false, bytes: buf.length })
            resolve(new Response(buf, { status: 200, headers }))
          })
          response.on('error', () => {
            perf.finish('error', { reason: 'response-stream' })
            resolve(new Response('Image stream error', { status: 500 }))
          })
        })

        req.on('error', (err) => {
          console.warn('[jmimg] request error:', err.message)
          perf.finish('error', { reason: 'request' })
          resolve(new Response('Image request failed', { status: 502 }))
        })

        req.end()
      })
    } catch (err) {
      console.error('[jmimg] internal error:', err)
      perf.finish('error', { reason: 'internal' })
      return new Response('Internal error', { status: 500 })
    }
  })
}

/**
 * 把 CDN 图片 URL 转换为 jmimg:// 代理 URL。
 */
export function toProxyUrl(cdnUrl: string): string {
  return `jmimg://img/${base64UrlEncode(cdnUrl)}`
}

export { base64UrlEncode, base64UrlDecode }
