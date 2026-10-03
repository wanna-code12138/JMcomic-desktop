import type { Session } from 'electron'
import type { JmApiRoute } from '../content/jmAppApiDomainResolver'
import type { AccountSession, SavedAccountSession } from './accountSessionTypes'
import { randomUUID } from 'node:crypto'
import { CREDENTIAL_ORIGINS, createAccountTransport } from './accountTransport'
import { AccountError } from './accountErrors'

export interface AccountSessionFactoryDeps {
  openSession(partition: string, options: { cache: boolean }): Session
  discover(saved?: SavedAccountSession, signal?: AbortSignal): Promise<JmApiRoute>
  register(session: Session): Promise<() => void>
}
export function createAccountSessionFactory(deps: AccountSessionFactoryDeps) {
  return async (saved?: SavedAccountSession, signal?: AbortSignal): Promise<AccountSession> => {
    signal?.throwIfAborted()
    const route = await deps.discover(saved, signal)
    signal?.throwIfAborted()
    if (!(CREDENTIAL_ORIGINS as readonly string[]).includes(route.apiOrigin) || (saved && route.apiOrigin !== saved.origin)) throw new AccountError('FORBIDDEN')
    const id = randomUUID(), host = new URL(route.apiOrigin).hostname
    const session = deps.openSession(`jm-account-${id}`, { cache: false })
    let unregister: (() => void) | undefined, disposal: Promise<void> | undefined
    const dispose = (): Promise<void> => {
      if (!disposal) {
        unregister?.()
        disposal = (async () => { await session.closeAllConnections(); await session.clearStorageData() })()
      }
      return disposal
    }
    try {
      unregister = await deps.register(session)
      signal?.throwIfAborted()
      if (saved) {
        for (const cookie of saved.cookies) {
          if (cookie.domain.replace(/^\./, '') !== host) throw new AccountError('STORAGE')
          if (cookie.expirationDate && cookie.expirationDate < Date.now() / 1000) continue
          await session.cookies.set({ ...cookie, url: route.apiOrigin + cookie.path })
        }
      }
      const transport = createAccountTransport({ origin: route.apiOrigin, profile: route.profile, fetch: (url, init) => session.fetch(url, init) })
      return { id, origin: route.apiOrigin, imageOrigin: route.imageOrigin, profileId: route.profile.id, appVersion: route.profile.bootstrapVersion,
        async request(endpoint, params, requestSignal) {
          if (disposal) throw new AccountError('CANCELLED')
          return transport.request(endpoint, params, requestSignal)
        },
        async installAvs(value) {
          if (disposal) throw new AccountError('CANCELLED')
          await session.cookies.set({ url: route.apiOrigin, name: 'AVS', value, path: '/', secure: true, httpOnly: true })
        },
        async snapshot(profile) {
          if (disposal) throw new AccountError('CANCELLED')
          const cookies = (await session.cookies.get({ url: route.apiOrigin })).filter(cookie => cookie.domain?.replace(/^\./, '') === host)
            .map(cookie => ({ name: cookie.name, value: cookie.value, domain: cookie.domain!, path: cookie.path || '/',
              secure: cookie.secure ?? false, httpOnly: cookie.httpOnly ?? false, expirationDate: cookie.expirationDate, sameSite: cookie.sameSite }))
          return { version: 1, origin: route.apiOrigin, profileId: route.profile.id, appVersion: route.profile.bootstrapVersion,
            imageOrigin: route.imageOrigin, profile, cookies }
        }, dispose }
    } catch (error) { await dispose().catch(() => {}); throw error }
  }
}
