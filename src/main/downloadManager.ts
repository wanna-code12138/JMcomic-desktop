import { ipcMain, app, BrowserWindow, dialog, shell } from 'electron'
import type { DownloadProgress } from '../shared/downloadContracts'
import type { BindParams, Database as SqlJsDatabase } from 'sql.js'
import { dirname, isAbsolute, join, resolve } from 'path'
import { existsSync } from 'fs'
import { mkdir, readFile, realpath, rename, rm, unlink, writeFile } from 'fs/promises'
import { getDatabase, saveDatabase, scheduleDatabaseSave } from './database'
import { beginIoPerfSpan } from './ioMetrics'
import { loadImages } from './imageLoader'
import { descrambleImage } from './imageDescrambler'
import { imageExtension } from '../shared/imageFormat'
import { waitWithAbort } from '../shared/waitWithAbort'
import { isDownloadDirectoryLeased, leaseDownloadDirectories } from './downloadLeases'
import { getSettings, updateSettings } from './settingsStore'
import { invalidateLocalImageAllowedRoots } from './localImageProtocol'
import { getPublicChapterPages, getPublicMangaDetail } from './contentApi'
import {
  buildStorageRelativePath,
  resolveTaskDirectory,
  inspectChapterFiles,
  groupTasksByManga,
  inspectDownloadedChapter,
  isChapterDirectorySafe,
  normalizeTaskRow,
  pickRetryableTasks,
  toLocalImageUrl,
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
  storageRelpath?: string
  imageUrls: string[]
  createdAt: number
}

const activeDownloads = new Map<number, AbortController>()
const runningTasks = new Map<number, Promise<void>>()
const pendingMutations = new Map<AbortController, Promise<unknown>>()
let downloadQueue: DownloadTask[] = []
let activeCount = 0
let stopping = false
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
    storageRelpath: row.storageRelpath,
    imageUrls: [],
    createdAt: row.createdAt ?? Date.now()
  }
}

async function loadQueueFromDb(): Promise<void> {
  const db = await getDatabase()
  // 上次退出时仍在下载的任务 → 恢复为 pending，等待启动续传
  db.run(`UPDATE downloads SET status = 'pending' WHERE status = 'downloading'`)
  await saveDatabase()

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

function updateTaskInDb(task: DownloadTask): Promise<void> {
  return getDatabase()
    .then((d) => {
      d.run(
        `UPDATE downloads SET status = ?, downloaded_pages = ?, total_pages = ?, error = ? WHERE id = ?`,
        [task.status, task.downloadedPages, task.totalPages, task.error ?? null, task.id]
      )
      scheduleDatabaseSave('download')
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
  while (!stopping && activeCount < concurrency && downloadQueue.length > 0) {
    const pendingTask = downloadQueue.find((t) => t.status === 'pending' && !isDownloadDirectoryLeased(resolveTaskDirectory(t)))
    if (!pendingTask) break

    pendingTask.status = 'downloading'
    updateTaskInDb(pendingTask)
    activeCount++
    sendProgress(progressFor(pendingTask, 'downloading'))

    const running = downloadTask(pendingTask).finally(() => {
      runningTasks.delete(pendingTask.id)
      activeCount--
      void processDownloadQueue()
    })
    runningTasks.set(pendingTask.id, running)
  }
}

/** 任务图片 URL 为空时（重启续传/手动重试），用章节 URL 重新抓取。 */
async function resolveTaskUrls(task: DownloadTask, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  if (task.imageUrls.length > 0) return
  if (!task.chapterUrl) {
    // 旧任务可能没有记录章节地址：尝试从漫画详情页按章节序号找回
    try {
      const detail = await waitWithAbort(getPublicMangaDetail(task.mangaId), signal)
      signal.throwIfAborted()
      const ch = detail.chapters.find((c) => c.index === task.chapterIndex)
      if (ch?.url) {
        const recoveredUrl = ch.url
        task.chapterUrl = recoveredUrl
        await getDatabase().then(async (d) => {
          d.run('UPDATE downloads SET chapter_url = ? WHERE id = ?', [recoveredUrl, task.id])
          await saveDatabase()
        })
        console.log('[download] recovered chapter url for task', task.id, ':', task.chapterUrl)
      }
    } catch (err) {
      signal.throwIfAborted()
      console.warn('[download] recover chapter url failed for task', task.id, ':', err)
    }
  }
  if (!task.chapterUrl) {
    throw new Error('缺少章节地址，无法重新获取图片列表（自动找回章节地址失败）')
  }
  const data = await waitWithAbort(getPublicChapterPages(task.chapterUrl), signal)
  signal.throwIfAborted()
  if (data.pages.length === 0) {
    throw new Error('章节没有可下载的图片')
  }
  task.imageUrls = data.pages.map((p) => p.imageUrl)
  task.totalPages = data.pages.length
  task.scrambleId = data.scrambleId
  await getDatabase().then(async (d) => {
    d.run('UPDATE downloads SET total_pages = ? WHERE id = ?', [task.totalPages, task.id])
    await saveDatabase()
  })
}


async function downloadTask(task: DownloadTask): Promise<void> {
  const controller = new AbortController()
  activeDownloads.set(task.id, controller)
  task.error = ''

  try {
    await resolveTaskUrls(task, controller.signal)
    controller.signal.throwIfAborted()
    task.totalPages = task.imageUrls.length
    if (task.totalPages === 0) throw new Error('章节没有可下载的图片')

    const saveDir = resolveTaskDirectory(task)
    await mkdir(saveDir, { recursive: true })
    console.log('[download] starting task', task.id, 'images:', task.imageUrls.length, 'dir:', saveDir)

    const retries = await getRetries()
    const scan = await inspectChapterFiles(saveDir, task.totalPages)
    const existing = new Map(scan.files.map((file) => [file.index + 1, file.path]))
    const missingIndices: number[] = []
    for (let i = 0; i < task.totalPages; i++) {
      if (!existing.has(i + 1)) missingIndices.push(i)
    }
    task.downloadedPages = task.totalPages - missingIndices.length

    if (missingIndices.length > 0) {
      const results = await loadImages(
        missingIndices.map((i) => task.imageUrls[i]),
        {
          concurrency: PER_TASK_IMAGE_CONCURRENCY,
          maxRetries: retries,
          signal: controller.signal,
          onImage: async (result, index) => {
            controller.signal.throwIfAborted()
            if (!result.buffer && !result.localPath) return
            const rawBytes = result.buffer ?? await readFile(result.localPath!)
            const scrambled = Boolean(task.scrambleId && task.scrambleId > 0)
            const finalBytes = scrambled
              ? await descrambleImage(rawBytes, task.scrambleId!, result.url)
              : rawBytes
            controller.signal.throwIfAborted()
            if (finalBytes.length === 0) throw new Error('图片内容为空')
            const pageIndex = missingIndices[index]
            const ext = imageExtension(finalBytes)
            const dest = join(saveDir, `${String(pageIndex + 1).padStart(4, '0')}.${ext}`)
            const temporary = `${dest}.${task.id}.part`
            try {
              await writeFile(temporary, finalBytes, { signal: controller.signal })
              controller.signal.throwIfAborted()
              await rename(temporary, dest)
            } finally {
              await unlink(temporary).catch(() => {})
            }
            task.downloadedPages++
            await updateTaskInDb(task)
            sendProgress(progressFor(task, 'downloading'))
          }
        }
      )
      controller.signal.throwIfAborted()
      const failures = results.filter((result) => result.error)
      if (failures.length > 0 || task.downloadedPages !== task.totalPages) {
        throw new Error(`图片下载失败：已保存 ${task.downloadedPages}/${task.totalPages} 页${failures[0]?.error ? `，${failures[0].error}` : ''}`)
      }
    }

    controller.signal.throwIfAborted()
    task.status = 'completed'
    task.downloadedPages = task.totalPages
    await updateTaskInDb(task)
    sendProgress(progressFor(task, 'completed'))
    console.log('[download] task', task.id, 'completed')
  } catch (err) {
    if (controller.signal.aborted) {
      task.status = stopping ? 'pending' : 'cancelled'
      task.error = stopping ? '' : '已取消'
    } else {
      task.status = 'failed'
      task.error = err instanceof Error ? err.message : String(err)
      console.error('[download] task', task.id, 'failed:', task.error)
    }
    await updateTaskInDb(task)
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

async function addAvailability(rows: DownloadTaskRow[]): Promise<DownloadTaskRow[]> {
  const result: DownloadTaskRow[] = []
  for (let index = 0; index < rows.length; index += 8) {
    result.push(...await Promise.all(rows.slice(index, index + 8).map(async (row) => {
      const availability = await inspectDownloadedChapter(row)
      return { ...row, available: availability.available, availabilityReason: availability.reason }
    })))
  }
  return result
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
  const dir = resolveTaskDirectory(task)
  if (!isChapterDirectorySafe(savePath, dir) || !existsSync(dir)) return false
  const database = await getDatabase()
  const references = execRows(database, 'SELECT * FROM downloads WHERE id <> ?', [task.id])
  if (references.some((row) => { try { return resolveTaskDirectory(row).toLowerCase() === dir.toLowerCase() } catch { return false } })) return false
  // Resolve junctions/symlinks as well as lexical traversal before deleting anything.
  const [actualRoot, actualDir] = await Promise.all([realpath(savePath), realpath(dir)])
  if (!isChapterDirectorySafe(actualRoot, actualDir)) return false
  await rm(dir, { recursive: true, force: true })
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
  if (stopping) return { ok: false, taskId: 0, error: '程序正在保存并关闭，请稍后重试' }
  const db = await getDatabase()
  const savePath = data.savePath ?? await getDownloadDir()
  if (stopping) return { ok: false, taskId: 0, error: '程序正在保存并关闭，请稍后重试' }
  const storageRelpath = buildStorageRelativePath(data.mangaId, data.chapterUrl, data.chapterIndex)
  if (isDownloadDirectoryLeased(resolve(savePath, storageRelpath))) return { ok: false, taskId: 0, error: '章节正在导出，请稍后重试' }
  const matching = execRows(db, 'SELECT * FROM downloads WHERE manga_id = ? AND chapter_index = ? ORDER BY id DESC', [data.mangaId, data.chapterIndex])
    .find(row => resolve(row.savePath) === resolve(savePath) && (row.status === 'pending' || row.status === 'downloading'))
  if (matching) return { ok: true, taskId: matching.id }

  db.run(
    `INSERT INTO downloads
       (manga_id, manga_title, chapter_index, chapter_title, chapter_url, cover_url,
        status, total_pages, save_path, storage_relpath)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [
      data.mangaId, data.mangaTitle, data.chapterIndex, data.chapterTitle,
      data.chapterUrl ?? null, data.coverUrl ?? null,
      data.imageUrls.length, savePath, storageRelpath
    ]
  )

  const idResult = db.exec('SELECT last_insert_rowid()')
  const taskId = Number(idResult[0].values[0][0])
  await saveDatabase()
  invalidateLocalImageAllowedRoots()

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
    storageRelpath,
    imageUrls: data.imageUrls,
    createdAt: Date.now()
  }

  downloadQueue.push(task)
  void processDownloadQueue()

  return { ok: true, taskId }
}

// ─── IPC handlers ─────────────────────────────────────────────────

function handleMutation<T extends unknown[]>(channel: string, handler: (signal: AbortSignal, ...args: T) => Promise<unknown>): void {
  ipcMain.handle(channel, (_event, ...args: T) => {
    if (stopping) return { ok: false, error: '程序正在保存并关闭，请稍后重试' }
    const controller = new AbortController()
    const operation = handler(controller.signal, ...args).finally(() => pendingMutations.delete(controller))
    pendingMutations.set(controller, operation)
    return operation
  })
}

handleMutation('download:add', async (_signal, data: AddDownloadData) => {
  return enqueueDownload(data)
})

/**
 * 批量添加整本/多章下载：由主进程逐个抓取章节图片并入队，
 * 渲染进程不阻塞，进度通过 download:addStatus 事件推送到顶部栏。
 */
handleMutation('download:addChapters', async (signal, data: {
  mangaId: string
  mangaTitle: string
  coverUrl?: string
  chapters: Array<{ index: number; title: string; url: string }>
}) => {
  const total = data.chapters.length
  let added = 0
  const results: Array<{ index: number; ok: boolean; taskId?: number; error?: string }> = []

  for (let i = 0; i < total; i++) {
    if (signal.aborted) break
    const ch = data.chapters[i]
    sendAddStatus({
      mangaId: data.mangaId,
      current: i + 1,
      total,
      chapterTitle: ch.title,
      stage: 'fetching'
    })
    try {
      const pagesResult = await waitWithAbort(getPublicChapterPages(ch.url), signal)
      signal.throwIfAborted()
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
  return { ok: !signal.aborted, added, total, results }
})

ipcMain.handle('download:list', async () => {
  const db = await getDatabase()
  return addAvailability(execRows(db, 'SELECT * FROM downloads ORDER BY created_at DESC'))
})

ipcMain.handle('download:summary', async () => {
  const db = await getDatabase()
  const rows = execRows(db, 'SELECT * FROM downloads ORDER BY created_at DESC')
  return groupTasksByManga(await addAvailability(rows))
})

ipcMain.handle('download:mangaDetail', async (_event, mangaId: string) => {
  const db = await getDatabase()
  const rows = execRows(
    db,
    'SELECT * FROM downloads WHERE manga_id = ? ORDER BY created_at DESC',
    [mangaId]
  )
  return groupTasksByManga(await addAvailability(rows))[0] ?? null
})

handleMutation('download:cancel', async (_signal, taskId: number) => {
  const controller = activeDownloads.get(taskId)
  if (controller) {
    controller.abort()
  } else {
    const task = downloadQueue.find((t) => t.id === taskId)
    if (task && task.status === 'pending') {
      task.status = 'cancelled'
      await updateTaskInDb(task)
      sendProgress(progressFor(task, 'cancelled'))
    }
  }
  return { ok: true }
})

handleMutation('download:retry', async (signal, taskId: number) => {
  const row = await findTaskRow(taskId)
  if (!row) return { ok: false, error: '任务不存在' }
  if (isDownloadDirectoryLeased(resolveTaskDirectory(row))) return { ok: false, error: '章节正在导出，请稍后重试' }
  if (row.status === 'downloading') {
    return { ok: false, error: '任务正在下载中' }
  }
  if (row.status === 'pending' && downloadQueue.some((t) => t.id === taskId)) {
    return { ok: false, error: '任务已在队列中' }
  }

  const db = await getDatabase()
  signal.throwIfAborted()
  db.run(
    `UPDATE downloads SET status = 'pending', downloaded_pages = 0, error = NULL WHERE id = ?`,
    [taskId]
  )
  await saveDatabase()

  removeFromQueue(taskId)
  const task = rowToTask({ ...row, status: 'pending', downloadedPages: 0, error: undefined })
  downloadQueue.push(task)
  void processDownloadQueue()
  return { ok: true }
})

/** 一键重试全部失败/已取消任务，返回实际重新入队的数量。 */
handleMutation('download:retryFailed', async (signal) => {
  const db = await getDatabase()
  signal.throwIfAborted()
  const rows = execRows(
    db,
    `SELECT * FROM downloads WHERE status IN ('failed', 'cancelled') ORDER BY created_at`
  )
  const queuedIds = new Set(
    downloadQueue
      .filter((t) => t.status === 'pending' || t.status === 'downloading')
      .map((t) => t.id)
  )
  const targets = pickRetryableTasks(rows).filter((t) => !queuedIds.has(t.id) && !isDownloadDirectoryLeased(resolveTaskDirectory(t)))

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
  await saveDatabase()
  void processDownloadQueue()
  return { ok: true, retried }
})

handleMutation('download:remove', async (_signal, taskId: number, deleteFiles: boolean) => {
  const row = await findTaskRow(taskId)
  if (!row) return { ok: false, error: '任务不存在' }
  if (isDownloadDirectoryLeased(resolveTaskDirectory(row))) return { ok: false, error: '章节正在导出，请稍后重试' }

  const release = leaseDownloadDirectories([resolveTaskDirectory(row)])
  try {
    const controller = activeDownloads.get(taskId)
    if (controller) controller.abort()
    removeFromQueue(taskId)
    await runningTasks.get(taskId)

    const db = await getDatabase()
    db.run('DELETE FROM downloads WHERE id = ?', [taskId])
    await saveDatabase()

    const filesRemoved = deleteFiles ? await deleteTaskFiles(row) : false
    return { ok: true, filesRemoved }
  } finally { release() }
})

handleMutation('download:removeManga', async (_signal, mangaId: string, deleteFiles: boolean) => {
  const db = await getDatabase()
  const rows = execRows(db, 'SELECT * FROM downloads WHERE manga_id = ?', [mangaId])
  if (rows.length === 0) return { ok: false, error: '没有该漫画的下载记录' }
  if (rows.some(row => isDownloadDirectoryLeased(resolveTaskDirectory(row)))) return { ok: false, error: '章节正在导出，请稍后重试' }

  const release = leaseDownloadDirectories(rows.map(resolveTaskDirectory))
  try {
    let filesRemoved = 0
    for (const row of rows) {
      const controller = activeDownloads.get(row.id)
      if (controller) controller.abort()
      removeFromQueue(row.id)
      await runningTasks.get(row.id)
      db.run('DELETE FROM downloads WHERE id = ?', [row.id])
      if (deleteFiles && await deleteTaskFiles(row)) filesRemoved++
    }
    await saveDatabase()
    return { ok: true, filesRemoved }
  } finally { release() }
})

ipcMain.handle('download:openTaskFolder', async (_event, taskId: number) => {
  const row = await findTaskRow(taskId)
  if (!row) return { ok: false, error: '任务不存在' }
  const root = row.savePath || app.getPath('downloads')
  const dir = resolveTaskDirectory(row)
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
  const mangaDir = dirname(resolveTaskDirectory(row))
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

  const scan = await inspectChapterFiles(resolveTaskDirectory(row), row.totalPages)
  if (!scan.available) return { ok: false, error: `章节文件不完整，请在下载页修复缺失页（缺少 ${scan.missingIndices.length} 页）` }
  const pages = scan.files.map(file => ({ index: file.index, imageUrl: toLocalImageUrl(file.path) }))
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

handleMutation('download:setConcurrency', async (_signal, concurrency: number) => {
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

export async function stopDownloadManager(): Promise<void> {
  stopping = true
  for (const controller of pendingMutations.keys()) controller.abort()
  for (const controller of activeDownloads.values()) controller.abort()
  await Promise.allSettled([...pendingMutations.values()])
  await Promise.all([...runningTasks.values()])
  await saveDatabase()
}

export function resumeDownloadManager(): void {
  stopping = false
  void processDownloadQueue()
}

export function clearStoppedDownloadQueue(): void {
  if (!stopping || runningTasks.size || pendingMutations.size) throw new Error('请先停止下载任务')
  downloadQueue = []
}
