import { BrowserWindow, ipcMain, shell } from 'electron'
import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { stat } from 'node:fs/promises'
import { getDatabase, saveDatabase } from './database'
import { getSettings } from './settingsStore'
import { getAppDataDir } from './dataPaths'
import { getPublicChapterPages } from './contentApi'
import { loadImages } from './imageLoader'
import { descrambleImage } from './imageDescrambler'
import { imageMimeType } from '../shared/imageFormat'
import { PdfDownloadService, type PdfRepository } from './pdfDownloadService'
import { preparePdfRequest, resolvePdfOutput, pdfStagingDirectory } from './pdfDownloadCore'
import type { PdfTask, PdfPageSource, PdfWriteResult } from '../shared/pdfContracts'

export const pdfRepository: PdfRepository = {
  list: async () => {
    const db = await getDatabase()
    const rows = db.exec('SELECT id,payload_json,status FROM pdf_downloads ORDER BY id DESC')[0]?.values ?? []
    return rows.map(row => {
      const task = JSON.parse(String(row[1])) as PdfTask
      if (!preparePdfRequest(task) || task.kind !== 'pdf') throw Error('PDF 下载记录损坏，原记录已保留')
      resolvePdfOutput(task.savePath, task.outputFile); pdfStagingDirectory(getAppDataDir(), task.stagingId)
      return { ...task, id: Number(row[0]), status: String(row[2]) }
    })
  },
  insert: async task => {
    const db = await getDatabase()
    db.run('INSERT INTO pdf_downloads (manga_id,identity,status,payload_json) VALUES (?,?,?,?)', [task.mangaId, task.identity, task.status, JSON.stringify(task)])
    const id = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
    try { await saveDatabase() } catch (error) { db.run('DELETE FROM pdf_downloads WHERE id=?', [id]); throw error }
    return { ...task, id }
  },
  save: async task => {
    const db = await getDatabase()
    db.run('UPDATE pdf_downloads SET status=?,payload_json=? WHERE id=?', [task.status, JSON.stringify(task), task.id])
    await saveDatabase()
  },
  remove: async id => { const db = await getDatabase(); db.run('DELETE FROM pdf_downloads WHERE id=?', [id]); await saveDatabase() }
}

function writeInWorker(part: string, pages: PdfPageSource[], signal: AbortSignal, progress: (page: number) => void): Promise<PdfWriteResult> {
  signal.throwIfAborted()
  const worker = new Worker(join(__dirname, 'pdfWorker.js'), { workerData: { part, pages }, resourceLimits: { maxOldGenerationSizeMb: 256 } })
  return new Promise((resolve, reject) => {
    let result: PdfWriteResult | undefined, failure: Error | undefined, timer: ReturnType<typeof setTimeout> | undefined
    const abort = (): void => { worker.postMessage('cancel'); timer = setTimeout(() => { void worker.terminate() }, 2000) }
    worker.on('message', message => {
      if (message.page) progress(message.page)
      if (message.result) result = message.result
      if (message.error) failure = Error(message.error)
    })
    worker.once('error', error => { failure = error instanceof Error ? error : Error(String(error)) })
    worker.once('exit', code => {
      signal.removeEventListener('abort', abort); clearTimeout(timer)
      if (signal.aborted) reject(signal.reason)
      else if (failure || code || !result) reject(failure ?? Error(`PDF 生成进程退出 (${code})`))
      else resolve(result)
    })
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort()
  })
}

const service = new PdfDownloadService({ dataDir: getAppDataDir(), repository: pdfRepository, settings: getSettings, pages: getPublicChapterPages, images: loadImages,
  transform: (bytes, scramble, url) => descrambleImage(bytes, scramble, url, !['image/png', 'image/jpeg'].includes(imageMimeType(bytes) ?? '')),
  writer: writeInWorker,
  progress: task => {
    const progress = { kind: 'pdf', taskId: task.id, mangaId: task.mangaId, mangaTitle: task.mangaTitle, chapterIndex: task.chapterIndex,
      chapterTitle: task.chapterTitle, totalPages: task.totalPages, downloadedPages: task.downloadedPages, mergedPages: task.mergedPages, status: task.status }
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('download:progress', progress)
  }
})

let initialized: Promise<void> | undefined
function ensureInitialized(): Promise<void> {
  return initialized ??= service.init().catch(error => { initialized = undefined; throw error })
}
export function initPdfDownloads(): void { void ensureInitialized().catch(error => console.error('[pdf] recovery failed', String(error))) }
export async function stopPdfDownloads(): Promise<void> { await service.stop(); await initialized?.catch(() => {}) }
export function resumePdfDownloads(): void { service.resume() }
export function clearStoppedPdfTasks(): Promise<void> { return service.clearStoppedTasks() }
export function registerPdfDownloads(): void {
  ipcMain.handle('download:pdfList', async () => {
    await ensureInitialized()
    return Promise.all((await pdfRepository.list()).map(async task => ({ ...task,
      available: task.status === 'completed' ? await stat(resolvePdfOutput(task.savePath, task.outputFile)).then(info => info.isFile() && info.size > 0, () => false) : undefined })))
  })
  ipcMain.handle('download:pdfAdd', async (_event, request: unknown) => {
    try { await ensureInitialized(); const task = await service.add(request); return { ok: true, taskId: task.id, kind: 'pdf' } }
    catch (error) { return { ok: false, error: String(error) } }
  })
  ipcMain.handle('download:pdfCommand', async (_event, command: string, id: number, deleteFiles = false) => {
    try {
      await ensureInitialized()
      if (!Number.isInteger(id) || id < 1) throw Error('PDF 任务标识无效')
      if (command === 'cancel') await service.cancel(id)
      else if (command === 'retry') await service.retry(id)
      else if (command === 'remove') await service.remove(id, deleteFiles === true)
      else if (command === 'open' || command === 'folder') {
        const task = (await pdfRepository.list()).find(task => task.id === id); if (!task) throw Error('任务不存在')
        const file = resolvePdfOutput(task.savePath, task.outputFile)
        if (command === 'open') {
          if (task.status !== 'completed') throw Error('PDF 尚未生成完成')
          const error = await shell.openPath(file); if (error) throw Error(error)
        } else shell.showItemInFolder(file)
      } else throw Error('未知 PDF 操作')
      return { ok: true }
    } catch (error) { return { ok: false, error: String(error) } }
  })
}
