import React from 'react'
import {
  makeStyles, tokens, Text, Button, TabList, Tab,
  Tooltip
} from '@fluentui/react-components'
import {
  Dismiss20Regular, Delete20Regular
} from '@fluentui/react-icons'
import { MangaCard } from '../components'
import { useAppStore } from '../stores/appStore'
import { toJmImg } from '../utils/image'

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  tabRow: { marginBottom: '16px' },
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
    gap: '12px'
  },
  historyItem: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    borderRadius: 'var(--ac-radius-row)',
    cursor: 'pointer',
    transition: 'background-color 0.15s, box-shadow 0.15s',
    alignItems: 'center',
    ':hover': {
      backgroundColor: 'var(--ac-glass-bg-hover)',
      boxShadow: 'inset 0 0 0 1px var(--ac-glass-border)'
    }
  },
  historyCover: {
    width: '48px',
    minWidth: '48px',
    height: '64px',
    objectFit: 'cover',
    borderRadius: 'var(--ac-radius-badge)',
    backgroundColor: 'var(--ac-base-bg)',
    border: '1px solid var(--ac-glass-border)'
  },
  historyInfo: { flex: 1, minWidth: 0 },
  historyTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--ac-text-1)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  historyMeta: {
    fontSize: '12px',
    color: 'var(--ac-text-3)',
    marginTop: '4px'
  },
  historyActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px'
  }
})

type MainTab = 'local-fav' | 'history'

interface LocalFavorite {
  manga_id: string; title: string; cover_url: string; added_at: number
}
interface LocalHistoryRow {
  manga_id: string; manga_title: string; chapter_index: number
  chapter_title: string; chapter_url: string; cover_url: string
  page_index: number; total_pages: number; read_at: number
}

export default function FavoritesPage(): JSX.Element {
  const styles = useStyles()
  const openReader = useAppStore((s) => s.openReader)
  const setCurrentMangaId = useAppStore((s) => s.setCurrentMangaId)
  const savedTab = useAppStore((s) => s.favoritesTab)
  const setFavoritesTab = useAppStore((s) => s.setFavoritesTab)

  const [mainTab, setMainTab] = React.useState<MainTab>((savedTab as MainTab) || 'local-fav')

  // 本地收藏
  const [localFav, setLocalFav] = React.useState<LocalFavorite[]>([])

  // 本地历史
  const [localHistory, setLocalHistory] = React.useState<LocalHistoryRow[]>([])

  // ── 加载本地收藏 ──
  const loadLocalFav = React.useCallback(async (): Promise<void> => {
    const list = (await window.electronAPI?.favoritesList()) as LocalFavorite[] | undefined
    setLocalFav(list ?? [])
  }, [])

  // ── 加载本地历史 ──
  const loadLocalHistory = React.useCallback(async (): Promise<void> => {
    const list = (await window.electronAPI?.historyListLocal()) as LocalHistoryRow[] | undefined
    setLocalHistory(list ?? [])
  }, [])

  // ── Tab 切换时加载数据 ──
  React.useEffect(() => {
    if (mainTab === 'local-fav') loadLocalFav()
    else if (mainTab === 'history') loadLocalHistory()
  }, [mainTab, loadLocalFav, loadLocalHistory])

  // ── 续读 ──
  const handleResume = async (mangaId: string): Promise<void> => {
    const row = (await window.electronAPI?.historyGetLocal(mangaId)) as LocalHistoryRow | null
    if (!row) return
    openReader({
      mangaId: row.manga_id,
      mangaTitle: row.manga_title,
      mangaCoverUrl: row.cover_url,
      chapterIndex: row.chapter_index,
      chapterTitle: row.chapter_title,
      chapterUrl: row.chapter_url,
      resumePageIndex: row.page_index
    })
  }

  // ── 删除本地历史单条 ──
  const handleRemoveHistory = async (mangaId: string): Promise<void> => {
    await window.electronAPI?.historyRemoveLocal(mangaId)
    loadLocalHistory()
  }

  // ── 清空本地历史 ──
  const handleClearHistory = async (): Promise<void> => {
    await window.electronAPI?.historyClearLocal()
    loadLocalHistory()
  }

  return (
    <div className={styles.root}>
      {/* Tab */}
      <div className={styles.tabRow}>
        <TabList selectedValue={mainTab} onTabSelect={(_e, d) => { const tab = d.value as MainTab; setMainTab(tab); setFavoritesTab(tab) }}>
          <Tab value="local-fav">本地收藏</Tab>
          <Tab value="history">历史记录</Tab>
        </TabList>
      </div>

      {/* 本地收藏 */}
      {mainTab === 'local-fav' && (
        localFav.length === 0 ? (
          <div className={styles.statusMsg}>
            <Text>暂无本地收藏</Text>
            <Text size={200}>在漫画详情页点击爱心收藏</Text>
          </div>
        ) : (
          <div className={styles.grid}>
            {localFav.map((f) => (
              <MangaCard key={f.manga_id} manga={{ id: f.manga_id, title: f.title, coverUrl: f.cover_url }} />
            ))}
          </div>
        )
      )}

      {/* 历史记录 */}
      {mainTab === 'history' && (
        localHistory.length === 0 ? (
          <div className={styles.statusMsg}><Text>暂无阅读历史</Text></div>
        ) : (
          <>
            <div className={styles.sectionHeader}>
              <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
                {localHistory.length} 条记录
              </Text>
              <Button size="small" appearance="subtle" icon={<Delete20Regular />}
                onClick={handleClearHistory}>清空</Button>
            </div>
            {localHistory.map((h) => (
              <div key={h.manga_id} className={styles.historyItem}
                onClick={() => handleResume(h.manga_id)}
                role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') handleResume(h.manga_id) }}
              >
                {h.cover_url ? (
                  <img className={styles.historyCover} src={toJmImg(h.cover_url)} alt={h.manga_title} />
                ) : (
                  <div className={styles.historyCover} />
                )}
                <div className={styles.historyInfo}>
                  <div className={styles.historyTitle}>{h.manga_title}</div>
                  <div className={styles.historyMeta}>
                    {h.chapter_title} · 第 {h.page_index + 1}/{h.total_pages || '?'} 页
                  </div>
                </div>
                <div className={styles.historyActions}>
                  <Button size="small" appearance="subtle"
                    onClick={(e) => { e.stopPropagation(); setCurrentMangaId(h.manga_id) }}>
                    详情页
                  </Button>
                  <Tooltip content="删除" relationship="label">
                    <Button size="small" appearance="subtle" icon={<Dismiss20Regular />}
                      onClick={(e) => { e.stopPropagation(); handleRemoveHistory(h.manga_id) }} />
                  </Tooltip>
                </div>
              </div>
            ))}
          </>
        )
      )}
    </div>
  )
}
