import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const DEFAULT_FRESH_TTL_MS = 10 * 60_000
const DEFAULT_STALE_TTL_MS = 24 * 60 * 60_000

interface DiskEntry {
  savedAt: number
  value: unknown
}

interface DiskCache {
  version: 1
  entries: Record<string, DiskEntry>
}

export interface ContentCacheResolution<T> {
  value: T
  state: 'fresh' | 'stale' | 'miss'
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

interface ContentCacheOptions {
  filePath: string
  now?: () => number
  freshTtlMs?: number
  staleTtlMs?: number
}

function isDiskCache(value: unknown): value is DiskCache {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { version?: unknown; entries?: unknown }
  return candidate.version === 1
    && Boolean(candidate.entries)
    && typeof candidate.entries === 'object'
    && !Array.isArray(candidate.entries)
}

export function createContentCache(options: ContentCacheOptions): ContentCache {
  const now = options.now ?? Date.now
  const freshTtlMs = options.freshTtlMs ?? DEFAULT_FRESH_TTL_MS
  const staleTtlMs = options.staleTtlMs ?? DEFAULT_STALE_TTL_MS
  const entries = new Map<string, DiskEntry>()
  const inFlight = new Map<string, Promise<unknown>>()
  let writeChain: Promise<void> = Promise.resolve()
  let generation = 0

  const initialized = (async (): Promise<void> => {
    try {
      const parsed = JSON.parse(await readFile(options.filePath, 'utf-8')) as unknown
      if (!isDiskCache(parsed)) return
      for (const [key, entry] of Object.entries(parsed.entries)) {
        if (!entry || typeof entry !== 'object') continue
        const candidate = entry as { savedAt?: unknown; value?: unknown }
        if (!Number.isFinite(candidate.savedAt)) continue
        entries.set(key, { savedAt: candidate.savedAt as number, value: candidate.value })
      }
    } catch {
      // Missing, truncated, or malformed cache files are equivalent to a miss.
    }
  })()

  function persist(): Promise<void> {
    const snapshot: DiskCache = {
      version: 1,
      entries: Object.fromEntries(entries)
    }
    writeChain = writeChain.catch(() => {}).then(async () => {
      await mkdir(dirname(options.filePath), { recursive: true })
      const temporaryPath = `${options.filePath}.tmp`
      await writeFile(temporaryPath, JSON.stringify(snapshot), 'utf-8')
      await rename(temporaryPath, options.filePath)
    })
    return writeChain
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
      entries.set(key, { savedAt: now(), value })
      await persist()
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
        const age = Math.max(0, now() - entry.savedAt)
        if (age < freshTtlMs) return { value: cachedValue, state: 'fresh' }
        if (age < staleTtlMs) {
          void refresh(key, load, validate).catch(() => {})
          return { value: cachedValue, state: 'stale' }
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
      await writeChain.catch(() => {})
    }
  }
}
