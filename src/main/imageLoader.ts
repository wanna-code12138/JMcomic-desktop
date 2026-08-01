import { ipcMain, net, session } from 'electron'
import { getActiveDomain } from './networkProbe'
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import * as crypto from 'crypto'
import { selectEvictionCandidates } from './imageCacheCore'
import { getAppDataDir } from './dataPaths'

// ─── Image Loader Pipeline ────────────────────────────────────

interface ImageTask {
  url: string
  filename: string
  retryCount: number
}

interface ImageResult {
  url: string
  localPath: string | null
  cached: boolean
  error?: string
}

interface ImageLoaderOptions {
  concurrency?: number
  timeout?: number
  maxRetries?: number
  cacheDir?: string
}

const DEFAULT_OPTIONS: Required<ImageLoaderOptions> = {
  concurrency: 6,
  timeout: 15000,
  maxRetries: 3,
  // 图片缓存跟随便携数据目录，与数据库一起随 exe 走
  cacheDir: join(getAppDataDir(), 'jmcomic-images')
}

// In-memory URL → local path cache
const urlToPathCache = new Map<string, string>()
let imageCacheLimitBytes = 1000 * 1024 * 1024

function getCacheDir(): string {
  const dir = DEFAULT_OPTIONS.cacheDir
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function urlToFilename(url: string, contentType?: string): string {
  const hash = crypto.createHash('md5').update(url).digest('hex')
  const urlExt = url.match(/\.(jpg|jpeg|png|webp|gif|bmp)/i)?.[1]
  const ctExt = contentType?.match(/^image\/(jpeg|png|webp|gif|bmp)/i)?.[1]
  const ext = urlExt ?? (ctExt === 'jpeg' ? 'jpg' : ctExt) ?? 'jpg'
  return `${hash}.${ext}`
}

function getCachedPath(url: string): string | null {
  const filename = urlToFilename(url)
  const fullPath = join(getCacheDir(), filename)
  if (existsSync(fullPath)) {
    return fullPath
  }
  return null
}

export function getCachedImagePath(url: string): string | null {
  return getCachedPath(url)
}

/**
 * 把已下载的图片写入磁盘缓存（供 jmimg:// 协议复用），并触发限额淘汰。
 */
export function storeImage(url: string, buffer: Buffer, contentType?: string): string {
  const filename = urlToFilename(url, contentType)
  const filepath = join(getCacheDir(), filename)
  writeFileSync(filepath, buffer)
  urlToPathCache.set(url, filepath)
  enforceCacheLimit(getCacheDir())
  return filepath
}

export function setImageCacheLimit(bytes: number): void {
  imageCacheLimitBytes = Math.max(1, Math.floor(bytes))
}

export function getImageCacheLimitBytes(): number {
  return imageCacheLimitBytes
}

function enforceCacheLimit(cacheDir: string): void {
  if (imageCacheLimitBytes <= 0) return
  let files: { name: string; size: number; mtimeMs: number }[] = []
  try {
    files = readdirSync(cacheDir)
      .map((name) => {
        const full = join(cacheDir, name)
        try {
          const st = statSync(full)
          return st.isFile() ? { name, size: st.size, mtimeMs: st.mtimeMs } : null
        } catch {
          return null
        }
      })
      .filter((f): f is { name: string; size: number; mtimeMs: number } => f !== null)
  } catch {
    return
  }
  for (const name of selectEvictionCandidates(files, imageCacheLimitBytes)) {
    try {
      unlinkSync(join(cacheDir, name))
    } catch {
      /* skip */
    }
  }
}

async function downloadImage(url: string, filepath: string, timeout: number): Promise<void> {
  // Get cookies from default session to pass to image CDN
  const cookies = await session.defaultSession.cookies.get({ url })
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

  return new Promise((resolve, reject) => {
    const req = net.request({
      method: 'GET',
      url: url
    })

    req.setHeader('Referer', `https://${getActiveDomain()}/`)
    req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    req.setHeader('Accept', 'image/avif,image/webp,image/*,*/*')
    req.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8')
    if (cookieHeader) {
      req.setHeader('Cookie', cookieHeader)
    }

    const timer = setTimeout(() => {
      req.abort()
      reject(new Error(`timeout: ${url}`))
    }, timeout)

    const chunks: Buffer[] = []

    req.on('response', (response) => {
      if (response.statusCode >= 400) {
        clearTimeout(timer)
        reject(new Error(`HTTP ${response.statusCode}: ${url}`))
        return
      }

      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      response.on('end', () => {
        clearTimeout(timer)
        writeFileSync(filepath, Buffer.concat(chunks))
        resolve()
      })

      response.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })

    req.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`${err.message}: ${url}`))
    })

    req.end()
  })
}

/**
 * Load images with concurrency control, caching, and retry.
 */
export async function loadImages(
  urls: string[],
  options?: ImageLoaderOptions
): Promise<ImageResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const cacheDir = getCacheDir()

  // Separate cached and uncached
  const results: ImageResult[] = new Array(urls.length)
  const pending: { index: number; url: string }[] = []

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    // Check in-memory cache
    if (urlToPathCache.has(url)) {
      results[i] = { url, localPath: urlToPathCache.get(url)!, cached: true }
      continue
    }
    // Check disk cache
    const cached = getCachedPath(url)
    if (cached) {
      urlToPathCache.set(url, cached)
      results[i] = { url, localPath: cached, cached: true }
      continue
    }
    pending.push({ index: i, url })
  }

  if (pending.length === 0) return results

  // Download with concurrency limit
  const queue = [...pending]
  let active = 0
  let resolveAll: () => void
  const done = new Promise<void>((r) => { resolveAll = r })

  function processNext(): void {
    while (active < opts.concurrency && queue.length > 0) {
      const task = queue.shift()!
      active++
      downloadSingle(task.index, task.url, opts).finally(() => {
        active--
        if (queue.length === 0 && active === 0) {
          resolveAll()
        } else {
          processNext()
        }
      })
    }
    if (queue.length === 0 && active === 0) {
      resolveAll()
    }
  }

  async function downloadSingle(
    index: number,
    url: string,
    opts: Required<ImageLoaderOptions>
  ): Promise<void> {
    const filename = urlToFilename(url)
    const filepath = join(cacheDir, filename)

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        await downloadImage(url, filepath, opts.timeout)
        urlToPathCache.set(url, filepath)
        if (cacheDir === DEFAULT_OPTIONS.cacheDir) {
          enforceCacheLimit(cacheDir)
        }
        results[index] = { url, localPath: filepath, cached: false }
        return
      } catch (err) {
        if (attempt === opts.maxRetries) {
          results[index] = { url, localPath: null, cached: false, error: String(err) }
        }
      }
    }
  }

  processNext()
  await done

  return results
}

/**
 * Convert image URL to a file:// protocol URL for use in <img> tags.
 */
export function imageUrlToFileProtocol(localPath: string): string {
  // On Windows, convert to proper file:// URL
  return `file:///${localPath.replace(/\\/g, '/')}`
}

/**
 * Preload a single image and return its local path (or null).
 */
export async function preloadImage(url: string): Promise<string | null> {
  // Check cache first
  const cached = getCachedPath(url)
  if (cached) {
    urlToPathCache.set(url, cached)
    return cached
  }

  const results = await loadImages([url])
  return results[0]?.localPath ?? null
}

/**
 * Clear all cached images.
 */
export function clearImageCache(): number {
  const dir = getCacheDir()
  let count = 0
  if (existsSync(dir)) {
    const files = require('fs').readdirSync(dir)
    for (const file of files) {
      try {
        require('fs').unlinkSync(join(dir, file))
        count++
      } catch { /* skip */ }
    }
  }
  urlToPathCache.clear()
  return count
}

/**
 * Get cache size in bytes.
 */
export function getImageCacheSize(): number {
  const dir = getCacheDir()
  let size = 0
  if (existsSync(dir)) {
    const files = require('fs').readdirSync(dir)
    for (const file of files) {
      try {
        size += require('fs').statSync(join(dir, file)).size
      } catch { /* skip */ }
    }
  }
  return size
}

// ─── IPC Handlers ─────────────────────────────────────────────

ipcMain.handle('image:load', async (_event, urls: string[], options?: ImageLoaderOptions) => {
  return loadImages(urls, options)
})

ipcMain.handle('image:preload', async (_event, url: string) => {
  return preloadImage(url)
})

ipcMain.handle('image:clearCache', async () => {
  return clearImageCache()
})

ipcMain.handle('image:cacheSize', async () => {
  return getImageCacheSize()
})
