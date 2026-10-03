import React from 'react'
import { Button, Spinner, Text } from '@fluentui/react-components'
import type { CommentPage } from '../../../shared/commentContracts'
import { useCommunityStyles } from './communityStyles'
import { CommentItem } from './CommentItem'
import CommentComposer from './CommentComposer'
import { useAccountStore } from '../stores/accountStore'

export default function CommentPanel({ albumId, title, visible }: { albumId: string; title: string; visible: boolean }): JSX.Element {
  const styles = useCommunityStyles()
  const [page, setPage] = React.useState(1), [revision, setRevision] = React.useState(0)
  const [data, setData] = React.useState<CommentPage | null>(null), [error, setError] = React.useState(''), [loading, setLoading] = React.useState(false)
  const generation = useAccountStore(store => store.state.generation)
  const [replyTo, setReplyTo] = React.useState<{ id: string; author?: string } | null>(null)
  const composerRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => { setReplyTo(null) }, [generation])
  React.useEffect(() => { if (replyTo) composerRef.current?.scrollIntoView({ block: 'nearest' }) }, [replyTo])
  React.useEffect(() => {
    if (!visible || !window.electronAPI) return
    let cancelled = false
    const requestId = crypto.randomUUID()
    setLoading(true); setError('')
    void window.electronAPI.commentsGet(albumId, page, revision > 0, requestId).then(reply => {
      if (cancelled) return
      if (reply.ok) setData(reply.data); else setError(reply.error)
    }).catch(() => { if (!cancelled) setError('评论暂时加载失败，请重试。') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; void window.electronAPI?.commentsCancel(requestId) }
  }, [albumId, page, revision, visible])
  const current = data?.page === page ? data : null
  return <section className={styles.stack} aria-label="作品评论">
    <Text className={styles.hint}>正在查看《{title}》的评论</Text>
    <div className={styles.row}><Text weight="semibold">评论{current?.total !== null && current?.total !== undefined ? ` (${current.total})` : ''}</Text>
      <Button size="small" disabled={loading} onClick={() => setRevision(value => value + 1)}>刷新评论</Button>
      <Button size="small" onClick={() => setReplyTo({ id: '0' })}>发表评论</Button></div>
    {replyTo && <div ref={composerRef}><CommentComposer albumId={albumId} parentId={replyTo.id} author={replyTo.author}
      onCancel={() => setReplyTo(null)} onSent={() => { setPage(1); setRevision(value => value + 1) }} /></div>}
    {loading && <Spinner size="small" label="正在加载评论…" />}
    {error && <div role="alert" className={styles.error}>{error} <Button size="small" onClick={() => setRevision(value => value + 1)}>重试评论</Button></div>}
    {current?.stale && <Text className={styles.hint}>暂时无法连接，显示最近缓存的评论。</Text>}
    {current?.truncated && <Text className={styles.hint}>本页内容过多，已截断显示。</Text>}
    {!loading && current && !current.items.length && <Text className={styles.hint}>这一页暂无评论。</Text>}
    {current?.items.map(comment => <CommentItem key={`${page}:${comment.id}`} comment={comment} onReply={comment => setReplyTo({ id: comment.id, author: comment.author })} />)}
    <div className={styles.row}><Button disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>上一页评论</Button><Text>第 {page} 页</Text>
      <Button disabled={loading || !current?.hasNext} onClick={() => setPage(value => value + 1)}>下一页评论</Button></div>
  </section>
}
