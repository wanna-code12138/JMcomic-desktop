import archiver from 'archiver'
import { createWriteStream } from 'fs'
import { open, rename, unlink } from 'fs/promises'
import { dirname, extname, isAbsolute, relative, resolve } from 'path'
import { randomUUID } from 'crypto'

export interface ArchiveEntry { source: string; name: string }

/** Commit a complete archive atomically, retaining any previous destination on failure. */
export async function writeCbz(destination: string, entries: ArchiveEntry[], signal?: AbortSignal): Promise<void> {
  if (!entries.length || extname(destination).toLowerCase() !== '.cbz') throw new Error('请选择 .cbz 文件名')
  for (const entry of entries) {
    const within = relative(dirname(resolve(entry.source)), resolve(destination))
    if ((!within.startsWith('..') && !isAbsolute(within)) || !/^(?:\d+\/)?\d+\.(?:jpg|jpeg|png|webp|gif|bmp|avif)$/i.test(entry.name)) {
      throw new Error('导出目标不能位于原章节目录中')
    }
  }
  signal?.throwIfAborted()
  const temporary = `${destination}.${randomUUID()}.part`
  const output = createWriteStream(temporary, { flags: 'wx' })
  const archive = archiver('zip', { store: true })
  const abort = (): void => { archive.abort(); output.destroy(new Error('导出已取消')) }
  signal?.addEventListener('abort', abort, { once: true })
  const closed = new Promise<void>((resolve, reject) => {
    output.once('close', resolve)
    output.once('error', reject)
    archive.on('error', (error) => output.destroy(error))
    archive.on('warning', (error) => output.destroy(error))
  })
  try {
    archive.pipe(output)
    for (const entry of entries) archive.file(entry.source, { name: entry.name })
    await Promise.all([archive.finalize(), closed])
    signal?.throwIfAborted()
    const file = await open(temporary, 'r+')
    try { await file.sync() } finally { await file.close() }
    signal?.throwIfAborted()
    await rename(temporary, destination)
  } finally {
    signal?.removeEventListener('abort', abort)
    archive.abort()
    if (!output.closed) { output.destroy(); await new Promise<void>(resolve => output.once('close', resolve)) }
    await unlink(temporary).catch(() => {})
  }
}
