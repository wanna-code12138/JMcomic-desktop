import { ipcMain, type WebContents } from 'electron'
import { publicComments } from '../contentApi'
import { isTrustedAccountSender } from '../account/accountIpc'

export function registerCommentIpc(getContents: () => WebContents | undefined): void {
  const pending = new Map<string, AbortController>()
  ipcMain.handle('comments:get', async (event, query: { albumId: string; page: number; refresh: boolean; requestId: string }) => {
    if (!isTrustedAccountSender(event, getContents())) return { ok: false, error: '无法执行此请求。' }
    if (!query || !/^[\w-]{8,128}$/.test(query.requestId) || pending.size >= 12) return { ok: false, error: '评论请求过多，请稍后重试。' }
    pending.get(query.requestId)?.abort()
    const controller = new AbortController(); pending.set(query.requestId, controller)
    try { return { ok: true, data: await publicComments.get(query.albumId, query.page, query.refresh === true, controller.signal) } }
    catch { return { ok: false, error: controller.signal.aborted ? '请求已取消。' : '评论暂时加载失败，请稍后重试。' } }
    finally { if (pending.get(query.requestId) === controller) pending.delete(query.requestId) }
  })
  ipcMain.handle('comments:cancel', (event, requestId: string) => {
    if (isTrustedAccountSender(event, getContents())) pending.get(requestId)?.abort()
  })
}
