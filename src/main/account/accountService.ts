import type { AccountProfile, AccountState } from '../../shared/accountContracts'
import type { AccountSession, AccountVault, SavedAccountSession } from './accountSessionTypes'
import type { AccountEndpoint } from './accountTransport'
import { AccountError, accountError } from './accountErrors'
import { parseLibrary, parseLogin } from './accountParser'

export interface AccountServiceDeps {
  createSession(saved?: SavedAccountSession, signal?: AbortSignal): Promise<AccountSession>
  vault: AccountVault
  publish?(state: AccountState): void
  now?: () => number
}
export function createAccountService(deps: AccountServiceDeps) {
  let state: AccountState = { phase: 'anonymous', generation: 0, profile: null, remembered: false }
  let active: { session: AccountSession; controller: AbortController } | null = null
  let candidate: AbortController | null = null
  let epoch = 0, paused = false, closed = false
  let verification: { generation: number; promise: Promise<AccountState> } | null = null
  const invalidationListeners = new Set<() => void>()
  const invalidate = (): void => { for (const listener of invalidationListeners) listener() }
  const getState = (): AccountState => structuredClone(state)
  const publish = (patch: Partial<AccountState>): void => {
    const changed = patch.generation !== undefined && patch.generation !== state.generation
    state = { ...state, ...patch }; if (changed) invalidate(); deps.publish?.(getState())
  }
  const cancelled = (): AccountError => new AccountError('CANCELLED')
  function check(generation: number, captured = active): NonNullable<typeof active> {
    if (closed || generation !== state.generation || captured !== active) throw cancelled()
    if (!active) throw new AccountError('AUTH_REQUIRED')
    if (paused) throw new AccountError('BUSY')
    return active
  }
  async function prove(session: AccountSession, signal: AbortSignal): Promise<void> {
    const payload = await session.request('favorites', { page: '1', folder_id: '0', o: 'mr' }, signal)
    signal.throwIfAborted()
    parseLibrary(payload, 1, session.imageOrigin)
  }
  async function establish(username: string | null, password: string, remember: boolean, saved?: SavedAccountSession): Promise<AccountState> {
    if (closed || paused) throw new AccountError('BUSY')
    const attempt = ++epoch
    candidate?.abort(cancelled())
    const controller = new AbortController(); candidate = controller
    const previous = getState()
    publish({ phase: saved ? 'restoring' : 'authenticating', message: undefined })
    let session: AccountSession | undefined
    const current = (): void => { if (attempt !== epoch || controller.signal.aborted || closed) throw cancelled() }
    try {
      session = await deps.createSession(saved, controller.signal); current()
      let profile: AccountProfile
      if (saved) profile = saved.profile
      else {
        const result = parseLogin(await session.request('login', { username: username!, password }, controller.signal), deps.now?.() ?? Date.now())
        current(); await session.installAvs(result.avs); current(); profile = result.profile
      }
      await prove(session, controller.signal); current()
      if (remember) {
        const snapshot = await session.snapshot(profile); current()
        await deps.vault.save(snapshot); current()
      } else { await deps.vault.clear(); current() }
      const old = active
      active = { session, controller: new AbortController() }
      publish({ phase: 'authenticated', generation: state.generation + 1, profile, remembered: remember, message: undefined })
      old?.controller.abort(cancelled()); if (old) void old.session.dispose().catch(() => {})
      return getState()
    } catch (error) {
      if (attempt !== epoch || controller.signal.aborted) throw cancelled()
      const failure = accountError(error)
      if (saved && !active && failure.code === 'AUTH_REQUIRED') {
        epoch++
        publish({ phase: 'expired', generation: state.generation + 1, profile: null, remembered: false, message: new AccountError('EXPIRED').message })
        await deps.vault.clear()
        throw new AccountError('EXPIRED')
      }
      publish({ ...previous, message: failure.message })
      throw failure
    } finally {
      if (candidate === controller) candidate = null
      if (session && session !== active?.session) await session.dispose().catch(() => {})
    }
  }
  async function verify(generation: number): Promise<AccountState> {
    const captured = check(generation)
    if (verification?.generation === generation) return verification.promise
    const operation = (async () => {
      try {
        await prove(captured.session, captured.controller.signal); check(generation, captured)
        publish({ phase: 'authenticated', message: undefined }); return getState()
      } catch (error) {
        check(generation, captured)
        const failure = accountError(error)
        if (failure.code === 'AUTH_REQUIRED') {
          epoch++; active = null; captured.controller.abort(cancelled())
          publish({ phase: 'expired', generation: state.generation + 1, profile: null, remembered: false, message: new AccountError('EXPIRED').message })
          await Promise.all([deps.vault.clear(), captured.session.dispose()]).catch(() => { publish({ message: new AccountError('STORAGE').message }) })
          throw new AccountError('EXPIRED')
        }
        publish({ phase: 'verification-required', message: failure.message }); throw failure
      } finally { if (verification?.generation === generation) verification = null }
    })()
    verification = { generation, promise: operation }
    return operation
  }
  return {
    getState,
    onInvalidate(listener: () => void) { invalidationListeners.add(listener); return () => { invalidationListeners.delete(listener) } },
    async login(username: string, password: string, remember: boolean) {
      if (typeof username !== 'string' || !username.trim() || username.length > 120 || typeof password !== 'string' || !password || password.length > 256) throw new AccountError('INVALID_INPUT')
      return establish(username.trim(), password, remember === true)
    },
    async restore() {
      const start = epoch
      try {
        const saved = await deps.vault.load()
        if (start !== epoch || closed) throw cancelled()
        if (saved) return await establish(null, '', true, saved)
        return getState()
      } catch (error) {
        const failure = accountError(error)
        if (start === epoch || (!active && state.phase === 'anonymous')) publish({ message: failure.message })
        throw failure
      }
    },
    async logout() {
      epoch++; candidate?.abort(cancelled()); candidate = null
      const old = active; active = null; old?.controller.abort(cancelled())
      publish({ phase: 'anonymous', generation: state.generation + 1, profile: null, remembered: false, message: undefined })
      const generation = state.generation
      let remoteFailed = false
      const cleanup = async (): Promise<void> => {
        if (!old) return
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([old.session.request('logout', {}, controller.signal), new Promise<never>((_, reject) => {
            timer = setTimeout(() => { controller.abort(cancelled()); reject(new AccountError('NETWORK')) }, 3000)
          })])
        } catch { remoteFailed = true }
        finally { clearTimeout(timer); await old.session.dispose() }
      }
      const results = await Promise.allSettled([deps.vault.clear(), cleanup()])
      if (state.generation === generation) {
        if (results.some(result => result.status === 'rejected')) { publish({ message: new AccountError('STORAGE').message }); throw new AccountError('STORAGE') }
        if (remoteFailed) publish({ message: '已在本机退出；未能确认服务器撤销会话。' })
      }
      return getState()
    },
    verify,
    async request(endpoint: AccountEndpoint, params: Record<string, string>, generation: number): Promise<unknown> {
      const captured = check(generation)
      if (verification?.generation === generation) { await verification.promise; check(generation, captured) }
      if (state.phase !== 'authenticated') throw new AccountError('BUSY')
      const controller = captured.controller
      try {
        const result = await captured.session.request(endpoint, params, controller.signal)
        check(generation, captured); if (controller.signal.aborted) throw cancelled()
        return result
      } catch (error) {
        check(generation, captured); if (controller.signal.aborted) throw cancelled()
        const failure = accountError(error)
        if (failure.code === 'AUTH_REQUIRED') {
          await verify(generation); check(generation, captured)
          if (['favorites', 'history', 'tracking', 'album', 'trackingState', 'notifications', 'unread', 'profile', 'myComments', 'daily', 'dailyYears', 'dailyHistory', 'tasks'].includes(endpoint)) {
            try {
              const result = await captured.session.request(endpoint, params, controller.signal)
              check(generation, captured); controller.signal.throwIfAborted(); return result
            } catch (retryError) {
              check(generation, captured)
              const retryFailure = accountError(retryError)
              if (retryFailure.code !== 'AUTH_REQUIRED') throw retryFailure
            }
          }
          throw new AccountError('UNAVAILABLE')
        }
        throw failure
      }
    },
    setNetworkPaused(value: boolean) {
      paused = value
      if (value) {
        epoch++; candidate?.abort(cancelled()); active?.controller.abort(cancelled())
        if (state.phase === 'authenticating' || state.phase === 'restoring') publish({ phase: active ? 'authenticated' : 'anonymous', message: '网络设置已改变，请重新发起登录。' })
      }
      else if (active) active.controller = new AbortController()
    },
    async close() {
      closed = true; epoch++; candidate?.abort(cancelled()); active?.controller.abort(cancelled())
      invalidate()
      await deps.vault.flush()
      if (active) await active.session.dispose()
      active = null
    },
    imageOrigin: () => active?.session.imageOrigin ?? ''
  }
}
export type AccountService = ReturnType<typeof createAccountService>
