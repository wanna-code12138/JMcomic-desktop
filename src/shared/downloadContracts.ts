export interface DownloadTaskRow {
  id: number
  mangaId: string
  mangaTitle: string
  chapterIndex: number
  chapterTitle: string
  status: string
  totalPages: number
  downloadedPages: number
  savePath: string
  createdAt: number
  coverUrl?: string
  chapterUrl?: string
  error?: string
  available?: boolean
  availabilityReason?: DownloadAvailabilityReason
  storageRelpath?: string
}

export type DownloadAvailabilityReason = 'missing-root' | 'missing-chapter' | 'missing-pages'

export interface DownloadAvailability {
  available: boolean
  pageCount: number
  reason?: DownloadAvailabilityReason
}

export interface MangaDownloadGroup {
  mangaId: string
  mangaTitle: string
  coverUrl: string
  createdAt: number
  tasks: DownloadTaskRow[]
  /** 去重后的章节总数 */
  totalChapters: number
  /** 至少有一个任务完成的章节数 */
  completedChapters: number
  activeTasks: number
  failedTasks: number
}

export interface DownloadProgress {
  taskId: number
  mangaId: string
  mangaTitle: string
  chapterIndex: number
  chapterTitle: string
  totalPages: number
  downloadedPages: number
  status: string
}

/** 把下载任务行按漫画聚合，输出本地详情页与下载页所需的分组摘要。 */
export function groupTasksByManga(rows: DownloadTaskRow[]): MangaDownloadGroup[] {
  const byManga = new Map<string, MangaDownloadGroup>()
  for (const task of rows) {
    let group = byManga.get(task.mangaId)
    if (!group) {
      group = {
        mangaId: task.mangaId,
        mangaTitle: task.mangaTitle,
        coverUrl: task.coverUrl ?? '',
        createdAt: task.createdAt,
        tasks: [],
        totalChapters: 0,
        completedChapters: 0,
        activeTasks: 0,
        failedTasks: 0
      }
      byManga.set(task.mangaId, group)
    }
    group.tasks.push(task)
    if (task.createdAt > group.createdAt) {
      group.createdAt = task.createdAt
      group.mangaTitle = task.mangaTitle
      if (task.coverUrl) group.coverUrl = task.coverUrl
    }
  }

  const groups = [...byManga.values()]
  for (const group of groups) {
    group.tasks.sort((a, b) => a.chapterIndex - b.chapterIndex || a.id - b.id)
    const chapterStatus = new Map<number, Set<string>>()
    for (const task of group.tasks) {
      let statuses = chapterStatus.get(task.chapterIndex)
      if (!statuses) {
        statuses = new Set()
        chapterStatus.set(task.chapterIndex, statuses)
      }
      statuses.add(task.status)
      if (task.status === 'pending' || task.status === 'downloading') group.activeTasks++
      if (task.status === 'failed' || task.status === 'cancelled') group.failedTasks++
    }
    group.totalChapters = chapterStatus.size
    group.completedChapters = [...chapterStatus.values()].filter((s) => s.has('completed')).length
  }

  groups.sort((a, b) => b.createdAt - a.createdAt)
  return groups
}
