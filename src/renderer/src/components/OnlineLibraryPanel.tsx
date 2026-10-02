import React from 'react'
import { Button, Select, Spinner, Text } from '@fluentui/react-components'
import type { LibraryKind, OnlineLibraryPage } from '../../../shared/accountContracts'
import { useAccountStore } from '../stores/accountStore'
import { useAppStore } from '../stores/appStore'
import { useCommunityStyles } from './communityStyles'
import MangaCard from './MangaCard'
import { OnlineFolderManager, OnlineAlbumManagement } from './OnlineManagementControls'

export default function OnlineLibraryPanel({ kind, visible }: { kind: LibraryKind; visible: boolean }): JSX.Element {
  const styles = useCommunityStyles(), state = useAccountStore(store => store.state)
  const [page, setPage] = React.useState(1), [folderId, setFolderId] = React.useState('0'), [revision, setRevision] = React.useState(0)
  const [result, setResult] = React.useState<{ generation: number; folderId: string; data: OnlineLibraryPage } | null>(null)
  const [error, setError] = React.useState(''), [loading, setLoading] = React.useState(false)
  const [manage, setManage] = React.useState(false)
  React.useEffect(() => { setPage(1); setFolderId('0'); setResult(null); setError('') }, [state.generation])
  React.useEffect(() => {
    if (!visible || state.phase !== 'authenticated' || !window.electronAPI) return
    let cancelled = false; setLoading(true); setError('')
    void window.electronAPI.accountLibrary({ kind, page, folderId, generation: state.generation }).then(reply => {
      if (cancelled) return
      if (reply.ok) setResult({ generation: state.generation, folderId, data: reply.data }); else setError(reply.error)
    }).catch(() => { if (!cancelled) setError('在线列表加载失败，请稍后重试。') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [kind, page, folderId, state.phase, state.generation, visible, revision])
  if (state.phase !== 'authenticated') return <div className={styles.stack}>
    <Text className={styles.hint}>登录并验证账户后，即可查看在线{kind === 'favorites' ? '收藏' : kind === 'history' ? '历史' : '追更'}。</Text>
    <div><Button appearance="primary" onClick={() => useAppStore.getState().setCurrentPage('account')}>前往账户</Button></div>
  </div>
  const saved = result?.generation === state.generation ? result : null
  const data = saved?.data.page === page && saved.folderId === folderId ? saved.data : null
  const folders = saved?.data.folders ?? []
  return <section className={styles.stack} aria-label={`在线${kind === 'favorites' ? '收藏' : kind === 'history' ? '历史' : '追更'}`}>
    <div className={styles.row}>
      {kind === 'favorites' && <Select aria-label="在线收藏夹" value={folderId} onChange={(_, value) => { setFolderId(value.value); setPage(1) }}>
        {!folders.some(folder => folder.id === '0') && <option value="0">全部在线收藏</option>}
        {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}{folder.count !== null ? ` (${folder.count})` : ''}</option>)}
      </Select>}
      <Button disabled={loading} onClick={() => setRevision(value => value + 1)}>刷新在线列表</Button>
      {kind === 'favorites' && <Button onClick={() => setManage(value => !value)}>{manage ? '收起收藏夹管理' : '管理在线收藏夹'}</Button>}
      {data?.total !== null && data?.total !== undefined && <Text className={styles.hint}>共 {data.total} 部</Text>}
    </div>
    {manage && kind === 'favorites' && <OnlineFolderManager key={state.generation} onChanged={() => { setFolderId('0'); setPage(1); setRevision(value => value + 1) }} />}
    {kind === 'history' && <Text className={styles.hint}>在线历史可打开作品；精确到页的继续阅读请切换到本地历史。</Text>}
    {kind === 'favorites' && <Text className={styles.hint}>这里展示在线收藏；卡片爱心仍用于本地收藏。</Text>}
    {loading && <Spinner size="small" label="加载在线列表…" />}
    {error && <Text role="alert" className={styles.error}>{error}</Text>}
    {!loading && data && !data.items.length && <Text className={styles.hint}>这一页暂无作品。</Text>}
    {data && <div className={styles.grid}>{data.items.map((album, index) => <div key={`${state.generation}:${album.id}`} className={styles.stack}><MangaCard manga={album} index={index} />
      {kind !== 'tracking' && <OnlineAlbumManagement kind={kind} albumId={album.id} folders={folders} onChanged={() => setRevision(value => value + 1)} />}</div>)}</div>}
    <div className={styles.row}><Button disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>上一页</Button><Text>第 {page} 页</Text>
      <Button disabled={loading || !data?.hasMore} onClick={() => setPage(value => value + 1)}>下一页</Button></div>
  </section>
}
