import React from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { Heart20Regular, Heart20Filled } from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'
import { useFavoritesStore, useIsFavorite } from '../stores/favoritesStore'
import { toProxyUrl } from '../utils/image'
import { caption } from '../theme/surfaceStyles'

const useStyles = makeStyles({
  card: {
    position: 'relative',
    cursor: 'pointer',
    borderRadius: 'var(--ui-radius-lg)',
    transition: 'background-color var(--ui-motion-fast) ease-out, opacity var(--ui-motion-fast) ease-out',
    ':hover': {
      backgroundColor: 'var(--ui-bg-hover)'
    },
    ':active': {
      opacity: 0.82
    },
    ':focus-visible': {
      outline: '2px solid var(--ui-brand)',
      outlineOffset: '2px'
    }
  },
  imageWrap: {
    position: 'relative',
    borderRadius: 'var(--ui-radius-md)',
    overflow: 'hidden',
    border: '1px solid var(--ui-stroke-card)'
  },
  cardImage: {
    display: 'block',
    width: '100%',
    aspectRatio: '3/4',
    objectFit: 'cover',
    backgroundColor: 'var(--ui-bg-canvas)',
    opacity: 0,
    transition: 'opacity var(--ui-motion-standard) ease-out'
  },
  cardImageLoaded: {
    opacity: 1
  },
  favBtn: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '30px',
    height: '30px',
    borderRadius: 'var(--ui-radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--ui-bg-dialog)',
    border: '1px solid var(--ui-stroke-card)',
    color: 'var(--ui-favorite)',
    cursor: 'pointer',
    zIndex: 2,
    ':hover': {
      backgroundColor: 'var(--ui-bg-hover)'
    },
    ':focus': {
      outline: '2px solid var(--ui-brand)',
      outlineOffset: '2px'
    }
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
    color: 'var(--ui-text-primary)'
  },
  cardMeta: {
    ...caption,
    marginTop: '4px'
  }
})

export interface MangaCardData {
  id: string
  title: string
  coverUrl: string
  author?: string
  latestChapter?: string
}

export default function MangaCard({
  manga,
  onClick
}: {
  manga: MangaCardData
  onClick?: (id: string) => void
  index?: number
}): JSX.Element {
  const styles = useStyles()
  const setCurrentMangaId = useAppStore((s) => s.setCurrentMangaId)
  const isFavorite = useIsFavorite(manga.id)
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite)
  const [imgLoaded, setImgLoaded] = React.useState(false)

  // 挂载时触发一次单实例异步初始化
  React.useEffect(() => {
    void useFavoritesStore.getState().initialize()
  }, [])

  const handleFavClick = async (e: React.MouseEvent | React.KeyboardEvent): Promise<void> => {
    e.stopPropagation()
    await toggleFavorite({
      mangaId: manga.id,
      title: manga.title,
      coverUrl: manga.coverUrl
    })
  }

  return (
    <div
      className={mergeClasses(styles.card, 'manga-card')}
      role="button"
      tabIndex={0}
      onClick={() => (onClick ? onClick(manga.id) : setCurrentMangaId(manga.id))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onClick ? onClick(manga.id) : setCurrentMangaId(manga.id)
        }
      }}
    >
      <div className={styles.imageWrap}>
        <img
          className={mergeClasses(styles.cardImage, imgLoaded && styles.cardImageLoaded)}
          src={toProxyUrl(manga.coverUrl, 'visible-grid')}
          alt={manga.title}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
        />
        <button
          type="button"
          aria-label={isFavorite ? '取消收藏' : '收藏'}
          className={mergeClasses(styles.favBtn, 'manga-card-fav-btn', isFavorite && 'is-active')}
          onClick={handleFavClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation()
              void handleFavClick(e)
            }
          }}
        >
          {isFavorite ? <Heart20Filled /> : <Heart20Regular />}
        </button>
      </div>
      <div className={styles.cardTitle}>{manga.title}</div>
      <div className={styles.cardMeta}>
        {manga.author ? manga.author : ''}
        {manga.latestChapter ? ` · ${manga.latestChapter}` : ''}
      </div>
    </div>
  )
}
