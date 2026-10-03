import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import * as crypto from 'crypto'
import { selectEvictionCandidates } from './imageCacheCore'
import { getAppDataDir } from './dataPaths'
import { createCacheMaintenanceScheduler } from './imageCacheMaintenance'
import { beginIoPerfSpan } from './ioMetrics'
import { requestImage } from './imageNetwork'
import { isImage } from './imageStreamFetch'

// ─── Image Loader Pipeline ────────────────────────────────────

export interface ImageResult {
  url: string
  localPath: string | null
  cached: boolean
  buffer?: Buffer
  error?: string
}

export interface ImageLoaderOptions {
  concurrency?: number
  maxRetries?: number
  signal?: AbortSignal
  onImage?: (result: ImageResult, index: number) => Promise<void>
}

const DEFAULT_OPTIONS = {
  concurrency: 6,
  maxRetries: 3,
  // 图片缓存跟随便携数据目录，与数据库一起随 exe 走
  cacheDir: join(getAppDataDir(), 'jmcomic-images')
}

let imageCacheLimitBytes = 1000 * 1024 * 1024


function urlToFilename(url: string): string {
  const hash = crypto.createHash('md5').update(url).digest('hex')
  const urlExt = url.match(/\.(jpg|jpeg|png|webp|gif|bmp)/i)?.[1]
  const ext = urlExt ?? 'jpg'
  return `${hash}.${ext}`
}


export interface CachedImage {
  buffer: Buffer
  filepath: string
}

export async function readCachedImage(url: string): Promise<CachedImage | null> {
  const filepath = join(DEFAULT_OPTIONS.cacheDir, urlToFilename(url))
  try {
    const buffer = await readFile(filepath)
    if (!isImage(buffer)) {
      await unlink(filepath).catch(() => {})
      return null
    }
    return { buffer, filepath }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[image-cache] read failed:', error)
    }
    return null
  }
}

/**
 * 把已下载的图片写入磁盘缓存（供 jmimg:// 协议复用），并触发限额淘汰。
 */
let temporaryFileCounter = 0

export async function storeImage(
  url: string,
  buffer: Buffer,
  _contentType?: string
): Promise<string> {
  const filename = urlToFilename(url)
  await mkdir(DEFAULT_OPTIONS.cacheDir, { recursive: true })
  const filepath = join(DEFAULT_OPTIONS.cacheDir, filename)
  const temporaryPath = `${filepath}.${process.pid}.${++temporaryFileCounter}.tmp`
  try {
    await writeFile(temporaryPath, buffer)
    await rename(temporaryPath, filepath)
  } catch (error) {
    await unlink(temporaryPath).catch(() => {})
    throw error
  }
  void scheduleCacheMaintenance()
  return filepath
}

export function setImageCacheLimit(bytes: number): void {
  imageCacheLimitBytes = Math.max(1, Math.floor(bytes))
}


async function enforceCacheLimitAsync(cacheDir: string): Promise<void> {
  if (imageCacheLimitBytes <= 0) return
  const span = beginIoPerfSpan('image-cache.scan')
  let names: string[]
  try {
    names = await readdir(cacheDir)
  } catch {
    span.finish('error')
    return
  }

  const entries = await Promise.all(
    names.filter(name => !name.endsWith('.tmp')).map(async (name) => {
      try {
        const fileStat = await stat(join(cacheDir, name))
        return fileStat.isFile()
          ? { name, size: fileStat.size, mtimeMs: fileStat.mtimeMs }
          : null
      } catch {
        return null
      }
    })
  )
  const files = entries.filter(
    (entry): entry is { name: string; size: number; mtimeMs: number } => entry !== null
  )
  span.finish('ok', { itemCount: files.length })
  for (const name of selectEvictionCandidates(files, imageCacheLimitBytes)) {
    await unlink(join(cacheDir, name)).catch(() => {})
  }
}

const cacheMaintenanceScheduler = createCacheMaintenanceScheduler(() =>
  enforceCacheLimitAsync(DEFAULT_OPTIONS.cacheDir)
)

export function scheduleCacheMaintenance(): Promise<void> {
  return cacheMaintenanceScheduler.schedule()
}

export async function loadImages(urls: string[], options: ImageLoaderOptions = {}): Promise<ImageResult[]> {
  const results: ImageResult[] = new Array(urls.length)
  let cursor = 0
  const concurrency = Math.max(1, Math.min(6, Math.floor(options.concurrency ?? DEFAULT_OPTIONS.concurrency)))
  async function worker(): Promise<void> {
    while (cursor < urls.length) {
      const index = cursor++
      const url = urls[index]
      let result: ImageResult = { url, localPath: null, cached: false }
      try {
        options.signal?.throwIfAborted()
        const cached = await readCachedImage(url)
        if (cached) {
          result = { url, localPath: cached.filepath, cached: true, buffer: cached.buffer }
        } else {
          const retries = Math.max(0, options.maxRetries ?? DEFAULT_OPTIONS.maxRetries)
          for (let attempt = 0; ; attempt++) {
            try {
              const response = await requestImage(url, {
                priority: 'background', signal: options.signal, retries: 0,
                cache: (buffer, contentType) => storeImage(url, buffer, contentType)
              })
              if (response.status !== 200 || !response.takeStream) throw new Error(`HTTP ${response.status}`)
              const stream = response.takeStream()
              const chunks: Buffer[] = []
              const reader = stream.getReader()
              const abort = () => { void reader.cancel(options.signal?.reason).catch(() => {}) }
              options.signal?.addEventListener('abort', abort, { once: true })
              try {
                if (options.signal?.aborted) abort()
                for (;;) {
                  const chunk = await reader.read()
                  options.signal?.throwIfAborted()
                  if (chunk.done) break
                  chunks.push(Buffer.from(chunk.value))
                }
                options.signal?.throwIfAborted()
                await response.done
                if (response.errorReason) throw new Error(response.errorReason)
              } finally {
                options.signal?.removeEventListener('abort', abort)
                reader.releaseLock()
              }
              result = { url, localPath: null, cached: false, buffer: Buffer.concat(chunks) }
              break
            } catch (error) {
              if (options.signal?.aborted || attempt >= retries) throw error
            }
          }
        }
        options.signal?.throwIfAborted()
        await options.onImage?.(result, index)
      } catch (error) {
        result = { url, localPath: null, cached: false, error: error instanceof Error ? error.message : String(error) }
      }
      const { buffer: _buffer, ...summary } = result
      results[index] = summary
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker))
  return results
}


/**
 * Clear all cached images asynchronously.
 */
export async function clearImageCacheAsync(): Promise<number> {
  const dir = DEFAULT_OPTIONS.cacheDir
  let count = 0
  if (existsSync(dir)) {
    try {
      const files = await readdir(dir)
      await Promise.all(
        files.filter(file => !file.endsWith('.tmp')).map(async (file) => {
          try {
            await unlink(join(dir, file))
            count++
          } catch {
            /* skip */
          }
        })
      )
    } catch {
      /* skip */
    }
  }
  cachedSizeValue = 0
  lastSizeCheckTime = 0
  return count
}


let cachedSizeValue = 0
let lastSizeCheckTime = 0

/**
 * Get cache size in bytes asynchronously with cached TTL.
 */
export async function getImageCacheSizeAsync(): Promise<number> {
  const now = Date.now()
  if (now - lastSizeCheckTime < 5000 && cachedSizeValue > 0) {
    return cachedSizeValue
  }
  const dir = DEFAULT_OPTIONS.cacheDir
  let size = 0
  if (existsSync(dir)) {
    try {
      const files = await readdir(dir)
      const stats = await Promise.all(
        files.map(async (file) => {
          try {
            const st = await stat(join(dir, file))
            return st.size
          } catch {
            return 0
          }
        })
      )
      size = stats.reduce((a, b) => a + b, 0)
    } catch {
      /* skip */
    }
  }
  cachedSizeValue = size
  lastSizeCheckTime = now
  return size
}


ipcMain.handle('image:clearCache', async () => {
  return clearImageCacheAsync()
})

ipcMain.handle('image:cacheSize', async () => {
  return getImageCacheSizeAsync()
})
