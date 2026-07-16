import { ipcMain, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { getDatabase, saveDatabase } from './database'
import { loadImages } from './imageLoader'
import { getActiveDomain } from './networkProbe'
import { descrambleImage } from './imageDescrambler'

interface DownloadTask {
  id: number
  mangaId: string
  mangaTitle: string
  chapterIndex: number
  chapterTitle: string
  scrambleId?: number
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  totalPages: number
  downloadedPages: number
  savePath: string
  imageUrls: string[]
  createdAt: number
}

interface DownloadProgress {
  taskId: number
  totalPages: number
  downloadedPages: number
  status: string
}

const activeDownloads = new Map<number, AbortController>()
let downloadQueue: DownloadTask[] = []
let currentConcurrency = 4

async function loadQueueFromDb(): Promise<void> {
  const db = await getDatabase()
  const results = db.exec(`SELECT * FROM downloads WHERE status IN ('pending', 'downloading') ORDER BY created_at`)
  if (results.length === 0) return

  const rows = results[0].values.map((row) => ({
    id: row[0] as number,
    mangaId: row[1] as string,
    mangaTitle: (row[2] as string) ?? '',
    chapterIndex: row[3] as number,
    chapterTitle: (row[4] as string) ?? '',
    status: row[5] as string,
    totalPages: row[6] as number,
    downloadedPages: row[7] as number,
    savePath: (row[8] as string) ?? app.getPath('downloads'),
    imageUrls: [] as string[],
    createdAt: (row[9] as number) ?? Date.now()
  }))

  downloadQueue = rows as DownloadTask[]
}

function updateTaskInDb(task: DownloadTask): void {
  getDatabase().then((d) => {
    d.run(
      `UPDATE downloads SET status = ?, downloaded_pages = ?, total_pages = ? WHERE id = ?`,
      [task.status, task.downloadedPages, task.totalPages, task.id]
    )
    saveDatabase()
  })
}

function sendProgress(progress: DownloadProgress): void {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) {
    wins[0].webContents.send('download:progress', progress)
  }
}

async function processDownloadQueue(): Promise<void> {
  let active = 0

  async function processNext(): Promise<void> {
    while (active < currentConcurrency && downloadQueue.length > 0) {
      const pendingTask = downloadQueue.find((t) => t.status === 'pending')
      if (!pendingTask) break

      pendingTask.status = 'downloading'
      updateTaskInDb(pendingTask)
      active++

      downloadTask(pendingTask).finally(() => {
        active--
        processNext()
      })
    }
  }

  processNext()
}

async function downloadTask(task: DownloadTask): Promise<void> {
  const controller = new AbortController()
  activeDownloads.set(task.id, controller)

  const saveDir = join(task.savePath, sanitize(task.mangaTitle), sanitize(task.chapterTitle))
  if (!existsSync(saveDir)) {
    mkdirSync(saveDir, { recursive: true })
  }

  try {
    console.log('[download] starting task', task.id, 'images:', task.imageUrls.length, 'dir:', saveDir)

    // loadImages 下载图片到 cacheDir（= saveDir），文件名为 MD5 hash
    const results = await loadImages(task.imageUrls, {
      concurrency: currentConcurrency,
      cacheDir: saveDir
    })

    console.log('[download] loadImages done, results:', results.length,
      'success:', results.filter(r => r.localPath).length,
      'failed:', results.filter(r => !r.localPath).length)

    // 把 hash 文件名的缓存图片复制为有序编号文件名
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.localPath && existsSync(result.localPath)) {
        const ext = result.url.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[1] ?? 'jpg'
        const dest = join(saveDir, `${String(i + 1).padStart(4, '0')}.${ext}`)
        if (!existsSync(dest)) {
          const rawBytes = readFileSync(result.localPath)
          let finalBytes = rawBytes
          if (task.scrambleId && task.scrambleId > 0) {
            try {
              finalBytes = await descrambleImage(rawBytes, task.scrambleId, result.url)
              console.log('[download] descrambled image', i + 1)
            } catch (err) {
              console.warn('[download] descramble failed for image', i + 1, ':', err)
              finalBytes = rawBytes
            }
          }
          writeFileSync(dest, finalBytes)
        }
        task.downloadedPages = i + 1
        sendProgress({
          taskId: task.id,
          totalPages: task.totalPages,
          downloadedPages: task.downloadedPages,
          status: 'downloading'
        })
      } else {
        console.warn('[download] image', i, 'failed:', result.error)
      }

      // Check if cancelled
      if (controller.signal.aborted) {
        task.status = 'pending'
        updateTaskInDb(task)
        return
      }
    }

    task.status = 'completed'
    task.downloadedPages = task.totalPages
    updateTaskInDb(task)

    sendProgress({
      taskId: task.id,
      totalPages: task.totalPages,
      downloadedPages: task.downloadedPages,
      status: 'completed'
    })
    console.log('[download] task', task.id, 'completed')
  } catch (err) {
    console.error('[download] task', task.id, 'failed:', err)
    task.status = 'failed'
    updateTaskInDb(task)
    sendProgress({
      taskId: task.id,
      totalPages: task.totalPages,
      downloadedPages: task.downloadedPages,
      status: 'failed'
    })
  } finally {
    activeDownloads.delete(task.id)
  }
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim()
}

// IPC handlers
ipcMain.handle('download:add', async (_event, data: {
  mangaId: string
  mangaTitle: string
  chapterIndex: number
  chapterTitle: string
  imageUrls: string[]
  savePath?: string
  scrambleId?: number
}) => {
  const db = await getDatabase()
  const savePath = data.savePath ?? app.getPath('downloads')

  db.run(
    `INSERT INTO downloads (manga_id, manga_title, chapter_index, chapter_title, status, total_pages, save_path)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    [data.mangaId, data.mangaTitle, data.chapterIndex, data.chapterTitle, data.imageUrls.length, savePath]
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
    scrambleId: data.scrambleId,
    status: 'pending',
    totalPages: data.imageUrls.length,
    downloadedPages: 0,
    savePath,
    imageUrls: data.imageUrls,
    createdAt: Date.now()
  }

  downloadQueue.push(task)
  processDownloadQueue()

  return { taskId }
})

ipcMain.handle('download:list', async () => {
  const db = await getDatabase()
  const results = db.exec('SELECT * FROM downloads ORDER BY created_at DESC')
  if (results.length === 0) return []

  return results[0].values.map((row) => ({
    id: row[0],
    mangaId: row[1],
    mangaTitle: row[2],
    chapterIndex: row[3],
    chapterTitle: row[4],
    status: row[5],
    totalPages: row[6],
    downloadedPages: row[7],
    savePath: row[8],
    createdAt: row[9]
  }))
})

ipcMain.handle('download:cancel', async (_event, taskId: number) => {
  const controller = activeDownloads.get(taskId)
  if (controller) controller.abort()
})

ipcMain.handle('download:setConcurrency', async (_event, concurrency: number) => {
  currentConcurrency = Math.max(1, Math.min(12, concurrency))
})

// Initialize on load
loadQueueFromDb()
