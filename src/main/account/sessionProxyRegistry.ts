export type SessionProxyConfig = { mode: 'system' | 'fixed_servers'; proxyRules?: string }
export interface ProxySession {
  setProxy(config: SessionProxyConfig): Promise<void>
  closeAllConnections(): Promise<void>
}
export function createSessionProxyRegistry() {
  const targets = new Set<ProxySession>()
  let current: SessionProxyConfig = { mode: 'system' }
  let pause = (_paused: boolean): void => {}
  let pending: Promise<unknown> = Promise.resolve()
  const queue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation); pending = result.catch(() => {}); return result
  }
  return {
    onPause(handler: (paused: boolean) => void) { pause = handler },
    register: (target: ProxySession): Promise<() => void> => queue(async () => {
      await target.setProxy(current); targets.add(target)
      return () => { targets.delete(target) }
    }),
    apply: (config: SessionProxyConfig, primary: ProxySession) => queue(async () => {
      const all = [...new Set([primary, ...targets])]
      pause(true)
      let resume = true
      try {
        for (const target of all) { await target.setProxy(config); await target.closeAllConnections() }
        current = { ...config }
      } catch (error) {
        const rollback = await Promise.allSettled(all.map(async target => { await target.setProxy(current); await target.closeAllConnections() }))
        resume = rollback.every(result => result.status === 'fulfilled')
        throw error
      } finally { if (resume) pause(false) }
    })
  }
}
export const accountProxyRegistry = createSessionProxyRegistry()
