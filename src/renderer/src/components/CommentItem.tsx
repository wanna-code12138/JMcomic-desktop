import React from 'react'
import type { ComicComment } from '../../../shared/commentContracts'
import { Button, Text } from '@fluentui/react-components'
import { useCommunityStyles } from './communityStyles'

export function CommentItem({ comment, onReply }: { comment: ComicComment; onReply?(comment: ComicComment): void }): JSX.Element {
  const styles = useCommunityStyles()
  const [revealed, setRevealed] = React.useState(false), [expanded, setExpanded] = React.useState(false)
  return <article className={styles.separator} data-comment-id={comment.id}>
    <div className={styles.row}><Text weight="semibold">{comment.author}</Text><Text className={styles.hint}>{comment.createdAt}</Text>
      {comment.likes !== null && <Text className={styles.hint}>{comment.likes} 人赞同</Text>}</div>
    {comment.parentId && <Text size={200} className={styles.hint}>回复</Text>}
    {comment.spoiler && !revealed ? <div className={styles.body}><Button size="small" onClick={() => setRevealed(true)}>显示剧透</Button></div>
      : <div className={styles.body}>{comment.text}</div>}
    {comment.replies.length > 0 && <>
      <Button appearance="subtle" size="small" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '收起回复' : `展开 ${comment.replies.length} 条回复`}</Button>
      {expanded && <div style={{ paddingLeft: '16px', borderLeft: '2px solid var(--ui-stroke-card)' }}>{comment.replies.map(reply => <CommentItem key={reply.id} comment={reply} onReply={onReply} />)}</div>}
    </>}
    {comment.repliesTruncated && <Text className={styles.hint}>回复数量或层级过多，已截断显示。</Text>}
    {onReply && <Button size="small" appearance="subtle" onClick={() => onReply(comment)}>回复这条评论</Button>}
  </article>
}
