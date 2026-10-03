import React from 'react'
import {
  makeStyles,
  TabList,
  Tab,
  Text,
  Skeleton,
  SkeletonItem,
  Spinner,
  Button
} from '@fluentui/react-components'
import { ArrowSync20Regular, Warning20Regular, Library20Regular } from '@fluentui/react-icons'
import { contentTabRow, emptyState } from '../theme/surfaceStyles'
import { MangaCard, type MangaCardData } from '../components'
import { useAppStore } from '../stores/appStore'
import { usePageSnapshot } from '../navigation/pageStateCache'
import type { WarmupState } from '../../../shared/sessionWarmupContracts'
import {
  buildRecommendationFeed,
  nextRecommendationVisibleCount,
  pruneRecommendationExposures,
  recordRecommendationExposures,
  type RecommendationExposure,
  type RecommendationPool
} from '../../../shared/recommendationCore'

const RECOMMENDATION_EXPOSURE_KEY = 'jmcomic:recommendation-exposures:v1'

function readRecommendationExposures(): RecommendationExposure[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECOMMENDATION_EXPOSURE_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is RecommendationExposure => Boolean(
      value && typeof value === 'object'
      && typeof (value as RecommendationExposure).id === 'string'
      && Number.isFinite((value as RecommendationExposure).exposedAt)
    ))
  } catch {
    return []
  }
}

function writeRecommendationExposures(exposures: RecommendationExposure[]): void {
  localStorage.setItem(RECOMMENDATION_EXPOSURE_KEY, JSON.stringify(exposures))
}

const useStyles = makeStyles({
  root: {
    padding: '24px',
    height: '100%',
    overflow: 'auto'
  },
  tabs: {
    ...contentTabRow,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  statusMsg: emptyState,
  shimmerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  verificationNotice: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '12px 16px',
    marginBottom: '16px',
    borderRadius: 'var(--ui-radius-lg)',
    backgroundColor: 'var(--ui-bg-card)',
    color: 'var(--ui-text-secondary)'
  },
  shimmerCard: {
    aspectRatio: '3/4',
    borderRadius: 'var(--ui-radius-md)'
  }
})

function MangaCardSkeleton(): JSX.Element {
  const styles = useStyles()
  return (
    <div>
      <Skeleton><SkeletonItem className={styles.shimmerCard} /></Skeleton>
      <Skeleton style={{ marginTop: '8px' }}><SkeletonItem style={{ height: '14px', width: '80%' }} /></Skeleton>
      <Skeleton style={{ marginTop: '4px' }}><SkeletonItem style={{ height: '12px', width: '50%' }} /></Skeleton>
    </div>
  )
}

export default function HomePage(): JSX.Element {
  const styles = useStyles()
  const setCurrentMangaId = useAppStore((s) => s.setCurrentMangaId)
  const currentPage = useAppStore((s) => s.currentPage)
  const recommendationRevision = useAppStore((s) => s.recommendationRevision)
  const [tab, setTab] = React.useState<'recommended' | 'latest' | 'popular'>('recommended')
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [warmupState, setWarmupState] = React.useState<WarmupState>({ phase: 'idle' })
  const verificationPassed = warmupState.phase === 'verified'
  const [recommendationRefreshing, setRecommendationRefreshing] = React.useState(false)
  const [recommendationFeed, setRecommendationFeed] = React.useState<MangaCardData[]>([])
  const [recommendationVisibleCount, setRecommendationVisibleCount] = React.useState(0)
  const loadedTabs = React.useRef(new Set<string>())
  const streamOff = React.useRef<(() => void) | null>(null)
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  usePageSnapshot('home', rootRef, () => ({ tab }), (filters: any) => {
    if (filters?.tab) setTab(filters.tab)
  })
  const bottomSentinelRef = React.useRef<HTMLDivElement | null>(null)
  const recommendationTagOffset = React.useRef(0)
  const recommendationSeed = React.useRef(Date.now())
  const recommendationRequestId = React.useRef(0)
  const appliedRecommendationRevision = React.useRef(recommendationRevision)
  const [sections, setSections] = React.useState<{
    recommended: MangaCardData[]
    latest: MangaCardData[]
    popular: MangaCardData[]
  }>({ recommended: [], latest: [], popular: [] })
  const [error, setError] = React.useState('')

  const handleCardClick = React.useCallback((mangaId: string) => {
    setCurrentMangaId(mangaId)
  }, [setCurrentMangaId])

  const fetchCategory = React.useCallback((category: 'latest' | 'popular', cancelled: { current: boolean }) => {
    if (loadedTabs.current.has(category)) return

    let hasCards = false
    const off = window.electronAPI?.onHomepageBatch((payload) => {
      if (payload.category !== category) return

      if (cancelled.current) {
        off?.()
        return
      }

      if (payload.error) {
        off?.()
        setLoadingMore(false)
        setLoading(false)
        if (!hasCards) {
          setError(payload.error)
        }
        return
      }

      const cards = payload.cards as unknown as MangaCardData[]
      if (cards.length > 0) {
        hasCards = true
        setSections((prev) => {
          const seen = new Set(prev[category].map((c) => c.id))
          const newCards = cards.filter((c) => !seen.has(c.id))
          return { ...prev, [category]: [...prev[category], ...newCards] }
        })
        setLoading(false)
      }

      if (payload.done) {
        off?.()
        setLoadingMore(false)
        setLoading(false)
        if (!hasCards) {
          setError(`"${category === 'latest' ? '最新' : '热门'}"分类暂无可显示的内容，请切换其它分类或重试。`)
        } else {
          loadedTabs.current.add(category)
        }
      }
    })

    streamOff.current = off ?? null
    setLoadingMore(true)
    window.electronAPI?.contentHomepageStream(category)
  }, [])

  const loadRecommendations = React.useCallback(async (refresh: boolean): Promise<void> => {
    const requestId = ++recommendationRequestId.current
    if (refresh) setRecommendationRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const response = await window.electronAPI?.contentRecommendations(recommendationTagOffset.current)
      if (requestId !== recommendationRequestId.current) return
      if (!response?.ok) throw new Error(String(response?.error ?? '推荐候选加载失败'))

      const now = Date.now()
      const exposures = pruneRecommendationExposures(readRecommendationExposures(), now)
      recommendationSeed.current += 1
      const feed = buildRecommendationFeed(
        response.pools as RecommendationPool[],
        exposures,
        { now, seed: recommendationSeed.current }
      ) as MangaCardData[]
      if (feed.length === 0) throw new Error('暂无可显示的推荐内容')

      recommendationTagOffset.current = Number(response.nextTagOffset ?? 0)
      setRecommendationFeed(feed)
      setRecommendationVisibleCount(nextRecommendationVisibleCount(0, feed.length))
      loadedTabs.current.add('recommended')
    } catch (err) {
      if (requestId === recommendationRequestId.current) setError(String(err))
    } finally {
      if (requestId === recommendationRequestId.current) {
        setLoading(false)
        setRecommendationRefreshing(false)
      }
    }
  }, [])

  // 观察验证状态，但不阻塞首页优先加载缓存与 API 内容
  React.useEffect(() => {
    let cancelled = false
    async function checkWarmup(): Promise<void> {
      try {
        if (window.electronAPI?.contentWarmupStatus) {
          const res = await window.electronAPI.contentWarmupStatus()
          if (!cancelled) setWarmupState(res)
        }
      } catch { /* proceed */ }
    }
    void checkWarmup()

    const unsub = window.electronAPI?.onWarmupStateChanged?.((state) => {
      if (!cancelled) setWarmupState(state)
    })

    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])

  // Load the selected tab only while the kept-alive Home page is visible.
  React.useEffect(() => {
    if (currentPage !== 'home') return
    const cancelled = { current: false }
    setError('')

    if (tab === 'recommended') {
      if (appliedRecommendationRevision.current !== recommendationRevision) {
        appliedRecommendationRevision.current = recommendationRevision
        recommendationTagOffset.current = 0
        loadedTabs.current.delete('recommended')
      }
      if (!loadedTabs.current.has('recommended')) void loadRecommendations(false)
      else setLoading(false)
    } else if (!loadedTabs.current.has(tab)) {
      setLoading(true)
      fetchCategory(tab, cancelled)
    } else {
      setLoading(false)
    }

    return () => {
      cancelled.current = true
      if (streamOff.current) {
        streamOff.current()
        streamOff.current = null
      }
      if (tab === 'recommended') recommendationRequestId.current++
      else window.electronAPI?.contentHomepageCancel(tab)
    }
  }, [currentPage, fetchCategory, loadRecommendations, recommendationRevision, tab, verificationPassed])

  React.useEffect(() => {
    if (tab !== 'recommended' || recommendationFeed.length === 0 || recommendationVisibleCount === 0) return
    const now = Date.now()
    const exposures = recordRecommendationExposures(
      readRecommendationExposures(),
      recommendationFeed.slice(0, recommendationVisibleCount).map((card) => card.id),
      now
    )
    writeRecommendationExposures(exposures)
  }, [recommendationFeed, recommendationVisibleCount, tab])

  React.useEffect(() => {
    if (
      currentPage !== 'home'
      || tab !== 'recommended'
      || recommendationVisibleCount >= recommendationFeed.length
      || !bottomSentinelRef.current
    ) return
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setRecommendationVisibleCount((current) =>
        nextRecommendationVisibleCount(current, recommendationFeed.length)
      )
    }, { root: rootRef.current, rootMargin: '320px 0px' })
    observer.observe(bottomSentinelRef.current)
    return () => observer.disconnect()
  }, [currentPage, recommendationFeed.length, recommendationVisibleCount, tab])

  const handleRecommendationRefresh = (): void => {
    loadedTabs.current.delete('recommended')
    void loadRecommendations(true)
  }

  const handleVerificationRetry = async (): Promise<void> => {
    setWarmupState({ phase: 'verifying', attempt: 0, reason: 'manual' })
    try {
      const state = await window.electronAPI!.contentWarmupRetry()
      setWarmupState(state)
    } catch {
      setWarmupState({ phase: 'failed', reason: 'network-error', retryable: true })
    }
  }

  const visibleCards = tab === 'recommended'
    ? recommendationFeed.slice(0, recommendationVisibleCount)
    : sections[tab]
  const activeLoadingMore = tab !== 'recommended' && loadingMore

  if (visibleCards.length === 0 && loading && warmupState.phase === 'verifying') {
    return (
      <div className={styles.root} ref={rootRef}>
        <div className={styles.statusMsg}>
          <Spinner size="large" />
          <Text size={500} weight="semibold">正在建立安全连接...</Text>
          <Text size={300} style={{ color: 'var(--ui-text-secondary)', maxWidth: '420px', textAlign: 'center' }}>
            请在上方完成安全验证
          </Text>
          <Text size={200} style={{ color: 'var(--ui-text-secondary)' }}>
            验证成功后将自动开始加载内容
          </Text>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root} ref={rootRef}>
      {(warmupState.phase === 'failed' || warmupState.phase === 'expired') && (
        <div className={styles.verificationNotice} role="status" data-verification-retry>
          <Text>网页验证未完成，部分在线内容可能暂时无法加载。</Text>
          <Button size="small" onClick={() => void handleVerificationRetry()}>重新验证</Button>
        </div>
      )}
      <div className={styles.tabs}>
        <TabList selectedValue={tab} onTabSelect={(_e, d) => setTab(d.value as typeof tab)}>
          <Tab value="recommended">推荐</Tab>
          <Tab value="latest">最新</Tab>
          <Tab value="popular">热门</Tab>
        </TabList>
        {tab === 'recommended' && (
          <Button
            size="small"
            appearance="secondary"
            icon={<ArrowSync20Regular />}
            disabled={loading || recommendationRefreshing}
            onClick={handleRecommendationRefresh}
          >换一批</Button>
        )}
      </div>

      {loading && visibleCards.length === 0 ? (
        <div className={styles.shimmerGrid}>
          {Array.from({ length: 12 }).map((_, i) => (
            <MangaCardSkeleton key={i} />
          ))}
        </div>
      ) : error && visibleCards.length === 0 ? (
        <div className={styles.statusMsg}>
          <Warning20Regular aria-hidden="true" />
          <Text size={400} weight="semibold">内容加载失败</Text>
          <pre style={{
            maxWidth: '600px', textAlign: 'left', fontSize: '12px',
            color: 'var(--ui-text-tertiary)', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', background: 'var(--ui-bg-card)',
            padding: '12px', borderRadius: 'var(--ui-radius-lg)',
            border: '1px solid var(--ui-stroke-card)',
            maxHeight: '300px', overflow: 'auto'
          }}>{error}</pre>
          <Text size={200} style={{ color: 'var(--ui-text-secondary)' }}>
            请确认：1. 网络已连接  2. 代理已开启  3. 在浏览器中能打开 18comic.vip
          </Text>
        </div>
      ) : !loading && !activeLoadingMore && visibleCards.length === 0 ? (
        <div className={styles.statusMsg}>
          <Library20Regular aria-hidden="true" />
          <Text size={400}>暂无内容</Text>
          <Text size={200}>请尝试切换到其他分类或进行搜索</Text>
        </div>
      ) : (
        <>
          {error && visibleCards.length > 0 && (
            <div style={{
              background: 'var(--ui-bg-card)', borderRadius: 'var(--ui-radius-lg)',
              border: '1px solid var(--ui-stroke-card)',
              padding: '8px 16px', marginBottom: '12px',
              color: 'var(--ui-text-tertiary)', fontSize: '13px'
            }}>
              <Warning20Regular aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '6px' }} />{error}
            </div>
          )}
          <div className={styles.grid}>
            {visibleCards.map((m, i) => (
              <MangaCard key={m.id} manga={m} onClick={handleCardClick} index={i} />
            ))}
          </div>
          {tab === 'recommended' && recommendationVisibleCount < recommendationFeed.length && (
            <div ref={bottomSentinelRef} style={{ height: '1px' }} aria-hidden="true" />
          )}
          {activeLoadingMore && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
              <Spinner size="small" />
              <Text size={200} style={{ marginLeft: '8px', color: 'var(--ui-text-tertiary)' }}>加载更多...</Text>
            </div>
          )}
        </>
      )}
    </div>
  )
}
