import { readFile, realpath } from 'node:fs/promises'
import { isLocalImagePathSafe } from './downloadCore'

export interface AllowedRootsCache {
  get: () => Promise<string[]>
  invalidate: () => void
}

/** 缓存允许访问的下载根目录，并合并同一时刻的重复加载。 */
export function createAllowedRootsCache(
  load: () => Promise<string[]>,
  ttlMs: number,
  now: () => number = Date.now
): AllowedRootsCache {
  let cached: string[] | null = null
  let expiresAt = 0
  let inFlight: Promise<string[]> | null = null
  let generation = 0

  return {
    async get(): Promise<string[]> {
      if (cached && now() < expiresAt) return [...cached]
      if (inFlight) return [...await inFlight]

      const requestGeneration = generation
      let loaded: Promise<string[]>
      try {
        loaded = Promise.resolve(load())
      } catch (err) {
        loaded = Promise.reject(err)
      }
      const request = loaded.then((roots) => {
        const snapshot = [...roots]
        if (generation === requestGeneration) {
          cached = snapshot
          expiresAt = now() + ttlMs
        }
        return snapshot
      }).finally(() => {
        if (inFlight === request) inFlight = null
      })
      inFlight = request
      return [...await request]
    },

    invalidate(): void {
      generation++
      cached = null
      expiresAt = 0
      inFlight = null
    }
  }
}

export async function openLocalImage(filepath: string, allowedRoots?: string[]): Promise<Buffer> {
  if (allowedRoots) {
    if (!isLocalImagePathSafe(filepath, allowedRoots)) throw new Error('图片路径超出下载范围')
    const [actualFile, actualRoots] = await Promise.all([realpath(filepath), Promise.all(allowedRoots.map(root => realpath(root).catch(() => '')))])
    if (!isLocalImagePathSafe(actualFile, actualRoots)) throw new Error('图片路径超出下载范围')
  }
  return readFile(filepath)
}
