import { ipcMain, app, BrowserWindow, dialog, shell } from 'electron'
import type { BindParams, Database as SqlJsDatabase } from 'sql.js'
import { isAbsolute, join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync } from 'fs'
import { getDatabase, saveDatabase } from './database'
import { loadImages } from './imageLoader'
import { descrambleImage } from './imageDescrambler'
import { getSettings, updateSettings } from './settingsStore'
import { extractChapterPages, extractMangaDetail } from './scraperWindow'
import {
  buildChapterSaveDir,
  groupTasksByManga,
  inspectDownloadedChapter,
  normalizeTaskRow,
  pickRetryableTasks,
  resolveLocalChapterPages,
  sanitizeFileName,
  type DownloadTaskRow
} from './downloadCore'

type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled'

interface DownloadTask {
  id: number
  mangaId: string
  mangaTitle: string
  chapterIndex: number
  chapterTitle: string
  chapterUrl?: string
  coverUrl?: string
  error?: string
  scrambleId?: number
  status: DownloadStatus
  totalPages: number
  downloadedPages: number
  savePath: string
  imageUrls: string[]
  createdAt: number
}

interface DownloadProgress {
  taskId: number
  mangaId: string
  mangaTitle: string
  chapterIndex: number
  chapterTitle: string
  totalPages: number
  downloadedPages: number
  status: DownloadStatus
}

const activeDownloads = new Map<number, AbortController>()
let downloadQueue: DownloadTask[] = []
let activeCount = 0
const PER_TASK_IMAGE_CONCURRENCY = 4

async function getDownloadDir(): Promise<string> {
  const settings = await getSettings()
  return settings.downloadDir
}

async function getConcurrency(): Promise<number> {
  const settings = await getSettings()
  return settings.downloadConcurrency
}

async function getRetries(): Promise<number> {
  const settings = await getSettings()
  return settings.downloadRetries
}

function rowToTask(row: DownloadTaskRow): DownloadTask {
  return {
    id: row.id,
    mangaId: row.mangaId,
    mangaTitle: row.mangaTitle ?? '',
    chapterIndex: row.chapterIndex,
    chapterTitle: row.chapterTitle ?? '',
    chapterUrl: row.chapterUrl ?? undefined,
    coverUrl: row.coverUrl ?? undefined,
    error: row.error ?? undefined,
    status: row.status as DownloadStatus,
    totalPages: row.totalPages ?? 0,
    downloadedPages: row.downloadedPages ?? 0,
    savePath: row.savePath ?? app.getPath('downloads'),
    imageUrls: [],
    createdAt: row.createdAt ?? Date.now()
  }
}

async function loadQueueFromDb(): Promise<void> {
  const db = await getDatabase()
  // 上次退出时仍在下载的任务 → 恢复为 pending，等待启动续传
  db.run(`UPDATE downloads SET status = 'pending' WHERE status = 'downloading'`)
  saveDatabase()

  const settings = await getSettings()
  if (!settings.downloadResumeOnStartup) return

  const results = db.exec(
    `SELECT * FROM downloads WHERE status = 'pending' ORDER BY created_at`
  )
  if (results.length === 0) return
  const { columns } = results[0]
  downloadQueue = results[0].values.map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((c, i) => { obj[c] = row[i] })
    return rowToTask(normalizeTaskRow(obj))
  })

  void processDownloadQueue()
}

function updateTaskInDb(task: DownloadTask): void {
  getDatabase()
    .then((d) => {
      d.run(
        `UPDATE downloads SET status = ?, downloaded_pages = ?, total_pages = ?, error = ? WHERE id = ?`,
        [task.status, task.downloadedPages, task.totalPages, task.error ?? null, task.id]
      )
      saveDatabase()
    })
    .catch((err) => {
      console.error('[download] updateTaskInDb failed for task', task.id, ':', err)
    })
}

function sendProgress(progress: DownloadProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('download:progress', progress)
      }
    } catch {
      /* 窗口可能正在销毁，忽略 */
    }
  }
}

interface AddStatusPayload {
  mangaId: string
  current: number
  total: number
  chapterTitle: string
  stage: 'fetching' | 'done' | 'error'
  error?: string
}

function sendAddStatus(payload: AddStatusPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('download:addStatus', payload)
      }
    } catch {
      /* 忽略 */
    }
  }
}

function progressFor(task: DownloadTask, status: DownloadStatus): DownloadProgress {
  return {
    taskId: task.id,
    mangaId: task.mangaId,
    mangaTitle: task.mangaTitle,
    chapterIndex: task.chapterIndex,
    chapterTitle: task.chapterTitle,
    totalPages: task.totalPages,
    downloadedPages: task.downloadedPages,
    status
  }
}

async function processDownloadQueue(): Promise<void> {
  const concurrency = await getConcurrency()
  while (activeCount < concurrency && downloadQueue.length > 0) {
    const pendingTask = downloadQueue.find((t) => t.status === 'pending')
    if (!pendingTask) break

    pendingTask.status = 'downloading'
    updateTaskInDb(pendingTask)
    activeCount++
    sendProgress(progressFor(pendingTask, 'downloading'))

    void downloadTask(pendingTask).finally(() => {
      activeCount--
      void processDownloadQueue()
    })
  }
}

/** 任务图片 URL 为空时（重启续传/手动重试），用章节 URL 重新抓取。 */
async function resolveTaskUrls(task: DownloadTask): Promise<void> {
  if (task.imageUrls.length > 0) return
  if (!task.chapterUrl) {
    // 旧任务可能没有记录章节地址：尝试从漫画详情页按章节序号找回
    try {
      const detail = await extractMangaDetail(task.mangaId)
      const ch = detail.chapters.find((c) => c.index === task.chapterIndex)
      if (ch?.url) {
        const recoveredUrl = ch.url
        task.chapterUrl = recoveredUrl
        getDatabase().then((d) => {
          d.run('UPDATE downloads SET chapter_url = ? WHERE id = ?', [recoveredUrl, task.id])
          saveDatabase()
        })
        console.log('[download] recovered chapter url for task', task.id, ':', task.chapterUrl)
      }
    } catch (err) {
      console.warn('[download] recover chapter url failed for task', task.id, ':', err)
    }
  }
  if (!task.chapterUrl) {
    throw new Error('缺少章节地址，无法重新获取图片列表（自动找回章节地址失败）')
  }
  const data = await extractChapterPages(task.chapterUrl)
  if (data.pages.length === 0) {
    throw new Error('章节没有可下载的图片')
  }
  task.imageUrls = data.pages.map((p) => p.imageUrl)
  task.totalPages = data.pages.length
  task.scrambleId = data.scrambleId
  getDatabase().then((d) => {
    d.run('UPDATE downloads SET total_pages = ? WHERE id = ?', [task.totalPages, task.id])
    saveDatabase()
  })
}

function existingPages(saveDir: string): Map<number, string> {
  const found = new Map<number, string>()
  if (!existsSync(saveDir)) return found
  for (const name of readdirSync(saveDir)) {
    const match = name.match(/^(\d+)\.(jpg|jpeg|png|webp|gif|bmp)$/i)
    if (!match) continue
    try {
      if (statSync(join(saveDir, name)).size > 0) {
        found.set(Number(match[1]), join(saveDir, name))
      }
    } catch {
      /* 忽略读取失败 */
    }
  }
  return found
}

async function downloadTask(task: DownloadTask): Promise<void> {
  const controller = new AbortController()
  activeDownloads.set(task.id, controller)
  task.error = ''

  try {
    await resolveTaskUrls(task)

    const saveDir = buildChapterSaveDir(task.savePath, task.mangaTitle, task.chapterTitle, task.chapterIndex)
    mkdirSync(saveDir, { recursive: true })
    console.log('[download] starting task', task.id, 'images:', task.imageUrls.length, 'dir:', saveDir)

    const retries = await getRetries()
    const existing = existingPages(saveDir)
    const missingIndices: number[] = []
    for (let i = 0; i < task.totalPages; i++) {
      if (!existing.has(i + 1)) missingIndices.push(i)
    }

    if (missingIndices.length === 0) {
      task.downloadedPages = task.totalPages
    } else {
      const results = await loadImages(
        missingIndices.map((i) => task.imageUrls[i]),
        {
          concurrency: PER_TASK_IMAGE_CONCURRENCY,
          maxRetries: retries
        }
      )

      for (let k = 0; k < missingIndices.length; k++) {
        const result = results[k]
        if (result.localPath && existsSync(result.localPath)) {
          const pageIndex = missingIndices[k]
          const ext = result.url.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[1] ?? 'jpg'
          const dest = join(saveDir, `${String(pageIndex + 1).padStart(4, '0')}.${ext}`)
          if (!existsSync(dest)) {
            const rawBytes = readFileSync(result.localPath)
            let finalBytes: Buffer = rawBytes
            if (task.scrambleId && task.scrambleId > 0) {
              try {
                finalBytes = await descrambleImage(
                  Buffer.from(Uint8Array.from(rawBytes)),
                  task.scrambleId,
                  result.url
                )
                console.log('[download] descrambled image', pageIndex + 1)
              } catch (err) {
                console.warn('[download] descramble failed for image', pageIndex + 1, ':', err)
                finalBytes = rawBytes
              }
            }
            // Uint8Array.from 复制到新的 ArrayBuffer，规避新版 @types/node 的
            // NonSharedBuffer 类型限制
            writeFileSync(dest, Buffer.from(Uint8Array.from(finalBytes)))
          }
          task.downloadedPages = Math.max(task.downloadedPages, pageIndex + 1)
          sendProgress(progressFor(task, 'downloading'))
        } else {
          console.warn('[download] image', missingIndices[k], 'failed:', result.error)
        }

    if (controller.signal.aborted) {
      task.status = 'cancelled'
      task.error = '已取消'
      updateTaskInDb(task)
      sendProgress(progressFor(task, 'cancelled'))
      return
        }
      }
    }

    task.status = 'completed'
    task.downloadedPages = task.totalPages
    updateTaskInDb(task)
    sendProgress(progressFor(task, 'completed'))
    console.log('[download] task', task.id, 'completed')
  } catch (err) {
    if (controller.signal.aborted) {
      task.status = 'cancelled'
      task.error = '已取消'
    } else {
      task.status = 'failed'
      task.error = err instanceof Error ? err.message : String(err)
      console.error('[download] task', task.id, 'failed:', task.error)
    }
    updateTaskInDb(task)
    sendProgress(progressFor(task, task.status))
  } finally {
    activeDownloads.delete(task.id)
  }
}

function removeFromQueue(taskId: number): void {
  downloadQueue = downloadQueue.filter((t) => t.id !== taskId)
}

function execRows(db: SqlJsDatabase, sql: string, params?: unknown[]): DownloadTaskRow[] {
  const results = params ? db.exec(sql, params as BindParams) : db.exec(sql)
  if (results.length === 0) return []
  const { columns } = results[0]
  return results[0].values.map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((c, i) => { obj[c] = row[i] })
    return normalizeTaskRow(obj)
  })
}

function addAvailability(rows: DownloadTaskRow[]): DownloadTaskRow[] {
  return rows.map((row) => {
    const availability = inspectDownloadedChapter(row)
    return {
      ...row,
      available: availability.available,
      availabilityReason: availability.reason
    }
  })
}

async function findTaskRow(taskId: number): Promise<DownloadTaskRow | null> {
  const db = await getDatabase()
  const stmt = db.prepare('SELECT * FROM downloads WHERE id = ?')
  stmt.bind([taskId])
  let row: DownloadTaskRow | null = null
  if (stmt.step()) row = normalizeTaskRow(stmt.getAsObject() as unknown as Record<string, unknown>)
  stmt.free()
  return row
}

async function deleteTaskFiles(task: DownloadTaskRow): Promise<boolean> {
  const { savePath, mangaTitle, chapterTitle } = task
  if (!savePath || !isAbsolute(savePath) || !mangaTitle || !chapterTitle) return false
  const dir = buildChapterSaveDir(savePath, mangaTitle, chapterTitle, task.chapterIndex)
  // 安全校验：目标必须精确等于 <保存根>/<漫画>/<章节>，且位于保存根之下
  const expectedRoot = join(savePath, sanitizeFileName(mangaTitle), sanitizeFileName(chapterTitle))
  if (dir !== expectedRoot || !isAbsolute(dir) || !existsSync(dir)) return false
  rmSync(dir, { recursive: true, force: true })
  return true
}

interface AddDownloadData {
  mangaId: string
  mangaTitle: string
  chapterIndex: number
  chapterTitle: string
  chapterUrl?: string
  coverUrl?: string
  imageUrls: string[]
  savePath?: string
  scrambleId?: number
}

async function enqueueDownload(data: AddDownloadData): Promise<{ ok: boolean; taskId: number; error?: string }> {
  const db = await getDatabase()
  const savePath = data.savePath ?? await getDownloadDir()

  db.run(
    `INSERT INTO downloads
       (manga_id, manga_title, chapter_index, chapter_title, chapter_url, cover_url,
        status, total_pages, save_path)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      data.mangaId, data.mangaTitle, data.chapterIndex, data.chapterTitle,
      data.chapterUrl ?? null, data.coverUrl ?? null,
      data.imageUrls.length, savePath
    ]
  )

  const idResult = db.exec('SELECT last_insert_rowid()')
  const taskId = Number(idResult[0].values[0][0])
  saveDatabase()

  const task: DownloadTask = {
    id: taskId,
    mangaId: data.mangaId,
    mangaTitle: data.mangaTitle,
    chapterIndex: data.chapterIndex,
    chapterTitle: data.chapterTitle,
    chapterUrl: data.chapterUrl,
    coverUrl: data.coverUrl,
    scrambleId: data.scrambleId,
    status: 'pending',
    totalPages: data.imageUrls.length,
    downloadedPages: 0,
    savePath,
    imageUrls: data.imageUrls,
    createdAt: Date.now()
  }

  downloadQueue.push(task)
  void processDownloadQueue()

  return { ok: true, taskId }
}

// ─── IPC handlers ─────────────────────────────────────────────────

ipcMain.handle('download:add', async (_event, data: AddDownloadData) => {
  return enqueueDownload(data)
})

/**
 * 批量添加整本/多章下载：由主进程逐个抓取章节图片并入队，
 * 渲染进程不阻塞，进度通过 download:addStatus 事件推送到顶部栏。
 */
ipcMain.handle('download:addChapters', async (_event, data: {
  mangaId: string
  mangaTitle: string
  coverUrl?: string
  chapters: Array<{ index: number; title: string; url: string }>
}) => {
  const total = data.chapters.length
  let added = 0
  const results: Array<{ index: number; ok: boolean; taskId?: number; error?: string }> = []

  for (let i = 0; i < total; i++) {
    const ch = data.chapters[i]
    sendAddStatus({
      mangaId: data.mangaId,
      current: i + 1,
      total,
      chapterTitle: ch.title,
      stage: 'fetching'
    })
    try {
      const pagesResult = await extractChapterPages(ch.url)
      if (pagesResult.pages.length === 0) {
        throw new Error('章节没有可下载的图片')
      }
      const res = await enqueueDownload({
        mangaId: data.mangaId,
        mangaTitle: data.mangaTitle,
        chapterIndex: ch.index,
        chapterTitle: ch.title,
        chapterUrl: ch.url,
        coverUrl: data.coverUrl,
        imageUrls: pagesResult.pages.map((p) => p.imageUrl),
        scrambleId: pagesResult.scrambleId
      })
      results.push({ index: ch.index, ok: res.ok, taskId: res.taskId })
      if (res.ok) added++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ index: ch.index, ok: false, error: message })
      sendAddStatus({
        mangaId: data.mangaId,
        current: i + 1,
        total,
        chapterTitle: ch.title,
        stage: 'error',
        error: message
      })
    }
  }

  sendAddStatus({ mangaId: data.mangaId, current: total, total, chapterTitle: '', stage: 'done' })
  return { ok: true, added, total, results }
})

ipcMain.handle('download:list', async () => {
  const db = await getDatabase()
  return addAvailability(execRows(db, 'SELECT * FROM downloads ORDER BY created_at DESC'))
})

ipcMain.handle('download:summary', async () => {
  const db = await getDatabase()
  const rows = execRows(db, 'SELECT * FROM downloads ORDER BY created_at DESC')
  return groupTasksByManga(addAvailability(rows))
})

ipcMain.handle('download:mangaDetail', async (_event, mangaId: string) => {
  const db = await getDatabase()
  const rows = execRows(
    db,
    'SELECT * FROM downloads WHERE manga_id = ? ORDER BY created_at DESC',
    [mangaId]
  )
  return groupTasksByManga(addAvailability(rows))[0] ?? null
})

ipcMain.handle('download:cancel', async (_event, taskId: number) => {
  const controller = activeDownloads.get(taskId)
  if (controller) {
    controller.abort()
  } else {
    const task = downloadQueue.find((t) => t.id === taskId)
    if (task && task.status === 'pending') {
      task.status = 'cancelled'
      updateTaskInDb(task)
      sendProgress(progressFor(task, 'cancelled'))
    }
  }
  return { ok: true }
})

ipcMain.handle('download:retry', async (_event, taskId: number) => {
  const row = await findTaskRow(taskId)
  if (!row) return { ok: false, error: '任务不存在' }
  if (row.status === 'downloading') {
    return { ok: false, error: '任务正在下载中' }
  }
  if (row.status === 'pending' && downloadQueue.some((t) => t.id === taskId)) {
    return { ok: false, error: '任务已在队列中' }
  }

  const db = await getDatabase()
  db.run(
    `UPDATE downloads SET status = 'pending', downloaded_pages = 0, error = NULL WHERE id = ?`,
    [taskId]
  )
  saveDatabase()

  removeFromQueue(taskId)
  const task = rowToTask({ ...row, status: 'pending', downloadedPages: 0, error: undefined })
  downloadQueue.push(task)
  void processDownloadQueue()
  return { ok: true }
})

/** 一键重试全部失败/已取消任务，返回实际重新入队的数量。 */
ipcMain.handle('download:retryFailed', async () => {
  const db = await getDatabase()
  const rows = execRows(
    db,
    `SELECT * FROM downloads WHERE status IN ('failed', 'cancelled') ORDER BY created_at`
  )
  const queuedIds = new Set(
    downloadQueue
      .filter((t) => t.status === 'pending' || t.status === 'downloading')
      .map((t) => t.id)
  )
  const targets = pickRetryableTasks(rows).filter((t) => !queuedIds.has(t.id))

  let retried = 0
  for (const row of targets) {
    db.run(
      `UPDATE downloads SET status = 'pending', downloaded_pages = 0, error = NULL WHERE id = ?`,
      [row.id]
    )
    removeFromQueue(row.id)
    downloadQueue.push(rowToTask({ ...row, status: 'pending', downloadedPages: 0, error: undefined }))
    retried++
  }
  saveDatabase()
  void processDownloadQueue()
  return { ok: true, retried }
})

ipcMain.handle('download:remove', async (_event, taskId: number, deleteFiles: boolean) => {
  const row = await findTaskRow(taskId)
  if (!row) return { ok: false, error: '任务不存在' }

  const controller = activeDownloads.get(taskId)
  if (controller) controller.abort()
  removeFromQueue(taskId)

  const db = await getDatabase()
  db.run('DELETE FROM downloads WHERE id = ?', [taskId])
  saveDatabase()

  const filesRemoved = deleteFiles ? await deleteTaskFiles(row) : false
  return { ok: true, filesRemoved }
})

ipcMain.handle('download:removeManga', async (_event, mangaId: string, deleteFiles: boolean) => {
  const db = await getDatabase()
  const rows = execRows(db, 'SELECT * FROM downloads WHERE manga_id = ?', [mangaId])
  if (rows.length === 0) return { ok: false, error: '没有该漫画的下载记录' }

  let filesRemoved = 0
  for (const row of rows) {
    const controller = activeDownloads.get(row.id)
    if (controller) controller.abort()
    removeFromQueue(row.id)
    db.run('DELETE FROM downloads WHERE id = ?', [row.id])
    if (deleteFiles && await deleteTaskFiles(row)) filesRemoved++
  }
  saveDatabase()
  return { ok: true, filesRemoved }
})

ipcMain.handle('download:openTaskFolder', async (_event, taskId: number) => {
  const row = await findTaskRow(taskId)
  if (!row) return { ok: false, error: '任务不存在' }
  const root = row.savePath || app.getPath('downloads')
  const dir = buildChapterSaveDir(
    root,
    row.mangaTitle ?? '',
    row.chapterTitle ?? '',
    row.chapterIndex
  )
  const target = existsSync(dir) ? dir : root
  if (!target || !isAbsolute(target)) {
    return { ok: false, error: '下载目录无效' }
  }
  const err = await shell.openPath(target)
  return err ? { ok: false, error: err } : { ok: true }
})

ipcMain.handle('download:openMangaFolder', async (_event, mangaId: string) => {
  const db = await getDatabase()
  const results = db.exec(
    `SELECT * FROM downloads WHERE manga_id = ? AND status = 'completed' ORDER BY id DESC LIMIT 1`,
    [mangaId]
  )
  if (results.length === 0 || results[0].values.length === 0) {
    return { ok: false, error: '没有已完成的下载' }
  }
  const { columns } = results[0]
  const obj: Record<string, unknown> = {}
  columns.forEach((c, i) => { obj[c] = results[0].values[0][i] })
  const row = normalizeTaskRow(obj)
  const root = row.savePath || app.getPath('downloads')
  const mangaDir = join(root, sanitizeFileName(row.mangaTitle ?? ''))
  const target = existsSync(mangaDir) ? mangaDir : root
  if (!target || !isAbsolute(target)) {
    return { ok: false, error: '下载目录无效' }
  }
  const err = await shell.openPath(target)
  return err ? { ok: false, error: err } : { ok: true }
})

ipcMain.handle('download:chapterPages', async (_event, mangaId: string, chapterIndex: number) => {
  const db = await getDatabase()
  const stmt = db.prepare(
    `SELECT * FROM downloads WHERE manga_id = ? AND chapter_index = ?
     ORDER BY (status = 'completed') DESC, id DESC LIMIT 1`
  )
  stmt.bind([mangaId, chapterIndex])
  let row: DownloadTaskRow | null = null
  if (stmt.step()) row = normalizeTaskRow(stmt.getAsObject() as unknown as Record<string, unknown>)
  stmt.free()
  if (!row) return { ok: false, error: '本地没有该章节' }

  const root = row.savePath || app.getPath('downloads')
  const saveDir = buildChapterSaveDir(
    root,
    row.mangaTitle ?? '',
    row.chapterTitle ?? '',
    row.chapterIndex
  )
  const pages = resolveLocalChapterPages(saveDir)
  if (pages.length === 0) {
    return { ok: false, error: '章节目录中没有图片文件' }
  }
  return {
    ok: true,
    data: pages,
    scrambleId: 0,
    chapterUrl: row.chapterUrl ?? '',
    mangaTitle: row.mangaTitle ?? '',
    chapterTitle: row.chapterTitle ?? ''
  }
})

ipcMain.handle('download:chooseDir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '选择下载目录',
    properties: ['openDirectory', 'createDirectory']
  })
  if (canceled || !filePaths[0]) return { canceled: true }
  return { canceled: false, path: filePaths[0] }
})

ipcMain.handle('download:setConcurrency', async (_event, concurrency: number) => {
  const settings = await updateSettings({ downloadConcurrency: concurrency })
  return settings.downloadConcurrency
})

/**
 * 恢复上次未完成任务（是否自动续传由设置决定）。
 * 必须在 app ready 之后调用——续传任务需要重新抓取章节图片，
 * 提前调用会在 app ready 前创建 BrowserWindow 导致全部失败。
 */
export function initDownloadManager(): void {
  void loadQueueFromDb()
}
