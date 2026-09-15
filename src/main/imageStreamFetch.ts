import { IMAGE_REQUEST_LIMITS } from './imageRequestPolicy'

export interface ImageStreamResult {
  status: number
  errorReason?: string
  headers?: Record<string, string>
  takeStream?: () => ReadableStream<Uint8Array>
  done: Promise<void>
  bytes: number
}

interface Options {
  signal?: AbortSignal
  firstByteMs?: number
  totalMs?: number
  maxBytes?: number
  onFirstByte?: () => void
  cache?: (buffer: Buffer, contentType: string) => Promise<unknown>
}

function isImage(bytes: Buffer): boolean {
  return bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    || bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || /^GIF8[79]a/.test(bytes.subarray(0, 6).toString('ascii'))
    || (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP')
    || bytes.subarray(0, 2).toString('ascii') === 'BM'
    || (bytes.subarray(4, 8).toString('ascii') === 'ftyp' && /avif|avis/.test(bytes.subarray(8, 32).toString('ascii')))
}

export async function fetchImageStream(
  url: string,
  fetchPort: (url: string, init: RequestInit) => Promise<Response>,
  options: Options = {}
): Promise<ImageStreamResult> {
  const controller = new AbortController()
  let complete!: () => void
  const done = new Promise<void>((resolve) => { complete = resolve })
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
  let finished = false
  let firstByte = false
  const chunks: Buffer[] = []
  let bytes = 0
  const result: ImageStreamResult = { status: 200, done, bytes: 0 }
  const forwardAbort = () => controller.abort(options.signal?.reason ?? new Error('aborted'))
  const firstTimer = setTimeout(() => controller.abort(new Error('first-byte timeout')), options.firstByteMs ?? IMAGE_REQUEST_LIMITS.firstByteMs)
  const totalTimer = setTimeout(() => controller.abort(new Error('total timeout')), options.totalMs ?? IMAGE_REQUEST_LIMITS.totalMs)
  const cleanup = () => {
    clearTimeout(firstTimer)
    clearTimeout(totalTimer)
    options.signal?.removeEventListener('abort', forwardAbort)
    controller.signal.removeEventListener('abort', abort)
  }
  const finish = () => { if (!finished) { finished = true; cleanup(); complete() } }
  const abort = () => {
    if (finished) return
    result.errorReason = controller.signal.reason instanceof Error ? controller.signal.reason.message : 'aborted'
    void reader?.cancel(controller.signal.reason).catch(() => {})
    try { streamController?.error(controller.signal.reason) } catch {}
    finish()
  }
  controller.signal.addEventListener('abort', abort, { once: true })
  options.signal?.addEventListener('abort', forwardAbort, { once: true })
  if (options.signal?.aborted) forwardAbort()
  try {
    controller.signal.throwIfAborted()
    const response = await new Promise<Response>((resolve, reject) => {
      const rejectAbort = () => reject(controller.signal.reason)
      controller.signal.addEventListener('abort', rejectAbort, { once: true })
      fetchPort(url, { signal: controller.signal, redirect: 'manual' }).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', rejectAbort))
    })
    controller.signal.throwIfAborted()
    const contentType = response.headers.get('content-type') ?? ''
    if (response.status !== 200 || !contentType.startsWith('image/') || !response.body) {
      void response.body?.cancel().catch(() => {})
      result.status = response.status >= 400 ? response.status : 502
      result.errorReason = 'invalid-image-response'
      finish()
      return result
    }
    reader = response.body.getReader()
    let shared = new ReadableStream<Uint8Array>({
      start(c) { streamController = c },
      async pull(c) {
        try {
          const next = await reader!.read()
          controller.signal.throwIfAborted()
          if (next.done) {
            const buffer = Buffer.concat(chunks, bytes)
            chunks.length = 0
            if (!isImage(buffer)) throw new Error('invalid image signature')
            if (options.cache) await options.cache(buffer, contentType).catch(() => {})
            c.close()
            finish()
            return
          }
          if (!firstByte) { firstByte = true; clearTimeout(firstTimer); options.onFirstByte?.() }
          bytes += next.value.byteLength
          if (bytes > (options.maxBytes ?? 32 * 1024 * 1024)) throw new Error('image size limit exceeded')
          result.bytes = bytes
          chunks.push(Buffer.from(next.value))
          c.enqueue(next.value)
        } catch (error) {
          controller.abort(error)
          abort()
        }
      },
      cancel(reason) { controller.abort(reason ?? new Error('consumer canceled')) }
    })
    result.headers = { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' }
    result.takeStream = () => {
      const branches = shared.tee()
      shared = branches[0]
      return branches[1]
    }
    return result
  } catch (error) {
    result.status = options.signal?.aborted ? 499 : controller.signal.aborted ? 504 : 502
    result.errorReason = error instanceof Error ? error.message : 'image-request-failed'
    finish()
    return result
  }
}
