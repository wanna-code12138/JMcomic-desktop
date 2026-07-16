import React from 'react'
import { makeStyles, tokens, mergeClasses } from '@fluentui/react-components'
import { Heart20Regular, Heart20Filled } from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'
import { toJmImg } from '../utils/image'

// ── 模块级收藏缓存 ──
// 避免了在漫画网格中，每个 MangaCard 都单独发起一次 IPC 查询收藏列表。
// 首次加载时发起一次请求，后续组件共享同一结果。增删收藏时清空缓存。
let _favIdsCache: string[] | null = null
let _favIdsLoading: Promise<string[]> | null = null

async function getFavoriteIds(): Promise<string[]> {
  if (_favIdsCache) return _favIdsCache
  if (_favIdsLoading) return _favIdsLoading

  _favIdsLoading = (async () => {
    const list = await window.electronAPI?.favoritesList()
    _favIdsCache = (list ?? []).map((f: any) => f.manga_id)
    return _favIdsCache
  })()
  return _favIdsLoading
}

function invalidateFavCache(): void {
  _favIdsCache = null
  _favIdsLoading = null
}

// ── 样式 ──────────────────────────────────────────────────

const useStyles = makeStyles({
  card: {
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: tokens.shadow8
    }
  },
  imageWrap: {
    position: 'relative',
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden'
  },
  cardImage: {
    display: 'block',
    width: '100%',
    aspectRatio: '3/4',
    objectFit: 'cover',
    backgroundColor: tokens.colorNeutralBackground3
  },
  favBtn: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    color: '#ffffff',
    cursor: 'pointer',
    opacity: 0,
    transition: 'opacity 0.15s ease, background-color 0.15s ease',
    zIndex: 2,
    ':hover': {
      backgroundColor: 'rgba(0,0,0,0.65)'
    }
  },
  favBtnVisible: {
    opacity: 1
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
  }
})

// ── 组件 ──────────────────────────────────────────────────

export interface MangaCardData {
  id: string
  title: string
  coverUrl: string
  author?: string
  latestChapter?: string
}

export default function MangaCard({ manga }: { manga: MangaCardData }): JSX.Element {
  const styles = useStyles()
  const setCurrentMangaId = useAppStore((s) => s.setCurrentMangaId)

  const [liked, setLiked] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function check(): Promise<void> {
      const ids = await getFavoriteIds()
      if (!cancelled) setLiked(ids.includes(manga.id))
    }
    check()
    return () => { cancelled = true }
  }, [manga.id])

  const handleFavClick = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!window.electronAPI) return
    const wasLiked = liked
    setLiked(!wasLiked)
    invalidateFavCache()
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
      setLiked(wasLiked)
      invalidateFavCache()
    }
  }

  return (
    <div
      className={styles.card}
      role="button"
      tabIndex={0}
      onClick={() => setCurrentMangaId(manga.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') setCurrentMangaId(manga.id) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={styles.imageWrap}>
        <img
          className={styles.cardImage}
          src={toJmImg(manga.coverUrl)}
          alt={manga.title}
          loading="lazy"
        />
        <div
          className={mergeClasses(styles.favBtn, hovered && styles.favBtnVisible)}
          onClick={handleFavClick}
          role="button"
          tabIndex={-1}
        >
          {liked ? <Heart20Filled style={{ color: '#ff4d4f' }} /> : <Heart20Regular />}
        </div>
      </div>
      <div className={styles.cardTitle}>{manga.title}</div>
      <div className={styles.cardMeta}>
        {manga.author ? manga.author : ''}
        {manga.latestChapter ? ` · ${manga.latestChapter}` : ''}
      </div>
    </div>
  )
}
