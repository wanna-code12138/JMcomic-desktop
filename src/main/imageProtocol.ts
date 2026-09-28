import { protocol } from 'electron'
import { readCachedImage, storeImage } from './imageLoader'
import { beginMainPerfSpan } from './performanceTrace'
import { requestImage } from './imageNetwork'
import { validateTrustedImageUrl } from '../shared/imageUrlCore'
import { imageMimeType } from '../shared/imageFormat'
import { type ImagePriority } from './imageRequestPolicy'

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
      const match = request.url.match(/^jmimg:\/\/img\/([^?]+)(?:\?(.*))?$/)
      if (!match) {
        console.warn('[jmimg] URL format mismatch:', request.url.slice(0, 100))
        perf.finish('error', { reason: 'bad-url' })
        return new Response('Bad URL format', { status: 400 })
      }

      const encoded = match[1]
      const queryString = match[2] || ''
      const searchParams = new URLSearchParams(queryString)
      const rawPriority = searchParams.get('p')
      const priority: ImagePriority = ['critical', 'near', 'visible-grid', 'background'].includes(rawPriority ?? '') ? rawPriority as ImagePriority : 'near'
      const realUrl = base64UrlDecode(encoded)

      if (!realUrl.startsWith('http')) {
        console.warn('[jmimg] decoded URL invalid:', realUrl.slice(0, 100))
        perf.finish('error', { reason: 'bad-target' })
        return new Response('Invalid decoded URL', { status: 400 })
      }

      const allowed = validateTrustedImageUrl(realUrl)
      if (!allowed) {
        console.warn('[jmimg] blocked non-CDN url:', realUrl.slice(0, 100))
        perf.finish('error', { reason: 'blocked-target' })
        return new Response('Blocked: not a CDN URL', { status: 403 })
      }

      // 磁盘缓存命中：直接返回本地文件
      const cached = await readCachedImage(realUrl)
      if (cached) {
        perf.finish('ok', { cache: true, bytes: cached.buffer.length, priority })
        return new Response(new Uint8Array(cached.buffer), {
          status: 200,
          headers: {
            'Content-Type': imageMimeType(cached.buffer) ?? contentTypeForFile(cached.filepath),
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      const result = await requestImage(realUrl, {
        priority, signal: request.signal, onFirstByte: () => perf.mark('first-byte'),
        cache: (buffer, contentType) => storeImage(realUrl, buffer, contentType)
      })

      if (result.status >= 400 || !result.takeStream) {
        perf.finish('error', { reason: result.errorReason ?? 'image-fetch-failed', status: result.status })
        return new Response('Image fetch failed', {
          status: result.status,
          headers: result.headers
        })
      }

      void result.done.then(() => perf.finish(result.errorReason ? 'error' : 'ok', { cache: false, bytes: result.bytes, priority, reason: result.errorReason ?? 'complete' }))
      return new Response(result.takeStream(), {
        status: result.status,
        headers: result.headers
      })
    } catch (err) {
      console.error('[jmimg] internal error:', err)
      perf.finish('error', { reason: 'internal' })
      return new Response('Internal error', { status: 500 })
    }
  })
}

/**
 * 把 CDN 图片 URL 转换为 jmimg:// 代理 URL，支持视口优先级标注。
 */
export function toProxyUrl(cdnUrl: string, priority?: ImagePriority): string {
  const encoded = base64UrlEncode(cdnUrl)
  return priority ? `jmimg://img/${encoded}?p=${priority}` : `jmimg://img/${encoded}`
}

export { base64UrlEncode, base64UrlDecode }
