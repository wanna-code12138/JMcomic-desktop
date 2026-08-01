export interface CacheFileEntry {
  name: string
  size: number
  mtimeMs: number
}

/**
 * 缓存超限时按最旧优先（mtime 升序，mtime 相同按文件名）选出要删除的文件，
 * 删到总大小不超过 limitBytes 为止。
 */
export function selectEvictionCandidates(files: CacheFileEntry[], limitBytes: number): string[] {
  let total = files.reduce((sum, f) => sum + f.size, 0)
  if (total <= limitBytes) return []

  const ordered = [...files].sort(
    (a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name)
  )

  const toRemove: string[] = []
  for (const f of ordered) {
    if (total <= limitBytes) break
    toRemove.push(f.name)
    total -= f.size
  }
  return toRemove
}
