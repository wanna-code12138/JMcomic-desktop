import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const DEFAULT_FRESH_TTL_MS = 10 * 60_000
const DEFAULT_STALE_TTL_MS = 24 * 60 * 60_000
const DEFAULT_MAX_ENTRIES = 10_000
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024 // 64MiB
const DEFAULT_FLUSH_DELAY_MS = 100

interface DiskEntry {
  savedAt: number
  lastAccessedAt: number
  value: unknown
}

interface DiskCache {
  version: 1
  namespace?: string
  entries: Record<string, DiskEntry>
}

export interface ContentCacheResolution<T> {
  value: T
  state: 'fresh' | 'stale' | 'miss'
  refresh?: Promise<void>
}

export interface ContentCache {
  resolve<T>(
    key: string,
    load: () => Promise<T>,
    validate: (value: unknown) => value is T
  ): Promise<ContentCacheResolution<T>>
  clear(): Promise<void>
  waitForIdle(): Promise<void>
}

export interface ContentCacheOptions {
  filePath: string
  now?: () => number
  freshTtlMs?: number
  staleTtlMs?: number
  maxEntries?: number
  maxBytes?: number
  flushDelayMs?: number
  namespace?: string
}

function isDiskCache(value: unknown): value is DiskCache {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { version?: unknown; entries?: unknown }
  return candidate.version === 1
    && Boolean(candidate.entries)
    && typeof candidate.entries === 'object'
    && !Array.isArray(candidate.entries)
}

async function safeRename(source: string, destination: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rename(source, destination)
      return
    } catch (err: any) {
      if ((err.code === 'EPERM' || err.code === 'EBUSY') && attempt < 4) {
        await new Promise((r) => setTimeout(r, 20 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
}

export function createContentCache(options: ContentCacheOptions): ContentCache {
  const now = options.now ?? Date.now
  const freshTtlMs = options.freshTtlMs ?? DEFAULT_FRESH_TTL_MS
  const staleTtlMs = options.staleTtlMs ?? DEFAULT_STALE_TTL_MS
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const flushDelayMs = options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS

  const entries = new Map<string, DiskEntry>()
  const inFlight = new Map<string, Promise<unknown>>()
  let writeChain: Promise<void> = Promise.resolve()
  let flushTimer: NodeJS.Timeout | null = null
  let generation = 0

  const initialized = (async (): Promise<void> => {
    try {
      const parsed = JSON.parse(await readFile(options.filePath, 'utf-8')) as unknown
      if (!isDiskCache(parsed)) return

      // Namespace 隔离：不匹配直接视为 miss
      if (options.namespace && parsed.namespace !== options.namespace) {
        return
      }

      for (const [key, entry] of Object.entries(parsed.entries)) {
        if (!entry || typeof entry !== 'object') continue
        const candidate = entry as { savedAt?: unknown; lastAccessedAt?: unknown; value?: unknown }
        if (!Number.isFinite(candidate.savedAt)) continue
        const savedAt = candidate.savedAt as number
        const lastAccessedAt = Number.isFinite(candidate.lastAccessedAt)
          ? (candidate.lastAccessedAt as number)
          : savedAt
        entries.set(key, { savedAt, lastAccessedAt, value: candidate.value })
      }
      evictIfNeeded()
    } catch {
      // Missing, truncated, or malformed cache files are equivalent to a miss.
    }
  })()

  function evictIfNeeded(): void {
    while (entries.size > maxEntries) {
      let oldestKey: string | null = null
      let oldestTime = Infinity
      for (const [k, e] of entries.entries()) {
        if (e.lastAccessedAt < oldestTime) {
          oldestTime = e.lastAccessedAt
          oldestKey = k
        }
      }
      if (oldestKey) {
        entries.delete(oldestKey)
      } else {
        break
      }
    }
  }

  function doPersist(): Promise<void> {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    const currentGeneration = generation
    const snapshot: DiskCache = {
      version: 1,
      namespace: options.namespace,
      entries: Object.fromEntries(entries)
    }

    writeChain = writeChain.catch(() => {}).then(async () => {
      if (currentGeneration !== generation) return
      await mkdir(dirname(options.filePath), { recursive: true })
      const temporaryPath = `${options.filePath}.tmp`
      const jsonText = JSON.stringify(snapshot)
      if (Buffer.byteLength(jsonText, 'utf-8') > maxBytes) {
        // 若超出字节上限，进一步淘汰并重试
        evictIfNeeded()
      }
      await writeFile(temporaryPath, jsonText, 'utf-8')
      if (currentGeneration !== generation) {
        await unlink(temporaryPath).catch(() => {})
        return
      }
      await safeRename(temporaryPath, options.filePath)
    })
    return writeChain
  }

  function scheduleFlush(): void {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void doPersist()
    }, flushDelayMs)
  }

  function refresh<T>(
    key: string,
    load: () => Promise<T>,
    validate: (value: unknown) => value is T
  ): Promise<T> {
    const active = inFlight.get(key)
    if (active) return active as Promise<T>

    const refreshGeneration = generation
    const request = (async (): Promise<T> => {
      const value = await load()
      if (!validate(value)) throw new Error('content-cache-validation')
      if (refreshGeneration !== generation) return value

      const currentTime = now()
      entries.set(key, { savedAt: currentTime, lastAccessedAt: currentTime, value })
      evictIfNeeded()
      scheduleFlush()
      return value
    })().finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key)
    })
    inFlight.set(key, request)
    return request
  }

  return {
    async resolve<T>(
      key: string,
      load: () => Promise<T>,
      validate: (value: unknown) => value is T
    ): Promise<ContentCacheResolution<T>> {
      await initialized
      const entry = entries.get(key)
      const cachedValue = entry?.value
      if (entry && validate(cachedValue)) {
        entry.lastAccessedAt = now() // 更新 LRU 访问时间
        const age = Math.max(0, now() - entry.savedAt)
        if (age < freshTtlMs) return { value: cachedValue, state: 'fresh' }
        if (age < staleTtlMs) {
          const refreshPromise = refresh(key, load, validate).catch(() => {})
          return { value: cachedValue, state: 'stale', refresh: refreshPromise as Promise<void> }
        }
      } else if (entry) {
        entries.delete(key)
      }

      const value = await refresh(key, load, validate)
      return { value, state: 'miss' }
    },

    async clear(): Promise<void> {
      await initialized
      generation++
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      entries.clear()
      await writeChain.catch(() => {})
      await Promise.all([
        unlink(options.filePath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error
        }),
        unlink(`${options.filePath}.tmp`).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error
        })
      ])
    },

    async waitForIdle(): Promise<void> {
      await initialized
      await Promise.allSettled([...inFlight.values()])
      if (flushTimer) {
        await doPersist()
      }
      await writeChain.catch(() => {})
    }
  }
}
