import { dialog, ipcMain } from 'electron'
import { getDatabase } from './database'
import { inspectChapterFiles, normalizeTaskRow, resolveTaskDirectory, sanitizeFileName } from './downloadCore'
import { writeCbz, type ArchiveEntry } from './cbzExport'
import { leaseDownloadDirectories } from './downloadLeases'
import { waitWithAbort } from '../shared/waitWithAbort'

const running = new Map<AbortController, Promise<unknown>>()
let stopping = false
export async function stopDownloadExports(): Promise<void> {
  stopping = true
  for (const controller of running.keys()) controller.abort()
  await Promise.allSettled([...running.values()])
}
export function resumeDownloadExports(): void { stopping = false }

export function registerDownloadExport(): void {
  ipcMain.handle('download:exportCbz', (_event, selection: { mangaId?: string; taskId?: number }) => {
    if (stopping) return { ok: false, error: '程序正在保存并关闭，请稍后重试' }
    const controller = new AbortController()
    const signal = controller.signal
    const operation = (async () => {
      let release: (() => void) | undefined
      try {
        const db = await getDatabase()
        signal.throwIfAborted()
        const result = selection.taskId !== undefined ? db.exec('SELECT * FROM downloads WHERE id = ?', [selection.taskId])
          : db.exec('SELECT * FROM downloads WHERE manga_id = ? ORDER BY chapter_index, id DESC', [selection.mangaId ?? ''])
        const rows = result[0]?.values.map(values => normalizeTaskRow(Object.fromEntries(result[0].columns.map((name, index) => [name, values[index]])))) ?? []
        if (rows.some(row => row.status === 'downloading' || row.status === 'pending')) throw new Error('请等待下载完成后导出')
        const seen = new Set<number>()
        const chapters = rows.filter(row => {
          if (row.status !== 'completed' || seen.has(row.chapterIndex)) return false
          seen.add(row.chapterIndex); return true
        })
        if (!chapters.length) throw new Error('没有可导出的已完成章节')
        release = leaseDownloadDirectories(chapters.map(resolveTaskDirectory))
        const entries: ArchiveEntry[] = []
        for (const chapter of chapters) {
          const scan = await waitWithAbort(inspectChapterFiles(resolveTaskDirectory(chapter), chapter.totalPages), signal)
          if (!scan.available) throw new Error(`《${chapter.chapterTitle}》文件不完整，请先修复缺失页`)
          for (const file of scan.files) entries.push({ source: file.path,
            name: `${String(chapter.chapterIndex + 1).padStart(4, '0')}/${String(file.index + 1).padStart(4, '0')}.${file.format}` })
        }
        const { canceled, filePath } = await waitWithAbort(dialog.showSaveDialog({ title: '导出漫画归档',
          defaultPath: `${sanitizeFileName(chapters[0].mangaTitle)}${selection.taskId ? ` - ${sanitizeFileName(chapters[0].chapterTitle)}` : ''}.cbz`,
          filters: [{ name: '漫画归档', extensions: ['cbz'] }] }), signal)
        if (canceled || !filePath) return { canceled: true }
        signal.throwIfAborted()
        await writeCbz(filePath, entries, signal)
        return { ok: true, path: filePath, pages: entries.length }
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
      finally { release?.() }
    })().finally(() => running.delete(controller))
    running.set(controller, operation)
    return operation
  })
}
