import { mkdir, readFile, writeFile, rename, unlink, link, stat, realpath, rm } from 'node:fs/promises'
import { join, resolve, dirname, basename } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { preparePdfRequest, pdfFileName, resolvePdfOutput, pdfStagingDirectory, pdfIdentity } from './pdfDownloadCore'
import { inspectChapterFiles } from './downloadCore'
import { imageExtension } from '../shared/imageFormat'
import { waitWithAbort } from '../shared/waitWithAbort'
import type { ImageLoaderOptions, ImageResult } from './imageLoader'
import type { PdfDownloadRequest, PdfTask, PdfPageSource, PdfWriteResult } from '../shared/pdfContracts'

export interface PdfRepository {
  list(): Promise<PdfTask[]>
  insert(task: Omit<PdfTask, 'id'>): Promise<PdfTask>
  save(task: PdfTask): Promise<void>
  remove(id: number): Promise<void>
}
interface PdfPorts {
  dataDir: string
  settings(): Promise<{ downloadDir: string; downloadRetries: number; downloadResumeOnStartup: boolean }>
  repository: PdfRepository
  pages(url: string): Promise<{ pages: Array<{ imageUrl: string }>; scrambleId?: number }>
  images(urls: string[], options: ImageLoaderOptions): Promise<ImageResult[]>
  transform(bytes: Buffer, scrambleId: number, url: string): Promise<Buffer>
  writer(part: string, pages: PdfPageSource[], signal: AbortSignal, progress: (page: number) => void): Promise<PdfWriteResult>
  progress(task: PdfTask): void
}
const active = new Set(['pending', 'resolving', 'downloading', 'merging', 'committing'])
async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex')
}

export class PdfDownloadService {
  private queue: PdfTask[] = []
  private current?: { task: PdfTask; controller: AbortController }
  private running?: Promise<void>
  private mutations: Promise<unknown> = Promise.resolve()
  private stopping = false
  constructor(private ports: PdfPorts) {}
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutations.then(operation)
    this.mutations = result.catch(() => {})
    return result
  }
  private async save(task: PdfTask): Promise<void> { await this.ports.repository.save(task); this.ports.progress(task) }
  private assertOpen(): void { if (this.stopping) throw Error('程序正在保存并关闭，请稍后重试') }
  private async find(id: number): Promise<PdfTask> {
    const row = this.current?.task.id === id ? this.current.task : this.queue.find(task => task.id === id) ?? (await this.ports.repository.list()).find(task => task.id === id)
    if (!row) throw Error('PDF 任务不存在')
    return row
  }
  async init(): Promise<void> {
    const settings = await this.ports.settings()
    for (const task of await this.ports.repository.list()) {
      if (task.status === 'completed') { await this.cleanupStaging(task).catch(error => console.warn('[pdf] completed task cleanup:', String(error))); continue }
      if (this.current?.task.id === task.id || this.queue.some(item => item.id === task.id)) continue
      if (!active.has(task.status)) continue
      if (task.status === 'committing' && await this.reconcile(task)) continue
      task.status = 'pending'; await this.save(task)
      if (settings.downloadResumeOnStartup) this.queue.push(task)
    }
    this.kick()
  }
  add(raw: unknown): Promise<PdfTask> {
    return this.mutate(async () => {
      this.assertOpen()
      const request = preparePdfRequest(raw); if (!request) throw Error('PDF 下载章节清单无效')
      const settings = await this.ports.settings(), root = resolve(settings.downloadDir), identity = pdfIdentity(request, root)
      const existing = (await this.ports.repository.list()).find(task => task.identity === identity && active.has(task.status))
      this.assertOpen()
      if (existing) {
        if (existing.status === 'pending' && this.current?.task.id !== existing.id && !this.queue.some(item => item.id === existing.id)) { this.queue.push(existing); this.kick() }
        return existing
      }
      const task = await this.ports.repository.insert({ kind: 'pdf', identity, stagingId: randomUUID(), mangaId: request.mangaId, mangaTitle: request.mangaTitle,
        coverUrl: request.coverUrl, chapterIndex: request.chapters[0].index, chapterTitle: `${request.chapters.length} 章合并`, chapters: request.chapters,
        outputFile: pdfFileName(request), savePath: root, status: 'pending', totalPages: 0, downloadedPages: 0, mergedPages: 0, createdAt: Math.floor(Date.now() / 1000) })
      this.ports.progress(task)
      this.queue.push(task); this.kick()
      return task
    })
  }
  private kick(): void {
    if (this.stopping || this.running) return
    const task = this.queue.find(item => item.status === 'pending'); if (!task) return
    this.queue = this.queue.filter(item => item !== task)
    const controller = new AbortController(); this.current = { task, controller }
    this.running = this.run(task, controller.signal).catch(error => {
      // Disk errors must not produce an unhandled rejection or claim completion.
      if (task.status !== 'committing') task.status = 'failed'
      task.error = String(error); this.ports.progress(task)
    }).finally(() => { if (task.status === 'pending') this.queue.push(task); this.current = undefined; this.running = undefined; this.kick() })
  }
  async idle(): Promise<void> { await this.mutations; while (this.running) await this.running }
  private part(task: PdfTask): string { return join(task.savePath, `.jmcomic-${task.stagingId}.pdf.part`) }
  private async reconcile(task: PdfTask): Promise<boolean> {
    if (!task.checksum || !task.totalPages || task.mergedPages !== task.totalPages) return false
    try {
      if (await hashFile(resolvePdfOutput(task.savePath, task.outputFile)) !== task.checksum) return false
    } catch { return false }
    task.status = 'completed'; task.error = ''; await this.save(task)
    await this.cleanupStaging(task).catch(error => console.warn('[pdf] completed task cleanup:', String(error)))
    await unlink(this.part(task)).catch(() => {})
    return true
  }
  private async run(task: PdfTask, signal: AbortSignal): Promise<void> {
    let part: string | undefined, published = false
    try {
      const staging = pdfStagingDirectory(this.ports.dataDir, task.stagingId)
      const settings = await this.ports.settings(); signal.throwIfAborted()
      task.status = 'resolving'; task.error = ''; task.downloadedPages = 0; task.mergedPages = 0; await this.save(task)
      await mkdir(staging, { recursive: true }); await mkdir(task.savePath, { recursive: true })
      const sources: PdfPageSource[] = []
      for (const chapter of task.chapters) {
        signal.throwIfAborted()
        const metadata = await waitWithAbort(this.ports.pages(chapter.url), signal)
        signal.throwIfAborted()
        if (!metadata.pages.length || metadata.pages.length > 100000) throw Error(`章节「${chapter.title}」没有可下载的图片`)
        chapter.pageCount = metadata.pages.length
        task.totalPages = task.chapters.reduce((sum, ch) => sum + (ch.pageCount ?? 0), 0)
        task.status = 'downloading'; await this.save(task)
        const directory = join(staging, `chapter-${chapter.index}`); await mkdir(directory, { recursive: true })
        const scan = await inspectChapterFiles(directory, chapter.pageCount)
        task.downloadedPages += scan.files.length
        const missing = scan.missingIndices
        const results = await this.ports.images(missing.map(index => metadata.pages[index].imageUrl), { concurrency: 2, maxRetries: settings.downloadRetries, signal,
          onImage: async (result, index) => {
            signal.throwIfAborted()
            const raw = result.buffer ?? (result.localPath ? await readFile(result.localPath) : undefined)
            if (!raw) throw Error('图片为空')
            const bytes = await this.ports.transform(raw, metadata.scrambleId ?? 0, result.url)
            signal.throwIfAborted()
            const target = join(directory, `${String(missing[index] + 1).padStart(4, '0')}.${imageExtension(bytes)}`), temporary = `${target}.part`
            try { await writeFile(temporary, bytes, { signal }); signal.throwIfAborted(); await rename(temporary, target) }
            finally { await unlink(temporary).catch(() => {}) }
            task.downloadedPages++; this.ports.progress(task)
          }
        })
        signal.throwIfAborted()
        const complete = await inspectChapterFiles(directory, chapter.pageCount)
        if (results.some(item => item.error) || !complete.available) throw Error(`章节「${chapter.title}」图片不完整，重试会继续补齐缺页`)
        for (const file of complete.files) sources.push({ path: file.path, chapterTitle: chapter.title, first: file.index === 0 })
        await this.save(task)
      }
      signal.throwIfAborted()
      task.totalPages = sources.length; task.downloadedPages = sources.length; task.status = 'merging'; await this.save(task)
      part = this.part(task)
      await unlink(part).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })
      const result = await this.ports.writer(part, sources, signal, page => { task.mergedPages = page; this.ports.progress(task) })
      signal.throwIfAborted()
      if (result.pages !== task.totalPages) throw Error('PDF 页数与下载清单不一致')
      task.checksum = result.sha256; task.mergedPages = result.pages; task.status = 'committing'
      const original = pdfFileName(task as PdfDownloadRequest)
      for (let suffix = 0; suffix < 10000; suffix++) {
        task.outputFile = suffix ? `${original.slice(0, -4)} (${suffix + 1}).pdf` : original
        await this.save(task); signal.throwIfAborted()
        try {
          // Same-volume hard-link publication is atomic and refuses to overwrite existing files.
          await link(part, resolvePdfOutput(task.savePath, task.outputFile)); published = true; break
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
          throw Error(`无法安全发布 PDF，请检查下载磁盘是否支持文件链接及剩余空间：${String(error)}`)
        }
      }
      if (!published) throw Error('同名 PDF 过多，请更换下载目录')
      task.status = 'completed'; task.error = ''; await this.save(task)
      await this.cleanupStaging(task).catch(error => console.warn('[pdf] completed task cleanup:', String(error)))
    } catch (error) {
      if (published) { task.status = 'committing'; throw error }
      task.status = signal.aborted ? this.stopping ? 'pending' : 'cancelled' : 'failed'
      task.error = signal.aborted ? this.stopping ? '' : '已取消，已下载的页面保留供重试' : String(error)
      await this.save(task)
    } finally { if (part) await unlink(part).catch(() => {}) }
  }
  private async cleanupStaging(task: PdfTask): Promise<void> {
    const directory = pdfStagingDirectory(this.ports.dataDir, task.stagingId)
    await unlink(this.part(task)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })
    try {
      const [actual, parent] = await Promise.all([realpath(directory), realpath(join(this.ports.dataDir, 'pdf-staging'))])
      if (dirname(actual).toLowerCase() !== parent.toLowerCase() || basename(actual) !== task.stagingId) throw Error('PDF 临时目录超出允许范围')
      await rm(actual, { recursive: true, force: true })
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  private async cancelTask(id: number): Promise<void> {
    this.assertOpen(); const task = await this.find(id)
    if (task.status === 'completed') return
    this.queue = this.queue.filter(item => item.id !== id)
    if (this.current?.task.id === id) { this.current.controller.abort(); await this.running }
    else { task.status = 'cancelled'; task.error = '已取消'; await this.save(task) }
  }
  cancel(id: number): Promise<void> { return this.mutate(() => this.cancelTask(id)) }
  retry(id: number): Promise<void> {
    return this.mutate(async () => {
      this.assertOpen(); const task = await this.find(id)
      if (this.current?.task.id === id || this.queue.some(item => item.id === id)) throw Error('任务正在运行')
      task.status = 'pending'; task.error = ''; await this.save(task)
      this.queue.push(task); this.kick()
    })
  }
  remove(id: number, deleteFiles: boolean): Promise<void> {
    return this.mutate(async () => {
    await this.cancelTask(id); const task = await this.find(id)
    // Only a verified publication belongs to this task; a colliding user file does not.
    if (deleteFiles && task.checksum) {
      const output = resolvePdfOutput(task.savePath, task.outputFile)
      try {
        if (await hashFile(output) !== task.checksum) throw Error('PDF 文件已被修改，已保留文件；可仅删除记录')
        const [actual, root] = await Promise.all([realpath(output), realpath(task.savePath)])
        if (dirname(actual).toLowerCase() !== root.toLowerCase() || !(await stat(actual)).isFile()) throw Error('PDF 路径无效')
        await unlink(output)
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
    await this.cleanupStaging(task); await this.ports.repository.remove(id)
    })
  }
  async clearStoppedTasks(): Promise<void> {
    if (!this.stopping || this.running) throw Error('请先停止 PDF 任务')
    await this.mutations
    for (const task of await this.ports.repository.list()) await this.cleanupStaging(task)
    this.queue = []
  }
  async stop(): Promise<void> {
    this.stopping = true; this.current?.controller.abort()
    await this.mutations; await this.running
  }
  resume(): void { this.stopping = false; this.kick() }
}
