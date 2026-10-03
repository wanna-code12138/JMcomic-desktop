import type { JmApiFetchPort } from './jmAppApiTransport'

type FetchPort = (url: string, init: RequestInit) => Promise<Response>

export function createJmApiFetchPort(fetchPort: FetchPort): JmApiFetchPort {
  return {
    async send(request) {
      request.signal?.throwIfAborted()
      const response = await fetchPort(request.url, {
        method: request.method, headers: request.headers, signal: request.signal,
        redirect: 'manual', credentials: 'omit'
      })
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => { headers[key] = value })
      if (!response.body || response.status !== 200) {
        await response.body?.cancel()
        return { status: response.status, headers, bodyText: '' }
      }
      const reader = response.body.getReader()
      const limit = request.maxResponseBytes ?? 512 * 1024
      const chunks: Uint8Array[] = []
      let bytes = 0
      const cancel = (): void => { void reader.cancel().catch(() => {}) }
      request.signal?.addEventListener('abort', cancel, { once: true })
      try {
        request.signal?.throwIfAborted()
        while (true) {
          const next = await reader.read()
          request.signal?.throwIfAborted()
          if (next.done) break
          bytes += next.value.byteLength
          if (bytes > limit) throw new Error('RESPONSE_TOO_LARGE')
          chunks.push(next.value)
        }
        return { status: response.status, headers, bodyText: Buffer.concat(chunks).toString('utf8') }
      } catch (error) {
        await reader.cancel().catch(() => {})
        throw error
      } finally {
        request.signal?.removeEventListener('abort', cancel)
        reader.releaseLock()
      }
    }
  }
}
