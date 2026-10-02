import type { IpcMain, WebContents } from 'electron'
import type { AccountService } from './accountService'
import type { createAccountLibrary } from './accountLibrary'
import { AccountError, accountError } from './accountErrors'
import type { AlbumMutation, LibraryQuery } from '../../shared/accountContracts'

export function isTrustedAccountSender(event: { sender: unknown; senderFrame: unknown }, contents: { mainFrame: unknown } | undefined): boolean {
  return Boolean(contents && event.sender === contents && event.senderFrame && event.senderFrame === contents.mainFrame)
}

export function registerAccountHandlers(ipc: Pick<IpcMain, 'handle'>, getContents: () => WebContents | undefined,
  service: AccountService, library: ReturnType<typeof createAccountLibrary>): void {
  const handle = (channel: string, action: (...args: any[]) => unknown): void => {
    ipc.handle(channel, async (event, ...args) => {
      try {
        if (!isTrustedAccountSender(event, getContents())) throw new AccountError('FORBIDDEN')
        return { ok: true, data: await action(...args) }
      } catch (error) { const failure = accountError(error); return { ok: false, code: failure.code, error: failure.message } }
    })
  }
  handle('account:state', service.getState)
  handle('account:login', (username: string, password: string, remember: boolean) => service.login(username, password, remember))
  handle('account:logout', service.logout)
  handle('account:verify', (generation: number) => service.verify(generation))
  handle('account:library', (query: LibraryQuery) => library.list(query))
  handle('account:album', (id: string, generation: number) => library.album(id, generation))
  handle('account:mutate', (query: AlbumMutation) => library.mutate(query))
  handle('account:notifications', (generation: number) => library.notifications(generation))
  handle('account:noticeRead', (id: string, generation: number, operationId: string) => library.markRead(id, generation, operationId))
}
