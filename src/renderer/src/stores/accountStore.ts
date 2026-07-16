import { create } from 'zustand'

type PersistMode = 'cookie' | 'credential'

interface AccountState {
  loggedIn: boolean
  username: string | null
  persistMode: PersistMode
  validating: boolean
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  validateOnStartup: () => Promise<void>
  setPersistMode: (mode: PersistMode) => Promise<void>
}

export const useAccountStore = create<AccountState>((set) => ({
  loggedIn: false,
  username: null,
  persistMode: 'cookie',
  validating: false,

  login: async (username: string, password: string): Promise<boolean> => {
    const result = await window.electronAPI?.contentLogin(username, password)
    if (result?.success) {
      set({ loggedIn: true, username })
      return true
    }
    return false
  },

  logout: async (): Promise<void> => {
    await window.electronAPI?.accountLogout()
    set({ loggedIn: false, username: null })
  },

  validateOnStartup: async (): Promise<void> => {
    set({ validating: true })
    try {
      const status = await window.electronAPI?.accountGetStatus()
      if (status?.loggedIn && status.username) {
        set({ loggedIn: true, username: status.username, persistMode: status.persistMode })
        // 静默校验 cookie 有效性（凭据模式会自动重登）
        const result = await window.electronAPI?.accountValidateSession()
        if (result?.valid && result.username) {
          set({ loggedIn: true, username: result.username })
        } else {
          set({ loggedIn: false, username: null })
        }
      } else if (status?.persistMode) {
        set({ persistMode: status.persistMode })
      }
    } catch (e) {
      console.error('[accountStore] validateOnStartup failed:', e)
    } finally {
      set({ validating: false })
    }
  },

  setPersistMode: async (mode: PersistMode): Promise<void> => {
    await window.electronAPI?.authSetPersistMode(mode)
    set({ persistMode: mode })
  }
}))
