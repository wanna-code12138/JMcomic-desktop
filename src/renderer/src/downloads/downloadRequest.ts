import { create } from 'zustand'
import type { PdfDownloadRequest } from '../../../shared/pdfContracts'

type Format = 'images' | 'pdf'
interface Choice { format: Format; remember: boolean }
interface PendingChoice { title: string; count: number; selected: Format; answer: (choice: Choice | null) => void }
export const useDownloadChoice = create<{ pending: PendingChoice | null }>(() => ({ pending: null }))
let requests: Promise<unknown> = Promise.resolve()
export interface DownloadRequestResult { ok: boolean; cancelled?: boolean; format?: Format; added?: number; total?: number; error?: string; results?: Array<{ ok: boolean; error?: string }> }

/** Every entry point uses the same preference/confirmation path; one dialog per selected batch. */
export function requestDownload(request: PdfDownloadRequest, chooseFormat = false): Promise<DownloadRequestResult> {
  const run = requests.then(async (): Promise<DownloadRequestResult> => {
    const api = window.electronAPI
    if (!api) throw Error('下载服务不可用')
    const settings = await api.settingsGet()
    let format: Format = settings.downloadFormat === 'pdf' ? 'pdf' : 'images'
    if (settings.downloadFormat === 'ask' || chooseFormat) {
      const choice = await new Promise<Choice | null>(answer => useDownloadChoice.setState({ pending: {
        title: request.mangaTitle, count: request.chapters.length, selected: format,
        answer: choice => { useDownloadChoice.setState({ pending: null }); answer(choice) }
      } }))
      if (!choice) return { ok: false, cancelled: true }
      format = choice.format
      if (choice.remember) await api.settingsSet({ downloadFormat: format })
    }
    if (format === 'pdf') {
      const result = await api.downloadPdfAdd(request)
      return { ...result, format, added: result.ok ? request.chapters.length : 0, total: request.chapters.length }
    }
    return { ...await api.downloadAddChapters({ ...request }), format }
  })
  requests = run.catch(() => {})
  return run
}
