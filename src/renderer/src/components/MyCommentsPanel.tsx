import React from 'react'
import { Button, Spinner, Text } from '@fluentui/react-components'
import { useAccountRead } from './useAccountRead'
import { useCommunityStyles } from './communityStyles'
import { useAppStore } from '../stores/appStore'
import { CommentItem } from './CommentItem'

export default function MyCommentsPanel({ visible }: { visible: boolean }): JSX.Element {
  const styles = useCommunityStyles(), [page, setPage] = React.useState(1)
  const load = React.useCallback((generation: number) => window.electronAPI!.accountMyComments(page, generation), [page])
  const query = useAccountRead(visible, load)
  return <section className={`${styles.card} ${styles.stack}`} aria-label="我的评论">
    <div className={styles.row}><Text weight="semibold">我的评论{query.data?.total != null ? ` (${query.data.total})` : ''}</Text><Button disabled={query.loading} onClick={query.refresh}>刷新我的评论</Button></div>
    {query.loading && <Spinner size="small" label="加载我的评论…" />}
    {query.error && <Text role="alert" className={styles.error}>{query.error}</Text>}
    {query.data?.items.length === 0 && <Text className={styles.hint}>这一页暂无评论。</Text>}
    {query.data?.items.map(comment => <div key={comment.id}><CommentItem comment={comment} />
      {comment.albumId && <Button size="small" onClick={() => useAppStore.getState().setCurrentMangaId(comment.albumId!)}>打开原作品 JM{comment.albumId}</Button>}</div>)}
    <div className={styles.row}><Button disabled={query.loading || page <= 1} onClick={() => setPage(value => value - 1)}>上一页我的评论</Button><Text>第 {page} 页</Text>
      <Button disabled={query.loading || !query.data?.hasNext} onClick={() => setPage(value => value + 1)}>下一页我的评论</Button></div>
  </section>
}
