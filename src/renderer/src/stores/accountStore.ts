import { create } from 'zustand'
import type { AccountState } from '../../../shared/accountContracts'

export const useAccountStore = create<{ state: AccountState; accept(state: AccountState): void }>((set, get) => ({
  state: { phase: 'anonymous', generation: 0, profile: null, remembered: false },
  accept(state) { if (state.generation >= get().state.generation) set({ state }) }
}))

export function installAccountState(): () => void {
  let changed = false, stopped = false
  const off = window.electronAPI?.onAccountChanged(state => { changed = true; useAccountStore.getState().accept(state) })
  void window.electronAPI?.accountState().then(reply => {
    if (!stopped && !changed && reply.ok) useAccountStore.getState().accept(reply.data)
  }).catch(() => {})
  return () => { stopped = true; off?.() }
}
