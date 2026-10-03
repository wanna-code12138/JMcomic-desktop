import React from 'react'
import {
  makeStyles, Text, Button, TabList, Tab,
  Tooltip
} from '@fluentui/react-components'
import {
  Dismiss20Regular, Delete20Regular, Heart20Regular, History20Regular
} from '@fluentui/react-icons'
import { MangaCard } from '../components'
import { useAppStore } from '../stores/appStore'
import { toJmImg } from '../utils/image'
import { contentTabRow, emptyState, caption } from '../theme/surfaceStyles'
import OnlineLibraryPanel from '../components/OnlineLibraryPanel'

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  tabRow: contentTabRow,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  statusMsg: emptyState,
  historyItem: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    borderRadius: 'var(--ui-radius-lg)',
    cursor: 'pointer',
    transition: 'background-color var(--ui-motion-fast) ease-out, border-color var(--ui-motion-fast) ease-out',
    border: '1px solid transparent',
    alignItems: 'center',
    ':hover': {
      backgroundColor: 'var(--ui-bg-hover)',
      border: '1px solid var(--ui-stroke-card)'
    }
  },
  historyCover: {
    width: '48px',
    minWidth: '48px',
    height: '64px',
    objectFit: 'cover',
    borderRadius: 'var(--ui-radius-md)',
    backgroundColor: 'var(--ui-bg-canvas)',
    border: '1px solid var(--ui-stroke-card)'
  },
  historyInfo: { flex: 1, minWidth: 0 },
  historyTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--ui-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  historyMeta: {
    ...caption,
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

type MainTab = 'local-fav' | 'history' | 'tracking'

interface LocalFavorite {
  manga_id: string; title: string; cover_url: string; added_at: number
}
interface LocalHistoryRow {
  manga_id: string; manga_title: string; chapter_index: number
  chapter_title: string; chapter_url: string; cover_url: string
  page_index: number; total_pages: number; read_at: number
  page_offset?: number; is_local?: number
}

export default function FavoritesPage(): JSX.Element {
  const styles = useStyles()
  const openReader = useAppStore((s) => s.openReader)
  const setCurrentMangaId = useAppStore((s) => s.setCurrentMangaId)
  const savedTab = useAppStore((s) => s.favoritesTab)
  const setFavoritesTab = useAppStore((s) => s.setFavoritesTab)

  const [mainTab, setMainTab] = React.useState<MainTab>((savedTab as MainTab) || 'local-fav')
  const visible = useAppStore(state => state.currentPage === 'favorites')
  const [sources, setSources] = React.useState<Record<string, string>>({ 'local-fav': 'local', history: 'local' })
  const source = mainTab === 'tracking' ? 'online' : sources[mainTab]
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const scrollPositions = React.useRef<Record<string, number>>({})
  const scrollKey = `${mainTab}:${source}`
  React.useLayoutEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollPositions.current[scrollKey] ?? 0 }, [scrollKey])

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
      resumePageIndex: row.page_index,
      resumePageOffset: row.page_offset ?? 0,
      local: Boolean(row.is_local)
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
    <div ref={scrollRef} className={styles.root} onScroll={event => { scrollPositions.current[scrollKey] = event.currentTarget.scrollTop }}>
      {/* Tab */}
      <div className={styles.tabRow}>
        <TabList selectedValue={mainTab} onTabSelect={(_e, d) => { const tab = d.value as MainTab; setMainTab(tab); setFavoritesTab(tab) }}>
          <Tab value="local-fav">收藏</Tab>
          <Tab value="history">历史</Tab>
          <Tab value="tracking">追更</Tab>
        </TabList>
      </div>
      {mainTab !== 'tracking' && <TabList size="small" selectedValue={source} style={{ marginBottom: '16px' }}
        onTabSelect={(_, data) => setSources(previous => ({ ...previous, [mainTab]: String(data.value) }))}>
        <Tab value="local">本地</Tab><Tab value="online">在线</Tab>
      </TabList>}
      {(['favorites', 'history', 'tracking'] as const).map(kind => {
        const selected = source === 'online' && (mainTab === 'local-fav' ? kind === 'favorites' : mainTab === kind)
        return <div key={kind} hidden={!selected}><OnlineLibraryPanel kind={kind} visible={visible && selected} /></div>
      })}

      {/* 本地收藏 */}
      {mainTab === 'local-fav' && source === 'local' && (
        localFav.length === 0 ? (
          <div className={styles.statusMsg}>
            <Heart20Regular aria-hidden="true" />
            <Text>暂无本地收藏</Text>
            <Text size={200}>在漫画详情页点击爱心收藏</Text>
          </div>
        ) : (
          <div className={styles.grid}>
            {localFav.map((f, i) => (
              <MangaCard key={f.manga_id} manga={{ id: f.manga_id, title: f.title, coverUrl: f.cover_url }} index={i} />
            ))}
          </div>
        )
      )}

      {/* 历史记录 */}
      {mainTab === 'history' && source === 'local' && (
        localHistory.length === 0 ? (
          <div className={styles.statusMsg}><History20Regular aria-hidden="true" /><Text>暂无阅读历史</Text></div>
        ) : (
          <>
            <div className={styles.sectionHeader}>
              <Text size={300} style={{ color: 'var(--ui-text-tertiary)' }}>
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
