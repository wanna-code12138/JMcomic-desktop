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
import { MangaCard, type MangaCardData } from '../components'
import { useAppStore } from '../stores/appStore'

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
    '& .fui-TabList': {
      gap: '6px'
    },
    '& .fui-Tab': {
      borderRadius: 'var(--ac-radius-row)',
      color: 'var(--ac-text-3)',
      fontSize: '14px',
      padding: '6px 14px'
    },
    '& .fui-Tab:hover': {
      backgroundColor: 'var(--ac-glass-bg-hover)',
      color: 'var(--ac-text-2)'
    },
    '& .fui-Tab--selected': {
      backgroundColor: 'var(--ac-glass-bg-hover)',
      color: 'var(--ac-brand)',
      fontWeight: 600,
      boxShadow:
        'var(--ac-clay-shadow-dark), var(--ac-clay-shadow-light), var(--ac-clay-inset-border)'
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
    color: 'var(--ac-text-3)',
    gap: '16px'
  },
  shimmerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  shimmerCard: {
    aspectRatio: '3/4',
    borderRadius: 'var(--ac-radius-card)'
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
  const [tab, setTab] = React.useState<'recommended' | 'latest' | 'popular'>('recommended')
  const [loading, setLoading] = React.useState(true)
  const [warmingUp, setWarmingUp] = React.useState(true)
  const [allCards, setAllCards] = React.useState<MangaCardData[]>([])
  const loadedTabs = React.useRef(new Set<string>())
  const [sections, setSections] = React.useState<{
    recommended: MangaCardData[]
    latest: MangaCardData[]
    popular: MangaCardData[]
  }>({ recommended: [], latest: [], popular: [] })
  const [error, setError] = React.useState('')
  const [debugInfo, setDebugInfo] = React.useState('')

  const handleCardClick = React.useCallback((mangaId: string) => {
    if (mangaId === '__random__') {
      if (allCards.length === 0) return
      const idx = Math.floor(Math.random() * allCards.length)
      setCurrentMangaId(allCards[idx].id)
    } else {
      setCurrentMangaId(mangaId)
    }
  }, [allCards, setCurrentMangaId])

  const fetchCategory = React.useCallback(async (category: 'recommended' | 'latest' | 'popular', cancelled: { current: boolean }) => {
    if (loadedTabs.current.has(category)) return

    try {
      const result = await window.electronAPI?.contentHomepage(category)
      if (cancelled.current) return

      if (result?.ok) {
        const data = result.data as MangaCardData[]

        if (data.length === 0) {
          if (cancelled.current) return
          setDebugInfo((result as any).debug ?? '')
          setError(`"${category === 'recommended' ? '推荐' : category === 'latest' ? '最新' : '热门'}"分类暂无可显示的内容。\n\n调试信息:\n${(result as any).debug ?? ''}`)
          return
        }

        if (cancelled.current) return
        setSections((prev) => ({ ...prev, [category]: data }))
        setAllCards((prev) => {
          const seen = new Set(prev.map((c) => c.id))
          const newCards = data.filter((c) => !seen.has(c.id))
          return [...prev, ...newCards]
        })
        loadedTabs.current.add(category)
      } else {
        if (cancelled.current) return
        setDebugInfo((result as any)?.debug ?? '')
        setError((result?.error || '获取内容失败') + (((result as any)?.debug) ? `\n\n调试:\n${(result as any).debug}` : ''))
      }
    } catch (err) {
      if (!cancelled.current) setError(String(err))
    }
  }, [])

  // Load current tab on mount and when tab switches
  React.useEffect(() => {
    const cancelled = { current: false }
    setError('')

    async function load(): Promise<void> {
      setLoading(true)

      // Warmup only on first load
      if (loadedTabs.current.size === 0) {
        setWarmingUp(true)
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

        if (cancelled.current) return
        setWarmingUp(false)
      }

      await fetchCategory(tab, cancelled)
      if (!cancelled.current) setLoading(false)
    }

    if (!loadedTabs.current.has(tab)) {
      load()
    } else {
      setLoading(false)
    }

    return () => { cancelled.current = true }
  }, [tab, fetchCategory])

  if (warmingUp) {
    return (
      <div className={styles.root}>
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
    <div className={styles.root}>
      <div className={styles.tabs}>
        <TabList selectedValue={tab} onTabSelect={(_e, d) => setTab(d.value as typeof tab)}>
          <Tab value="recommended">推荐</Tab>
          <Tab value="latest">最新</Tab>
          <Tab value="popular">热门</Tab>
        </TabList>
      </div>

      {loading ? (
        <div className={styles.shimmerGrid}>
          {Array.from({ length: 12 }).map((_, i) => (
            <MangaCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className={styles.statusMsg}>
          <Text size={500} weight="semibold">⚠️ 内容加载失败</Text>
          <pre style={{
            maxWidth: '600px', textAlign: 'left', fontSize: '12px',
            color: 'var(--ac-text-3)', whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', background: 'var(--ac-glass-bg)',
            padding: '12px', borderRadius: 'var(--ac-radius-row)',
            maxHeight: '300px', overflow: 'auto'
          }}>{error}</pre>
          <Text size={200} style={{ opacity: 0.5 }}>
            请确认：1. 网络已连接  2. 代理已开启  3. 在浏览器中能打开 18comic.vip
          </Text>
        </div>
      ) : allCards.length === 0 ? (
        <div className={styles.statusMsg}>
          <Text size={400}>暂无内容</Text>
          <Text size={200} style={{ opacity: 0.6 }}>请尝试切换到其他分类或进行搜索</Text>
        </div>
      ) : (
        <div className={styles.grid}>
          {[RANDOM_CARD, ...sections[tab]].map((m, i) => (
            <MangaCard key={m.id} manga={m} onClick={handleCardClick} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
