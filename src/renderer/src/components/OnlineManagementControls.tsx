import React from 'react'
import { Button, Field, Input, Select, Text } from '@fluentui/react-components'
import type { FavoriteFolder, FolderMutation } from '../../../shared/accountContracts'
import { useCommunityStyles } from './communityStyles'
import { useAccountRead } from './useAccountRead'
import { useAccountAction } from './useAccountAction'

type FolderAction = FolderMutation extends infer T ? T extends FolderMutation ? Omit<T, 'generation' | 'operationId'> : never : never
export function OnlineFolderManager({ onChanged }: { onChanged(): void }): JSX.Element {
  const styles = useCommunityStyles(), [name, setName] = React.useState(''), [selected, setSelected] = React.useState(''), [confirm, setConfirm] = React.useState(false)
  const load = React.useCallback((generation: number) => window.electronAPI!.accountFolders(generation), [])
  const query = useAccountRead(true, load), action = useAccountAction(), folders = query.data?.filter(folder => folder.id !== '0') ?? []
  const run = (value: FolderAction): void => { void action.run((generation, operationId) => window.electronAPI!.accountFolder({ ...value, generation, operationId }), data => { query.replace(data); setName(''); setConfirm(false); if (!data.some(folder => folder.id === selected)) setSelected(''); onChanged() }) }
  return <section className={`${styles.card} ${styles.stack}`} aria-label="在线收藏夹管理">
    <Text className={styles.hint}>创建或改名在线收藏夹；删除前会再次确认它为空。</Text>
    <Select aria-label="管理的收藏夹" value={selected} disabled={action.busy} onChange={(_, data) => { setSelected(data.value); setConfirm(false) }}><option value="">选择收藏夹</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</Select>
    <Field label="收藏夹名称"><Input aria-label="收藏夹名称" value={name} maxLength={80} disabled={action.busy} onChange={(_, data) => setName(data.value)} /></Field>
    <div className={styles.row}><Button disabled={action.busy || query.loading || !query.data || !name.trim()} onClick={() => run({ action: 'add', name })}>新建在线收藏夹</Button>
      <Button disabled={action.busy || !selected || !name.trim()} onClick={() => run({ action: 'rename', folderId: selected, name })}>重命名收藏夹</Button>
      <Button disabled={action.busy || !selected} onClick={() => setConfirm(true)}>删除空收藏夹…</Button><Button disabled={action.busy || query.loading} onClick={query.refresh}>刷新收藏夹</Button></div>
    {confirm && <div role="alertdialog" aria-label="确认删除空收藏夹"><Text>确认删除“{folders.find(folder => folder.id === selected)?.name}”？非空收藏夹会被拒绝。</Text><div className={styles.row}><Button disabled={action.busy} onClick={() => run({ action: 'delete', folderId: selected, confirmed: true })}>确认删除空夹</Button><Button disabled={action.busy} onClick={() => setConfirm(false)}>取消</Button></div></div>}
    {(action.message || query.error) && <Text role="status">{action.message || query.error}</Text>}
  </section>
}
export function OnlineAlbumManagement({ kind, albumId, folders, onChanged }: { kind: 'favorites' | 'history'; albumId: string; folders: FavoriteFolder[]; onChanged(): void }): JSX.Element {
  const styles = useCommunityStyles(), action = useAccountAction(), [target, setTarget] = React.useState(''), [confirm, setConfirm] = React.useState(false)
  return <div className={styles.stack}>
    {kind === 'favorites' ? <><Select aria-label={`JM${albumId} 的目标收藏夹`} value={target} disabled={action.busy} onChange={(_, data) => setTarget(data.value)}><option value="">移动到收藏夹</option>{folders.filter(folder => folder.id !== '0').map(folder => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</Select>
      <Button size="small" disabled={action.busy || !target} onClick={() => void action.run((generation, operationId) => window.electronAPI!.accountFolder({ generation, operationId, action: 'move', folderId: target, albumId }), onChanged)}>移动在线收藏</Button></> : <>
      <Button size="small" disabled={action.busy} onClick={() => setConfirm(true)}>删除这条在线历史…</Button>
      {confirm && <div role="alertdialog" aria-label={`确认删除 JM${albumId} 在线历史`}><Text>仅删除 JM{albumId} 的在线记录，本地阅读进度保留。确认删除？</Text><div className={styles.row}>
        <Button size="small" disabled={action.busy} onClick={() => void action.run((generation, operationId) => window.electronAPI!.accountHistoryDelete({ generation, operationId, albumId, confirmed: true }), () => { setConfirm(false); onChanged() })}>确认删除在线历史</Button><Button size="small" disabled={action.busy} onClick={() => setConfirm(false)}>取消</Button></div></div>}</>}
    {action.message && <Text role="status" size={200}>{action.message}</Text>}
  </div>
}
