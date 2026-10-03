import React from 'react'
import { Button, Field, Input, Spinner, Text, Textarea } from '@fluentui/react-components'
import { useAccountRead } from './useAccountRead'
import { useAccountAction } from './useAccountAction'
import { useCommunityStyles } from './communityStyles'
import type { EditableProfile } from '../../../shared/accountContracts'

export function AccountTagsPanel({ visible }: { visible: boolean }): JSX.Element {
  const styles = useCommunityStyles(), [tag, setTag] = React.useState(''), action = useAccountAction()
  const load = React.useCallback((generation: number) => window.electronAPI!.accountTags(generation), [])
  const query = useAccountRead(visible, load)
  const change = (value: string, desired: boolean): void => { void action.run((generation, operationId) => window.electronAPI!.accountTag({ generation, operationId, tag: value, desired }), data => { query.replace(data); if (desired) setTag('') }) }
  return <section className={`${styles.card} ${styles.stack}`} aria-label="账户收藏标签">
    <Text className={styles.hint}>这些是账户收藏的站点标签。中文名称按站点的繁体形式保存和显示。</Text>
    <Field label="新增收藏标签"><Input aria-label="新增收藏标签" maxLength={80} value={tag} disabled={action.busy} onChange={(_, data) => setTag(data.value)} /></Field>
    <div className={styles.row}><Button appearance="primary" disabled={action.busy || query.loading || !query.data || !tag.trim() || tag.includes(',')} onClick={() => change(tag, true)}>收藏标签</Button><Button disabled={action.busy || query.loading} onClick={query.refresh}>刷新标签</Button></div>
    {query.loading && <Spinner size="small" label="加载收藏标签…" />}{(query.error || action.message) && <Text role="status">{action.message || query.error}</Text>}
    {query.data?.length === 0 && <Text>暂无收藏标签</Text>}
    <div className={styles.row}>{query.data?.map(value => <div key={value} className={styles.row}><Text>{value}</Text><Button size="small" aria-label={`取消收藏标签 ${value}`} disabled={action.busy} onClick={() => change(value, false)}>取消收藏</Button></div>)}</div>
  </section>
}

function ProfileForm({ value, onSaved }: { value: EditableProfile; onSaved(value: EditableProfile): void }): JSX.Element {
  const styles = useCommunityStyles(), action = useAccountAction()
  const [draft, setDraft] = React.useState(value), [confirm, setConfirm] = React.useState(false)
  const changed = (Object.keys(value) as (keyof EditableProfile)[]).some(key => value[key] !== draft[key])
  const field = (key: keyof EditableProfile, value: string): void => { setDraft(previous => ({ ...previous, [key]: value })); setConfirm(false) }
  return <div className={styles.stack}>
    <Text className={styles.hint}>昵称、简介和网站可能公开展示。保存前会核对资料是否已被其他客户端修改。</Text>
    <Field label="昵称"><Input aria-label="在线昵称" maxLength={120} value={draft.nickName} disabled={action.busy} onChange={(_, data) => field('nickName', data.value)} /></Field>
    <Field label="个人简介"><Textarea aria-label="在线个人简介" resize="vertical" maxLength={2000} value={draft.aboutMe} disabled={action.busy} onChange={(_, data) => field('aboutMe', data.value)} /></Field>
    <Field label="网站（http 或 https）"><Input aria-label="在线网站" maxLength={500} value={draft.website} disabled={action.busy} onChange={(_, data) => field('website', data.value)} /></Field>
    <div className={styles.row}><Button appearance="primary" disabled={action.busy || !changed} onClick={() => setConfirm(true)}>保存公开资料…</Button><Button disabled={action.busy || !changed} onClick={() => { setDraft(value); setConfirm(false) }}>撤销编辑</Button></div>
    {confirm && <div className={styles.card} role="alertdialog" aria-label="确认保存公开资料"><Text>将更新当前账户的公开资料，确认保存？</Text><div className={styles.row}>
      <Button appearance="primary" disabled={action.busy} onClick={() => void action.run((generation, operationId) => window.electronAPI!.accountProfileUpdate({ generation, operationId, expected: value, value: draft }), result => { setConfirm(false); onSaved(result) })}>确认保存资料</Button><Button disabled={action.busy} onClick={() => setConfirm(false)}>取消</Button></div></div>}
    {action.message && <Text role="status">{action.message}</Text>}
  </div>
}
export function AccountProfilePanel({ visible }: { visible: boolean }): JSX.Element {
  const styles = useCommunityStyles(), load = React.useCallback((generation: number) => window.electronAPI!.accountProfile(generation), [])
  const query = useAccountRead(visible, load), [revision, setRevision] = React.useState(0)
  return <section className={`${styles.card} ${styles.stack}`} aria-label="在线资料">
    <div><Button disabled={query.loading} onClick={() => { query.refresh(); setRevision(value => value + 1) }}>重新加载资料</Button></div>
    {query.loading && <Spinner size="small" label="读取在线资料…" />}{query.error && <Text role="alert">{query.error}</Text>}
    {!query.loading && query.data && <ProfileForm key={`${revision}:${JSON.stringify(query.data)}`} value={query.data} onSaved={query.replace} />}
  </section>
}
