import type { AccountService } from './accountService'
import { AccountError } from './accountErrors'

export function createAccountOperations(service: AccountService) {
  const queues = new Map<string, Promise<unknown>>()
  const operations = new Map<string, { fingerprint: string; promise: Promise<unknown> }>()
  let cacheGeneration = -1
  const clear = (): void => { operations.clear(); queues.clear(); cacheGeneration = -1 }
  service.onInvalidate?.(clear)
  function scope(generation: number): void {
    const state = service.getState()
    if (generation !== state.generation) throw new AccountError('CANCELLED')
    if (state.phase !== 'authenticated') throw new AccountError('AUTH_REQUIRED')
    if (cacheGeneration !== generation) { clear(); cacheGeneration = generation }
  }
  function operate<T>(generation: number, operationId: string, resource: string, fingerprint: string, work: () => Promise<T>): Promise<T> {
    scope(generation)
    if (typeof operationId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(operationId)) throw new AccountError('INVALID_INPUT')
    const operationKey = `${generation}:${operationId}`, resourceKey = `${generation}:${resource}`
    const old = operations.get(operationKey)
    if (old) {
      if (old.fingerprint !== fingerprint) throw new AccountError('INVALID_INPUT')
      return old.promise as Promise<T>
    }
    if (queues.size >= 100) throw new AccountError('BUSY')
    const promise = (queues.get(resourceKey) ?? Promise.resolve()).catch(() => {}).then(async () => { scope(generation); const result = await work(); scope(generation); return result })
    queues.set(resourceKey, promise); operations.set(operationKey, { fingerprint, promise })
    void promise.finally(() => {
      if (queues.get(resourceKey) === promise) queues.delete(resourceKey)
      while (operations.size > 200) operations.delete(operations.keys().next().value!)
    }).catch(() => {})
    return promise
  }
  return { scope, operate }
}
