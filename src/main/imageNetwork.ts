import { net } from 'electron'
import { getActiveDomain } from './networkProbe'
import { createImageRequestScheduler } from './imageRequestScheduler'
import { fetchImageStream, type ImageStreamResult } from './imageStreamFetch'
import { IMAGE_REQUEST_LIMITS, shouldRetryImage, type ImagePriority } from './imageRequestPolicy'
import { validateTrustedImageUrl } from '../shared/imageUrlCore'

const scheduler = createImageRequestScheduler({
  maxConcurrent: IMAGE_REQUEST_LIMITS.global,
  maxPerHost: IMAGE_REQUEST_LIMITS.perHost,
  maxBackground: 2
})

export function requestImage(url: string, options: {
  priority: ImagePriority
  signal?: AbortSignal
  retries?: number
  onFirstByte?: () => void
  cache: (buffer: Buffer, contentType: string) => Promise<unknown>
}): Promise<ImageStreamResult> {
  if (!validateTrustedImageUrl(url)) return Promise.reject(new Error('不支持的图片域名'))
  return scheduler.run({ key: url, host: new URL(url).host, priority: options.priority, signal: options.signal }, async (signal) => {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted()
      const result = await fetchImageStream(url, (target, init) => net.fetch(target, {
        ...init, credentials: 'omit',
        headers: {
          Referer: `https://${getActiveDomain()}/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/*,*/*;q=0.8'
        }
      }), { signal, onFirstByte: options.onFirstByte, cache: options.cache,
        firstByteMs: IMAGE_REQUEST_LIMITS.firstByteMs, totalMs: IMAGE_REQUEST_LIMITS.totalMs })
      if (!shouldRetryImage(result.status, attempt) || attempt >= (options.retries ?? IMAGE_REQUEST_LIMITS.retries) || signal.aborted) return result
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason) }
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 250 * 2 ** attempt)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) { signal.removeEventListener('abort', abort); abort() }
      })
    }
  }, (result) => result.done)
}
