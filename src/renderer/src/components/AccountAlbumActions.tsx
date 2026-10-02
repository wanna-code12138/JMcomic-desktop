import React from 'react'
import { Button, Text } from '@fluentui/react-components'
import type { AlbumAccountState } from '../../../shared/accountContracts'
import { useAccountStore } from '../stores/accountStore'
import { useAppStore } from '../stores/appStore'
import { useCommunityStyles } from './communityStyles'

export default function AccountAlbumActions({ id, visible }: { id: string; visible: boolean }): JSX.Element {
  const styles = useCommunityStyles(), state = useAccountStore(store => store.state)
  const [data, setData] = React.useState<{ generation: number; album: AlbumAccountState } | null>(null)
  const [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false), [revision, setRevision] = React.useState(0)
  React.useEffect(() => {
    if (!visible || state.phase !== 'authenticated' || !window.electronAPI) return
    let cancelled = false; setError(''); setBusy(true)
    void window.electronAPI.accountAlbum(id, state.generation).then(reply => {
      if (cancelled) return
      if (reply.ok) setData({ generation: state.generation, album: reply.data }); else setError(reply.error)
    }).catch(() => { if (!cancelled) setError('在线状态暂时不可用。') }).finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [id, visible, state.phase, state.generation, revision])
  const album = data?.generation === state.generation && data.album.id === id ? data.album : null
  const toggle = async (kind: 'favorite' | 'tracking', desired: boolean): Promise<void> => {
    if (busy) return
    setBusy(true); setError('')
    try {
      const reply = await window.electronAPI!.accountMutate({ id, kind, desired, generation: state.generation, operationId: crypto.randomUUID() })
      if (useAccountStore.getState().state.generation !== state.generation) return
      if (reply.ok) setData(previous => ({ generation: state.generation, album: { id, favorite: previous?.album.favorite ?? null, tracking: previous?.album.tracking ?? null, [kind]: reply.data[kind] } }))
      else setError(reply.error)
    } catch { setError('尚未确认操作结果，请先刷新在线状态。') } finally { setBusy(false) }
  }
  if (state.phase !== 'authenticated') return <div className={styles.row}><Button size="small" onClick={() => useAppStore.getState().setCurrentPage('account')}>登录使用在线收藏与追更</Button></div>
  return <div className={styles.stack}>
    <div className={styles.row}>
      <Button size="small" disabled={busy || album?.favorite === null || !album} aria-pressed={album?.favorite ?? false} onClick={() => void toggle('favorite', !album?.favorite)}>{album?.favorite ? '取消在线收藏' : '在线收藏'}</Button>
      <Button size="small" disabled={busy || album?.tracking === null || !album} aria-pressed={album?.tracking ?? false} onClick={() => void toggle('tracking', !album?.tracking)}>{album?.tracking ? '取消追更' : '追更'}</Button>
      <Button size="small" appearance="subtle" disabled={busy} onClick={() => setRevision(value => value + 1)}>刷新在线状态</Button>
    </div>
    {error && <Text role="alert" className={styles.error}>{error}</Text>}
    {!busy && album && (album.favorite === null || album.tracking === null) && <Text className={styles.hint}>部分在线状态暂不可用，可稍后刷新。</Text>}
  </div>
}
