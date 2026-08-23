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
import { ArrowSync20Regular } from '@fluentui/react-icons'
import { MangaCard, type MangaCardData } from '../components'
import { useAppStore } from '../stores/appStore'
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

const RANDOM_COVER = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400">'
  + '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">'
  + '<stop offset="0%" stop-color="#667eea"/><stop offset="100%" stop-color="#764ba2"/>'
  + '</linearGradient></defs>'
  + '<rect width="300" height="400" fill="url(#g)"/>'
  + '<text x="150" y="180" text-anchor="middle" font-size="64" fill="white" font-family="sans-serif">?</text>'
  + '<text x="150" y="230" text-anchor="middle" font-size="22" fill="rgba(255,255,255,0.85)" font-family="sans-serif">随便看</text>'
  + '</svg>'
)

const RANDOM_CARD: MangaCardData = {
  id: '__random__',
  title: '随便看',
  coverUrl: RANDOM_COVER,
  author: '随机打开一个本子'
}

const useStyles = makeStyles({
  root: {
    padding: '24px',
    height: '100%',
    overflow: 'auto'
  },
  tabs: {
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    '& .fui-TabList': {
      gap: '6px'
    },
    '& .fui-Tab': {
      borderRadius: 'var(--ui-radius-lg)',
      color: 'var(--ui-text-tertiary)',
      fontSize: '14px',
      padding: '6px 14px'
    },
    '& .fui-Tab:hover': {
      backgroundColor: 'var(--ui-bg-hover)',
      color: 'var(--ui-text-secondary)'
    },
    '& .fui-Tab--selected': {
      backgroundColor: 'var(--ui-bg-selected)',
      color: 'var(--ui-brand)',
      fontWeight: 600
    }
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  statusMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
    color: 'var(--ui-text-tertiary)',
    gap: '16px'
  },
  shimmerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
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
  const [warmingUp, setWarmingUp] = React.useState(true)
  const [recommendationRefreshing, setRecommendationRefreshing] = React.useState(false)
  const [recommendationFeed, setRecommendationFeed] = React.useState<MangaCardData[]>([])
  const [recommendationVisibleCount, setRecommendationVisibleCount] = React.useState(0)
  const [allCards, setAllCards] = React.useState<MangaCardData[]>([])
  const loadedTabs = React.useRef(new Set<string>())
  const streamOff = React.useRef<(() => void) | null>(null)
  const rootRef = React.useRef<HTMLDivElement | null>(null)
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
    if (mangaId === '__random__') {
      if (allCards.length === 0) return
      const idx = Math.floor(Math.random() * allCards.length)
      setCurrentMangaId(allCards[idx].id)
    } else {
      setCurrentMangaId(mangaId)
    }
  }, [allCards, setCurrentMangaId])

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
        setAllCards((prev) => {
          const seen = new Set(prev.map((c) => c.id))
          const newCards = cards.filter((c) => !seen.has(c.id))
          return [...prev, ...newCards]
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
      setAllCards((previous) => {
        const seen = new Set(previous.map((card) => card.id))
        return [...previous, ...feed.filter((card) => !seen.has(card.id))]
      })
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

  // Warm up the shared session once. Recommendation candidates use the same
  // verified cookies even when their list requests take the direct fast path.
  React.useEffect(() => {
    let cancelled = false
    async function warmup(): Promise<void> {
      try {
        if (window.electronAPI) {
          const status = await window.electronAPI.contentWarmupStatus()
          if (!status.warmedUp) {
            await new Promise<void>((resolve) => {
              const unsub = window.electronAPI!.onWarmupDone(() => {
                unsub()
                resolve()
              })
              setTimeout(resolve, 35000)
            })
          }
        }
      } catch { /* proceed */ }
      if (!cancelled) setWarmingUp(false)
    }
    void warmup()
    return () => { cancelled = true }
  }, [])

  // Load the selected tab only while the kept-alive Home page is visible.
  React.useEffect(() => {
    if (warmingUp || currentPage !== 'home') return
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
  }, [currentPage, fetchCategory, loadRecommendations, recommendationRevision, tab, warmingUp])

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

  const visibleCards = tab === 'recommended'
    ? recommendationFeed.slice(0, recommendationVisibleCount)
    : sections[tab]
  const activeLoadingMore = tab !== 'recommended' && loadingMore

  if (warmingUp) {
    return (
      <div className={styles.root} ref={rootRef}>
        <div className={styles.statusMsg}>
          <Spinner size="large" />
          <Text size={500} weight="semibold">正在建立安全连接...</Text>
          <Text size={300} style={{ opacity: 0.7, maxWidth: '420px', textAlign: 'center' }}>
            请在上方完成安全验证
          </Text>
          <Text size={200} style={{ opacity: 0.5 }}>
            验证成功后将自动开始加载内容
          </Text>
          <Button
            appearance="secondary"
            size="small"
            style={{ marginTop: '12px' }}
            onClick={() => window.location.reload()}
          >
            验证卡住？点此重试
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root} ref={rootRef}>
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
          <Text size={500} weight="semibold">⚠️ 内容加载失败</Text>
          <pre style={{
            maxWidth: '600px', textAlign: 'left', fontSize: '12px',
            color: 'var(--ui-text-tertiary)', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', background: 'var(--ui-bg-card)',
            padding: '12px', borderRadius: 'var(--ui-radius-lg)',
            border: '1px solid var(--ui-stroke-card)',
            maxHeight: '300px', overflow: 'auto'
          }}>{error}</pre>
          <Text size={200} style={{ opacity: 0.5 }}>
            请确认：1. 网络已连接  2. 代理已开启  3. 在浏览器中能打开 18comic.vip
          </Text>
        </div>
      ) : !loading && !activeLoadingMore && visibleCards.length === 0 ? (
        <div className={styles.statusMsg}>
          <Text size={400}>暂无内容</Text>
          <Text size={200} style={{ opacity: 0.6 }}>请尝试切换到其他分类或进行搜索</Text>
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
              ⚠️ {error}
            </div>
          )}
          <div className={styles.grid}>
            {[RANDOM_CARD, ...visibleCards].map((m, i) => (
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
