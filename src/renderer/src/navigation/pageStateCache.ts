export type PrimaryPageId =
  | 'home'
  | 'search'
  | 'categories'
  | 'favorites'
  | 'history'
  | 'downloads'
  | 'settings'
  | 'account'

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

let globalPageCache = createPageCacheState('home')


import React from 'react'

export function usePageSnapshot<TFilters = Record<string, unknown>>(
  pageId: PrimaryPageId,
  scrollRef: React.RefObject<HTMLElement | null>,
  captureFilters?: () => TFilters,
  restoreFilters?: (filters: TFilters) => void
): { snapshot: PageSnapshot | undefined; saveCurrentSnapshot: () => void } {
  const isRestoredRef = React.useRef(false)

  const saveCurrentSnapshot = React.useCallback(() => {
    const scrollTop = scrollRef.current?.scrollTop ?? 0
    const filters = captureFilters?.() as Record<string, unknown> | undefined
    globalPageCache = saveSnapshot(globalPageCache, pageId, {
      scrollTop,
      filters
    })
  }, [captureFilters, pageId, scrollRef])

  React.useEffect(() => {
    const snapshot = takeSnapshot(globalPageCache, pageId)
    if (snapshot && !isRestoredRef.current) {
      isRestoredRef.current = true
      if (snapshot.filters && restoreFilters) {
        restoreFilters(snapshot.filters as TFilters)
      }
      if (typeof snapshot.scrollTop === 'number' && snapshot.scrollTop > 0) {
        const targetScroll = snapshot.scrollTop
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = targetScroll
          }
          if (scrollRef.current && scrollRef.current.scrollHeight < targetScroll) {
            let tried = false
            const ro = new ResizeObserver(() => {
              if (tried) return
              if (scrollRef.current && scrollRef.current.scrollHeight >= targetScroll) {
                tried = true
                scrollRef.current.scrollTop = targetScroll
                ro.disconnect()
              }
            })
            ro.observe(scrollRef.current)
            setTimeout(() => ro.disconnect(), 1000)
          }
        })
      }
    }

    return () => {
      saveCurrentSnapshot()
    }
  }, [pageId, restoreFilters, saveCurrentSnapshot, scrollRef])

  return {
    snapshot: takeSnapshot(globalPageCache, pageId),
    saveCurrentSnapshot
  }
}
