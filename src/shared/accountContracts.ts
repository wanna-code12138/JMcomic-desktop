export type AccountPhase = 'anonymous' | 'authenticating' | 'restoring' | 'authenticated' | 'verification-required' | 'expired'
export interface AccountProfile {
  uid: string
  username: string
  nickname: string
  level: string | null
  coins: number | null
  experience: number | null
  favorites: number | null
  favoriteLimit: number | null
  checkedAt: number
}
export interface AccountState {
  phase: AccountPhase
  generation: number
  profile: AccountProfile | null
  remembered: boolean
  message?: string
}
export type AccountErrorCode = 'AUTH_REQUIRED' | 'EXPIRED' | 'CANCELLED' | 'CHALLENGE' | 'RATE_LIMITED'
  | 'NETWORK' | 'PROTOCOL' | 'INVALID_INPUT' | 'INVALID_CREDENTIALS' | 'STORAGE' | 'UNAVAILABLE'
  | 'OUTCOME_UNKNOWN' | 'CONFLICT' | 'BUSY' | 'FORBIDDEN'
export type AccountReply<T> = { ok: true; data: T } | { ok: false; code: AccountErrorCode; error: string }
export interface OnlineAlbum { id: string; title: string; coverUrl: string; author: string; date: string }
export interface FavoriteFolder { id: string; name: string; count: number | null }
export interface OnlineLibraryPage {
  items: OnlineAlbum[]
  page: number
  total: number | null
  hasMore: boolean
  folders: FavoriteFolder[]
}
export type LibraryKind = 'favorites' | 'history' | 'tracking'
export interface AccountNotice { id: string; title: string; text: string; date: string; read: boolean }
export interface AccountNotifications { items: AccountNotice[]; unread: number | null }
export interface AlbumAccountState { id: string; favorite: boolean | null; tracking: boolean | null; liked?: boolean | null }
export interface AccountScope { generation: number }
export interface LibraryQuery extends AccountScope { kind: LibraryKind; page: number; folderId?: string }
export interface AlbumMutation extends AccountScope { id: string; kind: 'favorite' | 'tracking' | 'liked'; desired: boolean; operationId: string }

export interface CommentSubmission extends AccountScope { albumId: string; parentId: string; text: string; operationId: string }
export interface DailyState { id: string; title: string; progress: string; days: { date: string; signed: boolean | null; bonus: boolean }[] }
export interface DailyResult { status: 'signed' | 'already'; calendar: DailyState | null }
export interface DailyMonth { id: string; year: string; month: string; image: string }
export interface AccountTask { id: string; name: string; text: string; done: boolean | null }
