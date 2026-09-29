import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { sanitizeFileName } from './downloadCore'
import type { PdfDownloadRequest } from '../shared/pdfContracts'

export function preparePdfRequest(raw: unknown): PdfDownloadRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  if (typeof item.mangaId !== 'string' || !item.mangaId || item.mangaId.length > 100 || typeof item.mangaTitle !== 'string' || item.mangaTitle.length > 500
    || !Array.isArray(item.chapters) || !item.chapters.length || item.chapters.length > 1000) return null
  const chapters = new Map<number, { index: number; title: string; url: string }>()
  for (const ch of item.chapters) {
    if (!ch || !Number.isInteger(ch.index) || ch.index < 0 || ch.index > 100000 || typeof ch.title !== 'string' || ch.title.length > 500
      || typeof ch.url !== 'string' || ch.url.length > 2048 || !/^(?:https?:\/\/[^/]+)?\/photo\/\d+(?:[/?#]|$)/i.test(ch.url)) return null
    chapters.set(ch.index, { index: ch.index, title: ch.title, url: ch.url })
  }
  return { mangaId: item.mangaId, mangaTitle: item.mangaTitle, coverUrl: typeof item.coverUrl === 'string' ? item.coverUrl.slice(0, 2048) : '', chapters: [...chapters.values()].sort((a, b) => a.index - b.index) }
}

export function pdfFileName(request: PdfDownloadRequest): string {
  const chapters = request.chapters, first = chapters[0].index + 1, last = chapters.at(-1)!.index + 1
  const contiguous = chapters.every((chapter, index) => chapter.index === chapters[0].index + index)
  const range = chapters.length === 1 ? `${first}` : contiguous ? `${first}-${last}` : `${first}-${last}-${createHash('sha256').update(chapters.map(ch => ch.index).join(',')).digest('hex').slice(0, 8)}`
  return `${sanitizeFileName(request.mangaTitle).slice(0, 80) || '未命名漫画'} - JM${sanitizeFileName(request.mangaId).slice(0, 30)} - ${range}.pdf`
}

export function resolvePdfOutput(root: string, name: string): string {
  if (!isAbsolute(root) || basename(name) !== name || /[\\/:]/.test(name) || !name.toLowerCase().endsWith('.pdf') || name.length > 180 || !name) throw Error('PDF 输出路径无效')
  const target = resolve(root, name)
  if (dirname(target).toLowerCase() !== resolve(root).toLowerCase()) throw Error('PDF 必须保存到下载根目录')
  return target
}

export function pdfStagingDirectory(dataDir: string, stagingId: string): string {
  if (!/^[a-f0-9-]{36}$/.test(stagingId)) throw Error('PDF 临时任务标识无效')
  return join(dataDir, 'pdf-staging', stagingId)
}

export const pdfIdentity = (request: PdfDownloadRequest, root: string): string => createHash('sha256')
  .update(JSON.stringify([request.mangaId, request.chapters.map(ch => [ch.index, ch.url]), resolve(root).toLowerCase()])).digest('hex')
