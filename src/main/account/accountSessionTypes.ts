import type { AccountProfile } from '../../shared/accountContracts'
import type { AccountTransport } from './accountTransport'

export interface SavedCookie {
  name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean;
  expirationDate?: number; sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}
export interface SavedAccountSession {
  version: 1
  origin: string
  profileId: string
  appVersion: string
  imageOrigin: string
  profile: AccountProfile
  cookies: SavedCookie[]
}
export interface AccountSession extends AccountTransport {
  readonly id: string
  readonly origin: string
  readonly imageOrigin: string
  readonly profileId: string
  readonly appVersion: string
  installAvs(value: string): Promise<void>
  snapshot(profile: AccountProfile): Promise<SavedAccountSession>
  dispose(): Promise<void>
}
export interface AccountVault {
  load(): Promise<SavedAccountSession | null>
  save(value: SavedAccountSession): Promise<void>
  clear(): Promise<void>
  flush(): Promise<void>
}
