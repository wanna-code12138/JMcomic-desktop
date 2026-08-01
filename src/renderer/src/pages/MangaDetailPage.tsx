import React from 'react'
import {
  makeStyles, Text, Button, Badge, Skeleton, SkeletonItem,
  Tooltip, Divider, Spinner
} from '@fluentui/react-components'
import {
  BookOpen20Regular, ArrowDownload20Regular,
  Heart20Regular, Heart20Filled, ArrowLeft20Regular,
  ChevronDown20Regular, ChevronUp20Regular,
  FolderOpen20Regular, CheckmarkCircle20Regular, ArrowClockwise20Regular
} from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'
import { toJmImg } from '../utils/image'
import ChapterSelectDialog from '../components/ChapterSelectDialog'

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
  cover: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    opacity: 0,
    transition: 'opacity 0.25s ease'
  },
  coverLoaded: {
    opacity: 1
  },
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
    backgroundColor: 'var(--ac-brand)',
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
    transition: 'background-color 0.15s, box-shadow 0.15s, transform 0.15s',
    gap: '12px',
    ':hover': {
      backgroundColor: 'var(--ac-glass-bg-hover)',
      boxShadow: 'inset 0 0 0 1px var(--ac-glass-border)'
    },
    ':active': {
      transform: 'scale(0.97)'
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
  chapters: { index: number; title: string; url: string; status?: string; taskId?: number; error?: string }[]
}

interface MangaDownloadGroup {
  mangaId: string
  mangaTitle: string
  coverUrl: string
  tasks: Array<{
    id: number
    chapter_index: number
    chapter_title: string
    chapter_url: string
    status: string
    error?: string
  }>
}

export default function MangaDetailPage(): JSX.Element {
  const styles = useStyles()
  const currentMangaId = useAppStore((s) => s.currentMangaId)
  const detailSource = useAppStore((s) => s.detailSource)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const previousPage = useAppStore((s) => s.previousPage)
  const openReader = useAppStore((s) => s.openReader)
  const triggerTagSearch = useAppStore((s) => s.triggerTagSearch)
  const [orderAsc, setOrderAsc] = React.useState(false)
  const [liked, setLiked] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [coverLoaded, setCoverLoaded] = React.useState(false)
  const [manga, setManga] = React.useState<DetailData | null>(null)
  const [error, setError] = React.useState('')
  const [selectOpen, setSelectOpen] = React.useState(false)
  const [addStatus, setAddStatus] = React.useState('')

  React.useEffect(() => {
    if (!currentMangaId) return
    let cancelled = false

    async function load(): Promise<void> {
      setLoading(true)
      setCoverLoaded(false)
      setError('')
      try {
        const result = detailSource === 'local'
          ? await window.electronAPI?.downloadMangaDetail(currentMangaId!)
          : await window.electronAPI?.contentDetail(currentMangaId!)
        if (cancelled) return
        if (detailSource === 'local') {
          const group = result as MangaDownloadGroup | null
          if (group) {
            setManga({
              id: group.mangaId,
              title: group.mangaTitle,
              author: '',
              coverUrl: group.coverUrl,
              tags: [],
              description: '',
              chapters: group.tasks.map((t) => ({
                index: t.chapter_index,
                title: t.chapter_title,
                url: t.chapter_url ?? '',
                status: t.status,
                taskId: t.id,
                error: t.error
              }))
            })
          } else {
            setError('本地没有该漫画的下载记录')
          }
        } else if (result?.ok) {
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
  }, [currentMangaId, detailSource])

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

  const downloadChapters = async (indices: number[]): Promise<void> => {
    if (!window.electronAPI || indices.length === 0) return
    // 立即关闭选择弹窗，后续进度在顶部栏展示，不阻塞页面操作
    setSelectOpen(false)
    setAddStatus('')
    const selected = manga.chapters.filter((c) => indices.includes(c.index))
    try {
      const result = await window.electronAPI.downloadAddChapters({
        mangaId: manga.id,
        mangaTitle: manga.title,
        coverUrl: manga.coverUrl,
        chapters: selected.map((c) => ({ index: c.index, title: c.title, url: c.url }))
      }) as { added?: number; total?: number; results?: Array<{ ok: boolean; error?: string }> } | undefined
      const added = result?.added ?? 0
      const total = result?.total ?? selected.length
      const firstError = result?.results?.find((r) => !r.ok)?.error
      if (added === total) {
        setAddStatus(`已加入下载队列 ${added} 章`)
      } else if (added > 0) {
        setAddStatus(`已加入 ${added}/${total} 章${firstError ? `，失败：${firstError}` : '，部分失败'}`)
      } else {
        setAddStatus(`下载失败：${firstError ?? '未知错误'}`)
      }
    } catch (err) {
      setAddStatus(`下载失败：${String(err)}`)
    }
  }

  const handleDownloadClick = (): void => {
    if (manga.chapters.length > 1) {
      setSelectOpen(true)
    } else if (manga.chapters.length === 1) {
      void downloadChapters([manga.chapters[0].index])
    }
  }

  const openLocalReader = (ch: { index: number; title: string; url: string }): void => {
    openReader({
      mangaId: manga.id,
      mangaTitle: manga.title,
      mangaCoverUrl: manga.coverUrl,
      chapterIndex: ch.index,
      chapterTitle: ch.title,
      chapterUrl: ch.url,
      local: true
    })
  }

  return (
    <div className={styles.root}>
      <div className={styles.backBtn}>
        <Button appearance="subtle" icon={<ArrowLeft20Regular />} onClick={() => setCurrentPage(previousPage || 'home')}>返回</Button>
      </div>

      <div className={styles.hero}>
        <div className={styles.coverWrap}>
          {manga.coverUrl ? (
            <img
              className={`${styles.cover} ${coverLoaded ? styles.coverLoaded : ''}`}
              src={toJmImg(manga.coverUrl)}
              alt={manga.title}
              onLoad={() => setCoverLoaded(true)}
            />
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
            {detailSource === 'local' ? (
              <Button appearance="primary" size="large" icon={<FolderOpen20Regular />}
                onClick={async () => {
                  await window.electronAPI?.downloadOpenMangaFolder(manga.id)
                }}
              >
                打开文件夹
              </Button>
            ) : manga.chapters.length > 0 && (
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
            {detailSource !== 'local' && (
              <>
                <Button size="large" icon={<ArrowDownload20Regular />}
                  disabled={manga.chapters.length === 0}
                  onClick={handleDownloadClick}
                >
                  下载
                </Button>
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
              </>
            )}
          </div>
          {addStatus && (
            <Text size={200} style={{ color: 'var(--ac-text-3)' }}>{addStatus}</Text>
          )}
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
                  onClick={() => detailSource === 'local'
                    ? openLocalReader(ch)
                    : openReader({
                        mangaId: manga.id,
                        mangaTitle: manga.title,
                        mangaCoverUrl: manga.coverUrl,
                        chapterIndex: ch.index,
                        chapterTitle: ch.title,
                        chapterUrl: ch.url
                      })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { detailSource === 'local' ? openLocalReader(ch) : openReader({ mangaId: manga.id, mangaTitle: manga.title, mangaCoverUrl: manga.coverUrl, chapterIndex: ch.index, chapterTitle: ch.title, chapterUrl: ch.url }) } }}
                >
                  <div className={styles.chapterIndex}>{ch.index + 1}</div>
                  <div className={styles.chapterTitle}>{ch.title}</div>
                  {detailSource === 'local' ? (
                    <>
                      {ch.status === 'completed' && <CheckmarkCircle20Regular style={{ color: 'var(--ac-green, #4caf50)' }} />}
                      {ch.status === 'downloading' && <Text size={200} style={{ color: 'var(--ac-text-3)' }}>下载中</Text>}
                      {(ch.status === 'failed' || ch.status === 'cancelled') && (
                        <Tooltip content={ch.error ?? '下载失败'} relationship="label">
                          <Button size="small" appearance="subtle" icon={<ArrowClockwise20Regular />}
                            onClick={(e) => {
                              e.stopPropagation()
                              void downloadChapters([ch.index])
                            }}
                          />
                        </Tooltip>
                      )}
                      <Button size="small" appearance="subtle" icon={<FolderOpen20Regular />}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (ch.taskId) void window.electronAPI?.downloadOpenTaskFolder(ch.taskId)
                        }}
                      />
                    </>
                  ) : (
                    <Button size="small" appearance="subtle" icon={<ArrowDownload20Regular />}
                      onClick={(e) => {
                        e.stopPropagation()
                        void downloadChapters([ch.index])
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <ChapterSelectDialog
        open={selectOpen}
        chapters={manga.chapters.map((c) => ({ index: c.index, title: c.title }))}
        busy={false}
        busyText=""
        onConfirm={(indices) => void downloadChapters(indices)}
        onCancel={() => setSelectOpen(false)}
      />
    </div>
  )
}
