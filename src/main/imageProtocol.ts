import { protocol, net, session } from 'electron'
import { getActiveDomain } from './networkProbe'
import { readCachedImage, storeImage } from './imageLoader'
import { beginMainPerfSpan } from './performanceTrace'
import { createImageRequestScheduler } from './imageRequestScheduler'
import {
  shouldRetryImage,
  IMAGE_REQUEST_LIMITS,
  type ImagePriority
} from './imageRequestPolicy'

// 必须与 httpClient.ts 保持完全一致，否则 Cloudflare 会把请求识别为爬虫并返回 403
const FULL_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

interface OnlineStreamResult {
  stream?: ReadableStream<Uint8Array>
  body?: Buffer | string
  status: number
  headers?: Record<string, string>
  bytes?: number
  errorReason?: string
}

// 保持历史契约兼容: createImageRequestScheduler(6)
const imageRequestScheduler = createImageRequestScheduler({
  maxConcurrent: IMAGE_REQUEST_LIMITS.global,
  maxPerHost: IMAGE_REQUEST_LIMITS.perHost
})

function executeSingleFetch(
  realUrl: string,
  cookieHeader: string,
  onFirstByte: () => void,
  parentSignal?: AbortSignal
): Promise<OnlineStreamResult> {
  return new Promise((resolve) => {
    let receivedFirstByte = false
    let isSettled = false

    const req = net.request({ method: 'GET', url: realUrl })

    req.setHeader('Referer', `https://${getActiveDomain()}/`)
    req.setHeader('User-Agent', FULL_USER_AGENT)
    req.setHeader('Accept', 'image/avif,image/webp,image/*,*/*;q=0.8')
    req.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8')
    if (cookieHeader) req.setHeader('Cookie', cookieHeader)

    const firstByteTimer = setTimeout(() => {
      if (!receivedFirstByte && !isSettled) {
        isSettled = true
        req.abort()
        resolve({
          status: 504,
          errorReason: 'firstByte-timeout',
          body: 'First byte timeout'
        })
      }
    }, IMAGE_REQUEST_LIMITS.firstByteMs)

    const totalTimer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true
        req.abort()
        resolve({
          status: 504,
          errorReason: 'total-timeout',
          body: 'Total request timeout'
        })
      }
    }, IMAGE_REQUEST_LIMITS.totalMs)

    if (parentSignal) {
      if (parentSignal.aborted) {
        clearTimeout(firstByteTimer)
        clearTimeout(totalTimer)
        req.abort()
        resolve({ status: 499, errorReason: 'aborted' })
        return
      }
      parentSignal.addEventListener(
        'abort',
        () => {
          clearTimeout(firstByteTimer)
          clearTimeout(totalTimer)
          req.abort()
        },
        { once: true }
      )
    }

    req.on('response', (response) => {
      if (isSettled) return

      if (response.statusCode >= 400) {
        clearTimeout(firstByteTimer)
        clearTimeout(totalTimer)
        isSettled = true
        response.on('data', () => {})
        response.on('end', () => {
          resolve({
            body: 'Image fetch failed',
            status: response.statusCode,
            errorReason: 'http-status'
          })
        })
        return
      }

      const rawCt = response.headers['content-type']
      const ct = Array.isArray(rawCt) ? rawCt[0] ?? '' : (rawCt ?? '')
      if (ct.includes('text/html')) {
        clearTimeout(firstByteTimer)
        clearTimeout(totalTimer)
        isSettled = true
        resolve({
          body: 'Blocked by Cloudflare',
          status: 502,
          errorReason: 'html-response'
        })
        return
      }

      const chunks: Buffer[] = []
      let streamController: ReadableStreamDefaultController<Uint8Array> | null = null

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller
        },
        cancel() {
          req.abort()
        }
      })

      response.on('data', (chunk: Buffer) => {
        if (!receivedFirstByte) {
          receivedFirstByte = true
          clearTimeout(firstByteTimer)
          onFirstByte()
        }
        chunks.push(chunk)
        try {
          streamController?.enqueue(new Uint8Array(chunk))
        } catch {}
      })

      response.on('end', async () => {
        clearTimeout(totalTimer)
        try {
          streamController?.close()
        } catch {}

        const buf = Buffer.concat(chunks)
        if (ct.includes('image/')) {
          try {
            await storeImage(realUrl, buf, ct)
          } catch (err) {
            console.warn('[jmimg] cache write failed:', err)
          }
        }
      })

      response.on('error', (err) => {
        clearTimeout(firstByteTimer)
        clearTimeout(totalTimer)
        try {
          streamController?.error(err)
        } catch {}
      })

      isSettled = true
      resolve({
        stream,
        status: 200,
        headers: {
          'Content-Type': ct || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*'
        }
      })
    })

    req.on('error', (err) => {
      clearTimeout(firstByteTimer)
      clearTimeout(totalTimer)
      if (!isSettled) {
        isSettled = true
        resolve({
          body: 'Image request failed',
          status: 502,
          errorReason: err?.message || 'request'
        })
      }
    })

    req.end()
  })
}

async function fetchOnlineImageStream(
  realUrl: string,
  onFirstByte: () => void,
  parentSignal?: AbortSignal
): Promise<OnlineStreamResult> {
  const cookies = await session.defaultSession.cookies.get({ url: realUrl })
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

  for (let attempt = 0; attempt <= IMAGE_REQUEST_LIMITS.retries; attempt++) {
    if (parentSignal?.aborted) {
      return { status: 499, errorReason: 'aborted' }
    }

    const result = await executeSingleFetch(realUrl, cookieHeader, onFirstByte, parentSignal)
    if (result.status >= 400 && shouldRetryImage(result.status, attempt)) {
      const backoffMs = 250 * Math.pow(2, attempt)
      await new Promise<void>((r) => setTimeout(r, backoffMs))
      continue
    }

    return result
  }

  return { status: 504, errorReason: 'retries-exhausted' }
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
      const priority = (searchParams.get('p') as ImagePriority) || 'near'
      const realUrl = base64UrlDecode(encoded)

      if (!realUrl.startsWith('http')) {
        console.warn('[jmimg] decoded URL invalid:', realUrl.slice(0, 100))
        perf.finish('error', { reason: 'bad-target' })
        return new Response('Invalid decoded URL', { status: 400 })
      }

      const allowed = /^https:\/\/(cdn-.*18comic|.*\.18comic\.)/i.test(realUrl)
      if (!allowed) {
        console.warn('[jmimg] blocked non-CDN url:', realUrl.slice(0, 100))
        perf.finish('error', { reason: 'blocked-target' })
        return new Response('Blocked: not a CDN URL', { status: 403 })
      }

      // 磁盘缓存命中：直接返回本地文件
      const cached = await readCachedImage(realUrl)
      if (cached) {
        perf.finish('ok', { cache: true, bytes: cached.buffer.length, priority })
        return new Response(cached.buffer, {
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
        { key: realUrl, host, priority },
        (signal) => fetchOnlineImageStream(realUrl, () => perf.mark('first-byte'), signal)
      )

      if (result.status >= 400 || !result.stream) {
        perf.finish('error', { reason: result.errorReason, status: result.status })
        return new Response(result.body || 'Image fetch failed', {
          status: result.status,
          headers: result.headers
        })
      }

      perf.finish('ok', { cache: false, bytes: result.bytes ?? 0, priority })
      return new Response(result.stream, {
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
