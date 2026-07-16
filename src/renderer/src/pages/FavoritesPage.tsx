import React from 'react'
import {
  makeStyles, tokens, Text, Button, Input, Spinner, TabList, Tab,
  Card, Tooltip
} from '@fluentui/react-components'
import {
  Person20Regular, Key20Regular, Dismiss20Regular,
  ArrowPrevious20Regular, ArrowNext20Regular, Delete20Regular
} from '@fluentui/react-icons'
import { MangaCard, type MangaCardData } from '../components'
import { useAppStore } from '../stores/appStore'
import { useAccountStore } from '../stores/accountStore'
import { toJmImg } from '../utils/image'

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  accountBar: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px 16px', marginBottom: '16px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium
  },
  loginForm: {
    display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'
  },
  userInfo: {
    display: 'flex', alignItems: 'center', gap: '8px', flex: 1
  },
  hint: { fontSize: '12px', color: tokens.colorNeutralForeground3, marginTop: '4px' },
  tabRow: { marginBottom: '16px' },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  statusMsg: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '60px 0',
    color: tokens.colorNeutralForeground3, gap: '12px'
  },
  historyItem: {
    display: 'flex', gap: '12px', padding: '12px',
    borderRadius: tokens.borderRadiusMedium, cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground2 },
    alignItems: 'center'
  },
  historyCover: {
    width: '48px', minWidth: '48px', height: '64px', objectFit: 'cover',
    borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3
  },
  historyInfo: { flex: 1, minWidth: 0 },
  historyTitle: {
    fontSize: '14px', fontWeight: 500, color: tokens.colorNeutralForeground1,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  },
  historyMeta: { fontSize: '12px', color: tokens.colorNeutralForeground3, marginTop: '4px' },
  historyActions: { display: 'flex', alignItems: 'center', gap: '4px' },
  subTabRow: { marginBottom: '12px' },
  pagination: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '12px', marginTop: '24px', marginBottom: '12px'
  },
  pageText: { fontSize: '13px', color: tokens.colorNeutralForeground2, minWidth: '80px', textAlign: 'center' },
  sectionHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '12px'
  }
})

type MainTab = 'online-fav' | 'local-fav' | 'history'
type HistoryTab = 'local-history' | 'online-history'

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
  const { loggedIn, username, validating, login, logout } = useAccountStore()
  const openReader = useAppStore((s) => s.openReader)
  const setCurrentMangaId = useAppStore((s) => s.setCurrentMangaId)

  const [loginUser, setLoginUser] = React.useState('')
  const [loginPwd, setLoginPwd] = React.useState('')
  const [loginLoading, setLoginLoading] = React.useState(false)
  const [loginErr, setLoginErr] = React.useState('')

  const [mainTab, setMainTab] = React.useState<MainTab>('local-fav')
  const [historyTab, setHistoryTab] = React.useState<HistoryTab>('local-history')

  // 在线收藏
  const [onlineFav, setOnlineFav] = React.useState<MangaCardData[]>([])
  const [onlineFavPage, setOnlineFavPage] = React.useState(1)
  const [onlineFavTotal, setOnlineFavTotal] = React.useState(1)
  const [onlineFavLoading, setOnlineFavLoading] = React.useState(false)
  const [onlineFavErr, setOnlineFavErr] = React.useState('')

  // 本地收藏
  const [localFav, setLocalFav] = React.useState<LocalFavorite[]>([])

  // 本地历史
  const [localHistory, setLocalHistory] = React.useState<LocalHistoryRow[]>([])

  // 在线历史
  const [onlineHistory, setOnlineHistory] = React.useState<MangaCardData[]>([])
  const [onlineHistoryPage, setOnlineHistoryPage] = React.useState(1)
  const [onlineHistoryTotal, setOnlineHistoryTotal] = React.useState(1)
  const [onlineHistoryLoading, setOnlineHistoryLoading] = React.useState(false)
  const [onlineHistoryErr, setOnlineHistoryErr] = React.useState('')

  // ── 登录处理 ──
  const handleLogin = async (): Promise<void> => {
    if (!loginUser.trim() || !loginPwd.trim()) {
      setLoginErr('请输入用户名和密码')
      return
    }
    setLoginLoading(true)
    setLoginErr('')
    const ok = await login(loginUser.trim(), loginPwd)
    if (!ok) setLoginErr('登录失败，请检查用户名和密码')
    setLoginLoading(false)
  }

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

  // ── 加载在线收藏 ──
  const loadOnlineFav = React.useCallback(async (page: number): Promise<void> => {
    if (!loggedIn) return
    setOnlineFavLoading(true)
    setOnlineFavErr('')
    try {
      const result = await window.electronAPI?.contentFavorites(page)
      if (result?.ok && result.data) {
        setOnlineFav(result.data.results.map((m: any) => ({
          id: m.id, title: m.title, coverUrl: m.coverUrl
        })))
        setOnlineFavTotal(result.data.totalPages ?? 1)
        setOnlineFavPage(page)
      } else {
        setOnlineFavErr(result?.error || '加载失败')
      }
    } catch (e) {
      setOnlineFavErr(String(e))
    }
    setOnlineFavLoading(false)
  }, [loggedIn])

  // ── 加载在线历史 ──
  const loadOnlineHistory = React.useCallback(async (page: number): Promise<void> => {
    if (!loggedIn) return
    setOnlineHistoryLoading(true)
    setOnlineHistoryErr('')
    try {
      const result = await window.electronAPI?.contentHistory(page)
      if (result?.ok && result.data) {
        setOnlineHistory(result.data.results.map((m: any) => ({
          id: m.id, title: m.title, coverUrl: m.coverUrl, latestChapter: m.latestChapter
        })))
        setOnlineHistoryTotal(result.data.totalPages ?? 1)
        setOnlineHistoryPage(page)
      } else {
        setOnlineHistoryErr(result?.error || '加载失败')
      }
    } catch (e) {
      setOnlineHistoryErr(String(e))
    }
    setOnlineHistoryLoading(false)
  }, [loggedIn])

  // ── Tab 切换时加载数据 ──
  React.useEffect(() => {
    if (mainTab === 'local-fav') loadLocalFav()
    else if (mainTab === 'online-fav' && loggedIn) loadOnlineFav(1)
    else if (mainTab === 'history') {
      if (historyTab === 'local-history') loadLocalHistory()
      else if (historyTab === 'online-history' && loggedIn) loadOnlineHistory(1)
    }
  }, [mainTab, historyTab, loggedIn, loadLocalFav, loadOnlineFav, loadLocalHistory, loadOnlineHistory])

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

  // ── 删除本地收藏 ──
  const handleRemoveFav = async (mangaId: string): Promise<void> => {
    await window.electronAPI?.favoritesRemove(mangaId)
    loadLocalFav()
  }

  return (
    <div className={styles.root}>
      {/* 账户区 */}
      <div className={styles.accountBar}>
        {validating ? (
          <Spinner size="tiny" />
        ) : loggedIn ? (
          <>
            <div className={styles.userInfo}>
              <Person20Regular />
              <Text weight="semibold">{username}</Text>
            </div>
            <Button size="small" icon={<Dismiss20Regular />} onClick={logout}>退出登录</Button>
          </>
        ) : (
          <div className={styles.loginForm}>
            <Input
              placeholder="用户名 / 邮箱"
              value={loginUser}
              onChange={(_e, d) => setLoginUser(d.value)}
              contentBefore={<Person20Regular />}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLogin() }}
              disabled={loginLoading}
              size="small"
            />
            <Input
              type="password"
              placeholder="密码"
              value={loginPwd}
              onChange={(_e, d) => setLoginPwd(d.value)}
              contentBefore={<Key20Regular />}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLogin() }}
              disabled={loginLoading}
              size="small"
            />
            <Button appearance="primary" size="small" onClick={handleLogin} disabled={loginLoading}>
              {loginLoading ? <Spinner size="tiny" /> : '登录'}
            </Button>
            {loginErr && <Text size={200} style={{ color: tokens.colorStatusDangerForeground1 }}>{loginErr}</Text>}
          </div>
        )}
      </div>
      {!loggedIn && !validating && (
        <div className={styles.hint}>登录后可同步您的禁漫天堂在线收藏和历史记录</div>
      )}

      {/* 主 Tab */}
      <div className={styles.tabRow}>
        <TabList selectedValue={mainTab} onTabSelect={(_e, d) => setMainTab(d.value as MainTab)}>
          <Tab value="online-fav">在线收藏</Tab>
          <Tab value="local-fav">本地收藏</Tab>
          <Tab value="history">历史记录</Tab>
        </TabList>
      </div>

      {/* 在线收藏 */}
      {mainTab === 'online-fav' && (
        !loggedIn ? (
          <div className={styles.statusMsg}><Text>请先登录后查看在线收藏</Text></div>
        ) : onlineFavLoading ? (
          <div className={styles.statusMsg}><Spinner size="large" /><Text>加载中...</Text></div>
        ) : onlineFavErr ? (
          <div className={styles.statusMsg}><Text>⚠️ {onlineFavErr}</Text></div>
        ) : onlineFav.length === 0 ? (
          <div className={styles.statusMsg}><Text>暂无在线收藏</Text></div>
        ) : (
          <>
            <div className={styles.grid}>
              {onlineFav.map((m) => <MangaCard key={m.id} manga={m} />)}
            </div>
            <div className={styles.pagination}>
              <Button size="small" icon={<ArrowPrevious20Regular />} disabled={onlineFavPage <= 1}
                onClick={() => loadOnlineFav(onlineFavPage - 1)}>上一页</Button>
              <span className={styles.pageText}>{onlineFavPage} / {onlineFavTotal}</span>
              <Button size="small" icon={<ArrowNext20Regular />} disabled={onlineFavPage >= onlineFavTotal}
                onClick={() => loadOnlineFav(onlineFavPage + 1)}>下一页</Button>
            </div>
          </>
        )
      )}

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
              <div key={f.manga_id} style={{ position: 'relative' }}>
                <MangaCard manga={{ id: f.manga_id, title: f.title, coverUrl: f.cover_url }} />
                <Tooltip content="取消收藏" relationship="label">
                  <Button size="small" appearance="subtle" icon={<Dismiss20Regular />}
                    style={{ position: 'absolute', top: '4px', right: '4px' }}
                    onClick={(e) => { e.stopPropagation(); handleRemoveFav(f.manga_id) }} />
                </Tooltip>
              </div>
            ))}
          </div>
        )
      )}

      {/* 历史记录 */}
      {mainTab === 'history' && (
        <>
          <div className={styles.subTabRow}>
            <TabList selectedValue={historyTab} onTabSelect={(_e, d) => setHistoryTab(d.value as HistoryTab)} size="small">
              <Tab value="local-history">本地历史</Tab>
              <Tab value="online-history">在线历史</Tab>
            </TabList>
          </div>

          {historyTab === 'local-history' && (
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

          {historyTab === 'online-history' && (
            !loggedIn ? (
              <div className={styles.statusMsg}><Text>请先登录后查看在线历史</Text></div>
            ) : onlineHistoryLoading ? (
              <div className={styles.statusMsg}><Spinner size="large" /><Text>加载中...</Text></div>
            ) : onlineHistoryErr ? (
              <div className={styles.statusMsg}>
                <Text>⚠️ {onlineHistoryErr}</Text>
                <Text size={200}>在线历史页可能无法抓取，请使用本地历史</Text>
              </div>
            ) : onlineHistory.length === 0 ? (
              <div className={styles.statusMsg}><Text>暂无在线历史</Text></div>
            ) : (
              <>
                <div className={styles.grid}>
                  {onlineHistory.map((m) => <MangaCard key={m.id} manga={m} />)}
                </div>
                <div className={styles.pagination}>
                  <Button size="small" icon={<ArrowPrevious20Regular />} disabled={onlineHistoryPage <= 1}
                    onClick={() => loadOnlineHistory(onlineHistoryPage - 1)}>上一页</Button>
                  <span className={styles.pageText}>{onlineHistoryPage} / {onlineHistoryTotal}</span>
                  <Button size="small" icon={<ArrowNext20Regular />} disabled={onlineHistoryPage >= onlineHistoryTotal}
                    onClick={() => loadOnlineHistory(onlineHistoryPage + 1)}>下一页</Button>
                </div>
              </>
            )
          )}
        </>
      )}
    </div>
  )
}
