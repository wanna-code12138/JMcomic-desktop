import { resolve } from 'path'

const leased = new Set<string>()
const key = (path: string): string => resolve(path).toLowerCase()
export const isDownloadDirectoryLeased = (path: string): boolean => leased.has(key(path))
export function leaseDownloadDirectories(paths: string[]): () => void {
  const keys = [...new Set(paths.map(key))]
  if (keys.some(path => leased.has(path))) throw new Error('章节正在处理，请稍后重试')
  keys.forEach(path => leased.add(path))
  return () => keys.forEach(path => leased.delete(path))
}
