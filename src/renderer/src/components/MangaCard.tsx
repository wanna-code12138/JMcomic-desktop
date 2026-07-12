import { makeStyles, tokens } from '@fluentui/react-components'
import { useAppStore } from '../stores/appStore'
import { toJmImg } from '../utils/image'

const useStyles = makeStyles({
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
  }
})

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
        {manga.author ? manga.author : ''}
        {manga.latestChapter ? ` · ${manga.latestChapter}` : ''}
      </div>
    </div>
  )
}
