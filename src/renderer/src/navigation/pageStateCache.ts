export type PrimaryPageId =
  | 'home'
  | 'search'
  | 'categories'
  | 'favorites'
  | 'history'
  | 'downloads'
  | 'settings'

export interface PageSnapshot {
  scrollTop?: number
  page?: number
  filters?: Record<string, unknown>
  tab?: string
  timestamp?: number
}

export interface PageCacheState {
  mounted: readonly PrimaryPageId[]
  snapshots: Readonly<Record<string, PageSnapshot>>
}

export function createPageCacheState(initialPage: PrimaryPageId): PageCacheState {
  return {
    mounted: Object.freeze([initialPage]),
    snapshots: Object.freeze({})
  }
}

export function touchPage(
  state: PageCacheState,
  page: PrimaryPageId,
  limit = 3
): PageCacheState {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError('Page cache limit must be a positive integer')
  }

  // 移出已有位置，并放置在末尾（最最近访问 MRU）
  const remaining = state.mounted.filter((p) => p !== page)
  const nextMounted = [...remaining, page]

  // 若超出限制，从头部（LRU）开始淘汰
  while (nextMounted.length > limit) {
    nextMounted.shift()
  }

  return {
    mounted: Object.freeze(nextMounted),
    snapshots: state.snapshots
  }
}

export function saveSnapshot(
  state: PageCacheState,
  page: PrimaryPageId,
  snapshot: PageSnapshot
): PageCacheState {
  const clonedSnapshot: PageSnapshot = structuredClone(snapshot)

  return {
    mounted: state.mounted,
    snapshots: Object.freeze({
      ...state.snapshots,
      [page]: clonedSnapshot
    })
  }
}

export function takeSnapshot(
  state: PageCacheState,
  page: PrimaryPageId
): PageSnapshot | undefined {
  const snapshot = state.snapshots[page]
  if (!snapshot) return undefined
  return structuredClone(snapshot)
}
