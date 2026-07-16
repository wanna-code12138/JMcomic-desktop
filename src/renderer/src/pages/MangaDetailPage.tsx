import React from 'react'
import {
  makeStyles, Text, Button, Badge, Skeleton, SkeletonItem,
  Tooltip, Divider, Spinner
} from '@fluentui/react-components'
import {
  BookOpen20Regular, ArrowDownload20Regular,
  Heart20Regular, Heart20Filled, ArrowLeft20Regular,
  ChevronDown20Regular, ChevronUp20Regular
} from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'
import { toJmImg } from '../utils/image'

const useStyles = makeStyles({
  root: { height: '100%', overflow: 'auto' },
  backBtn: { padding: '12px 32px 0' },
  hero: {
    display: 'flex',
    gap: '32px',
    padding: '32px',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-panel))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-panel))',
    borderBottom: '1px solid var(--ac-glass-border)',
    boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi)'
  },
  coverWrap: {
    width: '240px',
    minWidth: '240px',
    borderRadius: 'var(--ac-radius-cover)',
    overflow: 'hidden',
    boxShadow: '0 10px 28px var(--ac-glass-shadow), inset 0 1px 0 var(--ac-glass-inset-hi)',
    aspectRatio: '3/4',
    border: '1px solid var(--ac-glass-border)',
    backgroundColor: 'var(--ac-base-bg)'
  },
  cover: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  info: { flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: 'var(--ac-text-1)',
    lineHeight: 1.3
  },
  carPlate: {
    fontSize: '13px',
    color: 'var(--ac-text-3)',
    letterSpacing: '0.5px',
    userSelect: 'all',
    cursor: 'text'
  },
  author: { fontSize: '15px', color: 'var(--ac-text-2)' },
  tags: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  tagBadge: {
    backgroundColor: '#7c5cf0',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'transform 0.15s, background-color 0.15s',
    ':hover': {
      transform: 'translateY(-1px)',
      opacity: 0.9
    }
  },
  description: {
    fontSize: '14px',
    color: 'var(--ac-text-2)',
    lineHeight: 1.6
  },
  actions: { display: 'flex', gap: '12px', marginTop: '8px' },
  chaptersSection: { padding: '24px 32px' },
  chapterHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px'
  },
  chapterList: { display: 'flex', flexDirection: 'column', gap: '4px' },
  chapterItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    borderRadius: 'var(--ac-radius-row)',
    cursor: 'pointer',
    transition: 'background-color 0.15s, box-shadow 0.15s',
    gap: '12px',
    ':hover': {
      backgroundColor: 'var(--ac-glass-bg-hover)',
      boxShadow: 'inset 0 0 0 1px var(--ac-glass-border)'
    }
  },
  chapterIndex: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--ac-radius-badge)',
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 12%, transparent)',
    border: '1px solid color-mix(in srgb, var(--ac-brand) 18%, transparent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--ac-brand)',
    flexShrink: 0
  },
  chapterTitle: {
    fontSize: '14px',
    fontWeight: 400,
    color: 'var(--ac-text-1)',
    flex: 1
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px',
    gap: '16px',
    color: 'var(--ac-text-3)'
  }
})

interface DetailData {
  id: string; title: string; author: string; coverUrl: string
  tags: string[]; description: string
  chapters: { index: number; title: string; url: string }[]
}

export default function MangaDetailPage(): JSX.Element {
  const styles = useStyles()
  const currentMangaId = useAppStore((s) => s.currentMangaId)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const previousPage = useAppStore((s) => s.previousPage)
  const openReader = useAppStore((s) => s.openReader)
  const triggerTagSearch = useAppStore((s) => s.triggerTagSearch)
  const [orderAsc, setOrderAsc] = React.useState(false)
  const [liked, setLiked] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [manga, setManga] = React.useState<DetailData | null>(null)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!currentMangaId) return
    let cancelled = false

    async function load(): Promise<void> {
      setLoading(true)
      setError('')
      try {
        const result = await window.electronAPI?.contentDetail(currentMangaId!)
        if (cancelled) return
        if (result?.ok) {
          setManga(result.data as DetailData)
        } else {
          setError(result?.error || '加载失败')
        }
      } catch (err) {
        if (!cancelled) setError(String(err))
      }
      if (!cancelled) setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [currentMangaId])

  React.useEffect(() => {
    if (!currentMangaId) return
    let cancelled = false
    async function checkFav(): Promise<void> {
      const list = await window.electronAPI?.favoritesList()
      if (cancelled) return
      const ids = (list ?? []).map((f: any) => f.manga_id)
      setLiked(ids.includes(currentMangaId))
    }
    checkFav()
    return () => { cancelled = true }
  }, [currentMangaId])

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.backBtn}>
          <Button appearance="subtle" icon={<ArrowLeft20Regular />} onClick={() => setCurrentPage(previousPage || 'home')}>返回</Button>
        </div>
        <div className={styles.center}>
          <Spinner size="large" />
          <Text size={400}>加载中...</Text>
        </div>
      </div>
    )
  }

  if (error || !manga) {
    return (
      <div className={styles.root}>
        <div className={styles.backBtn}>
          <Button appearance="subtle" icon={<ArrowLeft20Regular />} onClick={() => setCurrentPage(previousPage || 'home')}>返回</Button>
        </div>
        <div className={styles.center}>
          <Text size={500} weight="semibold">⚠️ 加载失败</Text>
          <Text size={300}>{error || '未找到漫画数据'}</Text>
        </div>
      </div>
    )
  }

  const chapters = orderAsc ? [...manga.chapters].reverse() : manga.chapters

  return (
    <div className={styles.root}>
      <div className={styles.backBtn}>
        <Button appearance="subtle" icon={<ArrowLeft20Regular />} onClick={() => setCurrentPage(previousPage || 'home')}>返回</Button>
      </div>

      <div className={styles.hero}>
        <div className={styles.coverWrap}>
          {manga.coverUrl ? (
            <img className={styles.cover} src={toJmImg(manga.coverUrl)} alt={manga.title} />
          ) : (
            <div className={styles.cover} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ac-text-3)' }}>
              <BookOpen20Regular style={{ width: '48px', height: '48px' }} />
            </div>
          )}
        </div>
        <div className={styles.info}>
          <h1 className={styles.title}>{manga.title}</h1>
          <div className={styles.carPlate}>车牌号: JM{manga.id}</div>
          <div className={styles.author}>✍️ {manga.author || '未知作者'}</div>
          {manga.tags.length > 0 && (
            <div className={styles.tags}>
              {manga.tags.map((tag) => (
                <Badge
                  key={tag}
                  appearance="tint"
                  size="small"
                  className={styles.tagBadge}
                  role="button"
                  tabIndex={0}
                  onClick={() => triggerTagSearch(tag)}
                  onKeyDown={(e) => { if (e.key === 'Enter') triggerTagSearch(tag) }}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {manga.description && <div className={styles.description}>{manga.description}</div>}
          <div className={styles.actions}>
            {manga.chapters.length > 0 && (
              <Button appearance="primary" size="large" icon={<BookOpen20Regular />}
                onClick={() => openReader({
                  mangaId: manga.id,
                  mangaTitle: manga.title,
                  mangaCoverUrl: manga.coverUrl,
                  chapterIndex: manga.chapters[0].index,
                  chapterTitle: manga.chapters[0].title,
                  chapterUrl: manga.chapters[0].url
                })}
              >
                开始阅读
              </Button>
            )}
            <Button size="large" icon={<ArrowDownload20Regular />}
              onClick={async () => {
                if (!window.electronAPI || manga.chapters.length === 0) return
                // Download first chapter images
                const pagesResult = await window.electronAPI.contentPages(manga.chapters[0].url)
                if (pagesResult?.ok && pagesResult.data) {
                  const pages = pagesResult.data as { imageUrl: string }[]
                  await window.electronAPI.downloadAdd({
                    mangaId: manga.id,
                    mangaTitle: manga.title,
                    chapterIndex: 0,
                    chapterTitle: manga.chapters[0].title,
                    imageUrls: pages.map((p: { imageUrl: string }) => p.imageUrl)
                  })
                }
              }}
            >下载</Button>
            <Tooltip content={liked ? '取消收藏' : '收藏'} relationship="label">
              <Button size="large"
                icon={liked ? <Heart20Filled style={{ color: 'var(--ac-danger)' }} /> : <Heart20Regular />}
                onClick={async () => {
                  if (!window.electronAPI) return
                  const wasLiked = liked
                  setLiked(!wasLiked)
                  try {
                    if (wasLiked) {
                      await window.electronAPI.favoritesRemove(manga.id)
                    } else {
                      await window.electronAPI.favoritesAdd({
                        mangaId: manga.id,
                        title: manga.title,
                        coverUrl: manga.coverUrl
                      })
                    }
                  } catch {
                    setLiked(wasLiked) // 回滚
                  }
                }}
              />
            </Tooltip>
          </div>
        </div>
      </div>

      {manga.chapters.length > 0 && (
        <>
          <Divider />
          <div className={styles.chaptersSection}>
            <div className={styles.chapterHeader}>
              <Text size={500} weight="semibold">章节列表 ({manga.chapters.length})</Text>
              <Button size="small" appearance="subtle"
                icon={orderAsc ? <ChevronDown20Regular /> : <ChevronUp20Regular />}
                onClick={() => setOrderAsc(!orderAsc)}
              >
                {orderAsc ? '正序' : '倒序'}
              </Button>
            </div>
            <div className={styles.chapterList}>
              {chapters.map((ch) => (
                <div key={ch.index} className={styles.chapterItem} role="button" tabIndex={0}
                  onClick={() => openReader({
                    mangaId: manga.id,
                    mangaTitle: manga.title,
                    mangaCoverUrl: manga.coverUrl,
                    chapterIndex: ch.index,
                    chapterTitle: ch.title,
                    chapterUrl: ch.url
                  })}
                  onKeyDown={(e) => { if (e.key === 'Enter') openReader({ mangaId: manga.id, mangaTitle: manga.title, mangaCoverUrl: manga.coverUrl, chapterIndex: ch.index, chapterTitle: ch.title, chapterUrl: ch.url }) }}
                >
                  <div className={styles.chapterIndex}>{ch.index + 1}</div>
                  <div className={styles.chapterTitle}>{ch.title}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
