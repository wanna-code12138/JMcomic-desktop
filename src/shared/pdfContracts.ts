import type { ReaderChapter } from './readerContracts'
import type { DownloadTaskRow } from './downloadContracts'

export interface PdfDownloadRequest { mangaId: string; mangaTitle: string; coverUrl?: string; chapters: ReaderChapter[] }
export interface PdfTask extends DownloadTaskRow {
  kind: 'pdf'
  identity: string
  stagingId: string
  chapters: Array<ReaderChapter & { pageCount?: number }>
  outputFile: string
  mergedPages: number
  checksum?: string
}
export interface PdfPageSource { path: string; chapterTitle: string; first: boolean }
export interface PdfWriteResult { pages: number; sha256: string }
