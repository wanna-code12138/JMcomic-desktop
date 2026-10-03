import React from 'react'
import { Button, Field, Text, Textarea } from '@fluentui/react-components'
import { useAccountStore } from '../stores/accountStore'
import { useAppStore } from '../stores/appStore'
import { commentDrafts } from '../stores/commentDraftStore'
import { useCommunityStyles } from './communityStyles'

interface Props { albumId: string; parentId: string; author?: string; onSent(): void; onCancel(): void }
function Composer(props: Props & { generation: number }): JSX.Element {
  const styles = useCommunityStyles(), key = `${props.generation}:${props.albumId}:${props.parentId}`
  const [draft, setDraft] = React.useState(() => commentDrafts.read(key)), [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState('')
  const sending = React.useRef(false)
  const submit = async (): Promise<void> => {
    if (sending.current || draft.uncertain || !draft.text.trim()) return
    sending.current = true; setBusy(true); setMessage('')
    const uncertain = (): void => { commentDrafts.markUncertain(key); setDraft(commentDrafts.read(key)); setMessage('发送结果未知。草稿已保留，请先查看最新评论，确认未发布后再解锁发送。') }
    try {
      const reply = await window.electronAPI!.accountPostComment({ albumId: props.albumId, parentId: props.parentId, text: draft.text,
        generation: props.generation, operationId: crypto.randomUUID() })
      if (useAccountStore.getState().state.generation !== props.generation) return
      if (reply.ok) { commentDrafts.remove(key); setDraft(commentDrafts.read(key)); setMessage('已发表。'); props.onSent() }
      else if (reply.code === 'OUTCOME_UNKNOWN') uncertain()
      else setMessage(reply.error)
    } catch { if (useAccountStore.getState().state.generation === props.generation) uncertain() }
    finally { sending.current = false; setBusy(false) }
  }
  return <div className={`${styles.card} ${styles.stack}`} aria-label="评论编辑器">
    <Field label={props.parentId === '0' ? '发表评论' : `回复 ${props.author || '这条评论'}`}>
      <Textarea aria-label="评论内容" resize="vertical" rows={4} maxLength={2000} value={draft.text} disabled={busy}
        onChange={(_, data) => { commentDrafts.write(key, data.value); setDraft(commentDrafts.read(key)) }} />
    </Field>
    <Text className={styles.hint}>将公开发布到作品 JM{props.albumId}。草稿仅保留在本次运行中，退出账户后清除。{draft.text.length}/2000</Text>
    {message && <Text role="status" className={styles.hint}>{message}</Text>}
    <div className={styles.row}>
      <Button appearance="primary" disabled={busy || draft.uncertain || !draft.text.trim()} onClick={() => void submit()}>{busy ? '正在发送…' : props.parentId === '0' ? '公开发表' : '公开回复'}</Button>
      <Button disabled={busy} onClick={props.onCancel}>收起编辑器</Button>
      {draft.uncertain && <Button disabled={busy} onClick={() => { commentDrafts.acknowledge(key); setDraft(commentDrafts.read(key)); setMessage('已解除发送锁定，请确认内容后手动发送。') }}>确认未发布，解锁发送</Button>}
    </div>
  </div>
}
export default function CommentComposer(props: Props): JSX.Element {
  const state = useAccountStore(store => store.state)
  if (state.phase !== 'authenticated') return <Button onClick={() => useAppStore.getState().setCurrentPage('account')}>登录后发表评论</Button>
  return <Composer key={`${state.generation}:${props.albumId}:${props.parentId}`} {...props} generation={state.generation} />
}
