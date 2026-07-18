import React from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
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
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
    ':hover': {
      transform: 'translateY(-3px)',
      boxShadow: '0 8px 20px var(--ac-glass-shadow)'
    },
    ':active': {
      transform: 'translateY(-3px) scale(0.97)'
    }
  },
  cardEnter: {
    animation: 'ac-card-enter 0.3s ease-out both'
  },
  imageWrap: {
    position: 'relative',
    borderRadius: 'var(--ac-radius-card)',
    overflow: 'hidden',
    border: '1px solid var(--ac-glass-border)',
    boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)'
  },
  cardImage: {
    display: 'block',
    width: '100%',
    aspectRatio: '3/4',
    objectFit: 'cover',
    backgroundColor: 'var(--ac-base-bg)',
    opacity: 0,
    transition: 'opacity 0.25s ease, transform 0.2s ease'
  },
  cardImageLoaded: {
    opacity: 1
  },
  cardImageHover: {
    transform: 'scale(1.03)'
  },
  favBtn: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '30px',
    height: '30px',
    borderRadius: 'var(--ac-radius-button)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-card))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-card))',
    color: 'var(--ac-danger)',
    cursor: 'pointer',
    opacity: 0,
    transition: 'opacity 0.18s ease, background-color 0.18s ease',
    zIndex: 2,
    ':hover': {
      backgroundColor: 'var(--ac-glass-bg-hover)'
    },
    ':focus': {
      opacity: 1
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
    marginTop: '9px',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    color: 'var(--ac-text-1)'
  },
  cardMeta: {
    fontSize: '12px',
    color: 'var(--ac-text-3)',
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

export default function MangaCard({ manga, onClick, index }: { manga: MangaCardData; onClick?: (id: string) => void; index?: number }): JSX.Element {
  const styles = useStyles()
  const setCurrentMangaId = useAppStore((s) => s.setCurrentMangaId)

  const [liked, setLiked] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)
  const [imgLoaded, setImgLoaded] = React.useState(false)

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
      className={mergeClasses(styles.card, index !== undefined && styles.cardEnter)}
      style={index !== undefined ? { animationDelay: `${Math.min(index, 12) * 30}ms` } : undefined}
      role="button"
      tabIndex={0}
      onClick={() => onClick ? onClick(manga.id) : setCurrentMangaId(manga.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick ? onClick(manga.id) : setCurrentMangaId(manga.id) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={styles.imageWrap}>
        <img
          className={mergeClasses(styles.cardImage, imgLoaded && styles.cardImageLoaded, hovered && styles.cardImageHover)}
          src={toJmImg(manga.coverUrl)}
          alt={manga.title}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
        />
        <div
          className={mergeClasses(styles.favBtn, (hovered || liked) && styles.favBtnVisible)}
          onClick={handleFavClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void handleFavClick(e as unknown as React.MouseEvent) } }}
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
