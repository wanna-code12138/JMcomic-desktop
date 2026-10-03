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
  const entryBytes = new Map<string, number>()
  const envelopeBytes = Buffer.byteLength(JSON.stringify({ version: 1, namespace: options.namespace, entries: {} }))
  if (maxBytes < envelopeBytes) throw new RangeError('Content cache byte budget is too small')
  let entriesBytes = 0
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

      const diskEntries = Object.entries(parsed.entries).sort(([, a], [, b]) =>
        (a?.lastAccessedAt ?? a?.savedAt ?? 0) - (b?.lastAccessedAt ?? b?.savedAt ?? 0))
      for (const [key, entry] of diskEntries) {
        if (!entry || typeof entry !== 'object') continue
        const candidate = entry as { savedAt?: unknown; lastAccessedAt?: unknown; value?: unknown }
        if (!Number.isFinite(candidate.savedAt)) continue
        const savedAt = candidate.savedAt as number
        const lastAccessedAt = Number.isFinite(candidate.lastAccessedAt)
          ? (candidate.lastAccessedAt as number)
          : savedAt
        putEntry(key, { savedAt, lastAccessedAt, value: candidate.value })
      }
      evictIfNeeded()
    } catch {
      // Missing, truncated, or malformed cache files are equivalent to a miss.
    }
  })()

  function removeEntry(key: string): void {
    entriesBytes -= entryBytes.get(key) ?? 0
    entryBytes.delete(key)
    entries.delete(key)
  }

  function putEntry(key: string, entry: DiskEntry): void {
    removeEntry(key)
    const bytes = Buffer.byteLength(JSON.stringify(key)) + 1 + Buffer.byteLength(JSON.stringify(entry))
    if (envelopeBytes + bytes > maxBytes) return
    entries.set(key, entry)
    entryBytes.set(key, bytes)
    entriesBytes += bytes
    evictIfNeeded()
  }

  function evictIfNeeded(): void {
    while (entries.size > maxEntries || envelopeBytes + entriesBytes + Math.max(0, entries.size - 1) > maxBytes) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) break
      removeEntry(oldest)
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
      void doPersist().catch(() => {})
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
      putEntry(key, { savedAt: currentTime, lastAccessedAt: currentTime, value })
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
        putEntry(key, entry)
        const age = Math.max(0, now() - entry.savedAt)
        if (age < freshTtlMs) return { value: cachedValue, state: 'fresh' }
        if (age < staleTtlMs) {
          const refreshPromise = refresh(key, load, validate).catch(() => {})
          return { value: cachedValue, state: 'stale', refresh: refreshPromise as Promise<void> }
        }
      } else if (entry) {
        removeEntry(key)
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
      entryBytes.clear()
      entriesBytes = 0
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
