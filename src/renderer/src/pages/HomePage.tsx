import React from 'react'
import {
  makeStyles,
  tokens,
  TabList,
  Tab,
  Text,
  Skeleton,
  SkeletonItem,
  Spinner,
  Button
} from '@fluentui/react-components'
import { useAppStore } from '../stores/appStore'
import { toJmImg } from '../utils/image'

const useStyles = makeStyles({
  root: {
    padding: '24px',
    height: '100%',
    overflow: 'auto'
  },
  tabs: {
    marginBottom: '24px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  card: {
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: tokens.shadow8
    }
  },
  cardImage: {
    display: 'block',
    width: '100%',
    aspectRatio: '3/4',
    objectFit: 'cover',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: '20px',
    maxHeight: '40px',
    marginTop: '8px',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    color: tokens.colorNeutralForeground1
  },
  cardMeta: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    marginTop: '4px'
  },
  statusMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
    color: tokens.colorNeutralForeground3,
    gap: '16px'
  },
  shimmerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  shimmerCard: {
    aspectRatio: '3/4',
    borderRadius: tokens.borderRadiusMedium
  }
})

interface MangaCardData {
  id: string
  title: string
  coverUrl: string
  author?: string
  latestChapter?: string
}

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

function MangaCard({ manga }: { manga: MangaCardData }): JSX.Element {
  const styles = useStyles()
  const setCurrentMangaId = useAppStore((s) => s.setCurrentMangaId)
  return (
    <div
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={() => setCurrentMangaId(manga.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') setCurrentMangaId(manga.id) }}
    >
      <img
        className={styles.cardImage}
        src={toJmImg(manga.coverUrl)}
        alt={manga.title}
        loading="lazy"
      />
      <div className={styles.cardTitle}>{manga.title}</div>
      <div className={styles.cardMeta}>
        {manga.author ? `${manga.author}` : ''}
        {manga.latestChapter ? ` · ${manga.latestChapter}` : ''}
      </div>
    </div>
  )
}

export default function HomePage(): JSX.Element {
  const styles = useStyles()
  const [tab, setTab] = React.useState<'recommended' | 'latest' | 'popular'>('recommended')
  const [loading, setLoading] = React.useState(true)
  const [warmingUp, setWarmingUp] = React.useState(true)
  // All three tabs share the same card list — extracted once
  const [allCards, setAllCards] = React.useState<MangaCardData[]>([])
  const [error, setError] = React.useState('')
  const [debugInfo, setDebugInfo] = React.useState('')

  React.useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      setLoading(true)
      setError('')
      setWarmingUp(true)

      // Wait for warmup
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

      if (cancelled) return
      setWarmingUp(false)

      // Fetch homepage once for all tabs
      try {
        const result = await window.electronAPI?.contentHomepage()
        if (cancelled) return

        if (result?.ok) {
          const data = result.data as { recommended: MangaCardData[]; latest: MangaCardData[]; popular: MangaCardData[] }
          // Merge all sections, deduplicate by id
          const seen = new Set<string>()
          const merged: MangaCardData[] = []
          for (const card of [
            ...(data.recommended || []),
            ...(data.latest || []),
            ...(data.popular || [])
          ]) {
            if (!seen.has(card.id)) {
              seen.add(card.id)
              merged.push(card)
            }
          }
          setAllCards(merged)

          if (merged.length === 0) {
            setDebugInfo((result as any).debug ?? '')
            setError(`解析到 ${(result as any).total ?? 0} 个条目但筛选后为空。\n\n调试信息:\n${(result as any).debug ?? ''}`)
          }
        } else {
          setDebugInfo((result as any)?.debug ?? '')
          setError((result?.error || '获取内容失败') + (((result as any)?.debug) ? `\n\n调试:\n${(result as any).debug}` : ''))
        }
      } catch (err) {
        if (!cancelled) setError(String(err))
      }

      if (!cancelled) setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, []) // Fetch once — tab switching just filters from cache

  if (warmingUp) {
    return (
      <div className={styles.root}>
        <div className={styles.statusMsg}>
          <Spinner size="large" />
          <Text size={500} weight="semibold">正在建立安全连接...</Text>
          <Text size={300} style={{ opacity: 0.7, maxWidth: '420px', textAlign: 'center' }}>
            请在弹出的窗口中完成安全验证
          </Text>
          <Text size={200} style={{ opacity: 0.5 }}>
            验证成功后窗口会自动关闭并开始加载内容
          </Text>
          <Button
            appearance="secondary"
            size="small"
            style={{ marginTop: '12px' }}
            onClick={() => window.location.reload()}
          >
            未弹出窗口？点此重试
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
            color: tokens.colorNeutralForeground3, whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', background: tokens.colorNeutralBackground1,
            padding: '12px', borderRadius: tokens.borderRadiusMedium,
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
          {allCards.map((m) => (
            <MangaCard key={m.id} manga={m} />
          ))}
        </div>
      )}
    </div>
  )
}
