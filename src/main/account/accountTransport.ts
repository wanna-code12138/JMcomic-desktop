import { type JmApiProfile, versionPartFor } from '../content/jmAppApiProfiles'
import { createApiToken, createTokenParam, decryptApiPayload } from '../content/jmAppApiCrypto'
import { AccountError } from './accountErrors'

export const CREDENTIAL_ORIGINS = ['https://www.cdnhjk.net', 'https://www.cdngwc.cc'] as const
export const ACCOUNT_ENDPOINTS = {
  login: ['POST', '/login'], logout: ['POST', '/logout'], profile: ['GET', '/useredit/'],
  favorites: ['GET', '/favorite'], favorite: ['POST', '/favorite'], album: ['GET', '/album'],
  history: ['GET', '/watch_list'], tracking: ['POST', '/album_tracking'],
  trackingState: ['GET', '/album_sertracking'], trackingToggle: ['POST', '/album_sertracking'],
  notifications: ['GET', '/notifications'], unread: ['GET', '/notifications/unreadCount'],
  noticeRead: ['POST', '/notifications'],
  myComments: ['GET', '/forum'], postComment: ['POST', '/comment'], like: ['POST', '/like'],
  daily: ['GET', '/daily'], checkIn: ['POST', '/daily_chk'], dailyYears: ['GET', '/daily_list'],
  dailyHistory: ['POST', '/daily_list/filter'], tasks: ['GET', '/tasks'],
  folder: ['POST', '/favorite_folder'], tags: ['GET', '/tags_favorite'], tagsUpdate: ['POST', '/tags_favorite_update'],
  historyDelete: ['POST', '/watch_list'], profileUpdate: ['POST', '/useredit/']
} as const
export type AccountEndpoint = keyof typeof ACCOUNT_ENDPOINTS
export interface AccountTransport {
  request(endpoint: AccountEndpoint, params?: Record<string, string>, signal?: AbortSignal): Promise<unknown>
}
export function createAccountTransport(deps: {
  origin: string; profile: JmApiProfile; fetch: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number; timeoutMs?: number
}): AccountTransport {
  if (!(CREDENTIAL_ORIGINS as readonly string[]).includes(deps.origin)) throw new AccountError('FORBIDDEN')
  return { async request(endpoint, params = {}, signal) {
    if (signal?.aborted) throw new AccountError('CANCELLED')
    const spec = ACCOUNT_ENDPOINTS[endpoint]
    if (!spec) throw new AccountError('INVALID_INPUT')
    const [method, path] = spec
    const entries = { ...params }
    const profileEndpoint = endpoint === 'profile' || endpoint === 'profileUpdate'
    const suffix = profileEndpoint ? entries.uid : ''
    if (profileEndpoint) {
      if (!/^\d{1,12}$/.test(suffix ?? '')) throw new AccountError('INVALID_INPUT')
      delete entries.uid
    }
    const url = new URL(path + suffix, deps.origin)
    const form = new URLSearchParams(entries)
    if (method === 'GET') url.search = form.toString()
    const ts = deps.now?.() ?? Math.floor(Date.now() / 1000)
    const controller = new AbortController()
    const cancel = (): void => controller.abort(new AccountError('CANCELLED'))
    signal?.addEventListener('abort', cancel, { once: true })
    const timer = setTimeout(() => controller.abort(new AccountError('NETWORK')), deps.timeoutMs ?? (endpoint === 'logout' ? 3000 : 12_000))
    let rejectAbort!: (error: unknown) => void
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject })
    const onAbort = (): void => rejectAbort(controller.signal.reason)
    controller.signal.addEventListener('abort', onAbort, { once: true })
    try {
      const work = async (): Promise<unknown> => {
        const response = await deps.fetch(url.href, { method, body: method === 'POST' ? form.toString() : undefined,
          headers: { token: createApiToken(ts, deps.profile.signSecret), tokenparam: createTokenParam(ts, versionPartFor(deps.profile, method), true),
            Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
          redirect: 'manual', credentials: 'include', signal: controller.signal })
        const classify = (status: number): void => {
          if (status === 401) throw new AccountError('AUTH_REQUIRED')
          if (status === 403) throw new AccountError('CHALLENGE')
          if (status === 429) throw new AccountError('RATE_LIMITED')
          if (status !== 200) throw new AccountError(status >= 500 ? 'UNAVAILABLE' : 'PROTOCOL')
        }
        try { classify(response.status) } catch (error) { await response.body?.cancel(); throw error }
        const reader = response.body?.getReader()
        if (!reader) throw new AccountError('PROTOCOL')
        const chunks: Uint8Array[] = []; let bytes = 0
        const abortRead = (): void => { void reader.cancel().catch(() => {}) }
        controller.signal.addEventListener('abort', abortRead, { once: true })
        try {
          while (true) {
            controller.signal.throwIfAborted()
            const next = await reader.read()
            controller.signal.throwIfAborted()
            if (next.done) break
            bytes += next.value.byteLength
            if (bytes > 1024 * 1024) throw new AccountError('PROTOCOL')
            chunks.push(next.value)
          }
        } finally { controller.signal.removeEventListener('abort', abortRead); await reader.cancel().catch(() => {}); reader.releaseLock() }
        try {
          const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          classify(Number(envelope.code))
          if (typeof envelope.data !== 'string') throw new AccountError('PROTOCOL')
          const value = decryptApiPayload(envelope.data, ts, deps.profile.dataSecret)
          if (value && typeof value === 'object' && 'code' in value && Number(value.code) === 401) throw new AccountError('AUTH_REQUIRED')
          return value
        } catch (error) { throw error instanceof AccountError ? error : new AccountError('PROTOCOL') }
      }
      return await Promise.race([work(), aborted])
    } catch (error) {
      throw error instanceof AccountError ? error : new AccountError('NETWORK')
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.signal.removeEventListener('abort', onAbort)
    }
  } }
}
