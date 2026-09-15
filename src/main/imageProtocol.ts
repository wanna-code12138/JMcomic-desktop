import { protocol, net } from 'electron'
import { getActiveDomain } from './networkProbe'
import { readCachedImage, storeImage } from './imageLoader'
import { beginMainPerfSpan } from './performanceTrace'
import { createImageRequestScheduler } from './imageRequestScheduler'
import { fetchImageStream, type ImageStreamResult } from './imageStreamFetch'
import { validateTrustedImageUrl } from '../shared/imageUrlCore'
import {
  shouldRetryImage,
  IMAGE_REQUEST_LIMITS,
  type ImagePriority
} from './imageRequestPolicy'

// 必须与 httpClient.ts 保持完全一致，否则 Cloudflare 会把请求识别为爬虫并返回 403
const FULL_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const imageRequestScheduler = createImageRequestScheduler({
  maxConcurrent: IMAGE_REQUEST_LIMITS.global,
  maxPerHost: IMAGE_REQUEST_LIMITS.perHost
})

async function fetchOnlineImageStream(realUrl: string, onFirstByte: () => void, signal?: AbortSignal): Promise<ImageStreamResult> {
  for (let attempt = 0; ; attempt++) {
    const result = await fetchImageStream(realUrl, (url, init) => net.fetch(url, {
      ...init, credentials: 'omit',
      headers: {
        Referer: `https://${getActiveDomain()}/`,
        'User-Agent': FULL_USER_AGENT,
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8'
      }
    }), { signal, onFirstByte, firstByteMs: IMAGE_REQUEST_LIMITS.firstByteMs,
      totalMs: IMAGE_REQUEST_LIMITS.totalMs,
      cache: (buffer, contentType) => storeImage(realUrl, buffer, contentType) })
    if (!shouldRetryImage(result.status, attempt) || signal?.aborted) return result
    await new Promise<void>((resolve) => setTimeout(resolve, 250 * 2 ** attempt))
  }
}

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
            'Content-Type': contentTypeForFile(cached.filepath),
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      let host = ''
      try {
        host = new URL(realUrl).host
      } catch {}

      const result = await imageRequestScheduler.run(
        { key: realUrl, host, priority, signal: request.signal },
        (signal) => fetchOnlineImageStream(realUrl, () => perf.mark('first-byte'), signal),
        (value) => value.done
      )

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
