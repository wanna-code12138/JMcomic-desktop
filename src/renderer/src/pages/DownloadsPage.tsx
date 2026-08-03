import React from 'react'
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent,
  DialogSurface, DialogTitle, makeStyles, Tab, TabList, Text, Tooltip
} from '@fluentui/react-components'
import {
  ArrowClockwise20Regular, Dismiss20Regular, FolderOpen20Regular,
  BookOpen20Regular, Delete20Regular
} from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'
import { toJmImg } from '../utils/image'

interface DownloadRow {
  id: number
  mangaId: string
  mangaTitle: string
  chapterIndex: number
  chapterTitle: string
  chapterUrl?: string
  coverUrl?: string
  error?: string
  status: string
  totalPages: number
  downloadedPages: number
  savePath: string
  createdAt: number
}

interface MangaGroup {
  mangaId: string
  mangaTitle: string
  coverUrl: string
  createdAt: number
  tasks: DownloadRow[]
  totalChapters: number
  completedChapters: number
  activeTasks: number
  failedTasks: number
}

type MainTab = 'manga' | 'tasks'

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  downloading: '下载中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消'
}

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  tabRow: { marginBottom: '16px' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  mangaCard: {
    cursor: 'pointer',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
    ':hover': {
      transform: 'translateY(-3px)',
      boxShadow: '0 8px 20px var(--ac-glass-shadow)'
    }
  },
  imageWrap: {
    position: 'relative',
    borderRadius: 'var(--ac-radius-card)',
    overflow: 'hidden',
    border: '1px solid var(--ac-glass-border)',
    boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi), var(--ac-glass-shadow)'
  },
  cover: {
    display: 'block',
    width: '100%',
    aspectRatio: '3/4',
    objectFit: 'cover',
    backgroundColor: 'var(--ac-base-bg)'
  },
  coverPlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    aspectRatio: '3/4',
    color: 'var(--ac-text-3)',
    backgroundColor: 'var(--ac-base-bg)'
  },
  mangaActions: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    display: 'flex',
    gap: '4px',
    opacity: 0,
    transition: 'opacity 0.18s ease',
    ':hover': { opacity: 1 }
  },
  mangaActionsVisible: { opacity: 1 },
  mangaTitle: {
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: '20px',
    maxHeight: '40px',
    marginTop: '9px',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    color: 'var(--ac-text-1)'
  },
  mangaMeta: {
    fontSize: '12px',
    color: 'var(--ac-text-3)',
    marginTop: '4px'
  },
  statusMsg: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
    color: 'var(--ac-text-3)',
    gap: '12px'
  },
  taskList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  taskItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '12px 16px',
    borderRadius: 'var(--ac-radius-row)',
    backgroundColor: 'var(--ac-glass-bg)',
    border: '1px solid var(--ac-glass-border)',
    boxShadow: 'inset 0 1px 0 var(--ac-glass-inset-hi)'
  },
  taskInfo: { flex: 1, minWidth: 0 },
  taskTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--ac-text-1)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  taskMeta: {
    fontSize: '12px',
    color: 'var(--ac-text-3)',
    marginTop: '4px'
  },
  taskProgress: {
    width: '160px',
    minWidth: '120px'
  },
  taskActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  }
})

export default function DownloadsPage(): JSX.Element {
  const styles = useStyles()
  const setCurrentLocalMangaId = useAppStore((s) => s.setCurrentLocalMangaId)
  const [mainTab, setMainTab] = React.useState<MainTab>('manga')
  const [groups, setGroups] = React.useState<MangaGroup[]>([])
  const [loading, setLoading] = React.useState(true)
  const [actionError, setActionError] = React.useState('')
  const [actionMsg, setActionMsg] = React.useState('')
  const [retrying, setRetrying] = React.useState(false)
  const [confirm, setConfirm] = React.useState<{
    title: string
    body: string
    onConfirm: () => void
  } | null>(null)

  const load = React.useCallback(async (): Promise<void> => {
    setActionError('')
    setActionMsg('')
    const list = (await window.electronAPI?.downloadSummary()) as MangaGroup[] | undefined
    setGroups(list ?? [])
    setLoading(false)
  }, [])

  React.useEffect(() => {
    void load()
    const off = window.electronAPI?.onDownloadProgress(() => {
      void load()
    })
    return () => off?.()
  }, [load])

  const allTasks = React.useMemo(
    () => groups.flatMap((g) => g.tasks).sort((a, b) => b.createdAt - a.createdAt),
    [groups]
  )
  const completedGroups = React.useMemo(
    () => groups.filter((g) => g.completedChapters > 0),
    [groups]
  )
  const retryableCount = React.useMemo(
    () => allTasks.filter((t) => t.status === 'failed' || t.status === 'cancelled').length,
    [allTasks]
  )

  const handleRetryAllFailed = async (): Promise<void> => {
    setRetrying(true)
    setActionMsg('')
    setActionError('')
    try {
      const r = await window.electronAPI?.downloadRetryFailed()
      if (!r?.ok) {
        setActionError(r?.error ?? '重试失败')
      } else if (r.retried > 0) {
        setActionMsg(`已重新加入队列 ${r.retried} 个任务`)
      } else {
        setActionMsg('没有可重试的失败任务')
      }
    } catch (err) {
      setActionError(String(err))
    } finally {
      setRetrying(false)
      void load()
    }
  }

  const askRemoveManga = (group: MangaGroup, deleteFiles: boolean): void => {
    setConfirm({
      title: deleteFiles ? '删除记录和本地文件' : '删除下载记录',
      body: deleteFiles
        ? `确定删除《${group.mangaTitle}》的 ${group.tasks.length} 条下载记录，并删除本地文件吗？此操作不可恢复。`
        : `确定删除《${group.mangaTitle}》的 ${group.tasks.length} 条下载记录吗？本地文件将保留。`,
      onConfirm: () => {
        void window.electronAPI?.downloadRemoveManga(group.mangaId, deleteFiles).then((r) => {
          if (!r?.ok) setActionError(r?.error ?? '删除失败')
          void load()
        })
      }
    })
  }

  const askRemoveTask = (task: DownloadRow, deleteFiles: boolean): void => {
    setConfirm({
      title: deleteFiles ? '删除记录和本地文件' : '删除下载记录',
      body: deleteFiles
        ? `确定删除任务《${task.mangaTitle} - ${task.chapterTitle}》并删除本地文件吗？此操作不可恢复。`
        : `确定删除任务《${task.mangaTitle} - ${task.chapterTitle}》吗？本地文件将保留。`,
      onConfirm: () => {
        void window.electronAPI?.downloadRemove(task.id, deleteFiles).then((r) => {
          if (!r?.ok) setActionError(r?.error ?? '删除失败')
          void load()
        })
      }
    })
  }

  return (
    <div className={styles.root}>
      <div className={styles.tabRow}>
        <TabList selectedValue={mainTab} onTabSelect={(_e, d) => setMainTab(d.value as MainTab)}>
          <Tab value="manga">已下载</Tab>
          <Tab value="tasks">任务</Tab>
        </TabList>
      </div>
      {actionError && (
        <Text size={200} style={{ color: 'var(--ac-danger, #d13438)', display: 'block', marginBottom: '10px' }}>
          {actionError}
        </Text>
      )}
      {actionMsg && (
        <Text size={200} style={{ color: 'var(--ac-green, #4caf50)', display: 'block', marginBottom: '10px' }}>
          {actionMsg}
        </Text>
      )}

      {loading ? (
        <div className={styles.statusMsg}><Text size={300}>加载中…</Text></div>
      ) : mainTab === 'manga' ? (
        completedGroups.length === 0 ? (
          <div className={styles.statusMsg}>
            <Text size={400}>📥 还没有下载完成的漫画</Text>
            <Text size={200}>下载完成后会出现在这里，点击即可离线阅读</Text>
          </div>
        ) : (
          <div className={styles.grid}>
            {completedGroups.map((g) => (
              <div
                key={g.mangaId}
                className={styles.mangaCard}
                role="button"
                tabIndex={0}
                onClick={() => setCurrentLocalMangaId(g.mangaId)}
                onKeyDown={(e) => { if (e.key === 'Enter') setCurrentLocalMangaId(g.mangaId) }}
              >
                <div className={styles.imageWrap}>
                  {g.coverUrl ? (
                    <img className={styles.cover} src={toJmImg(g.coverUrl)} alt={g.mangaTitle} loading="lazy" />
                  ) : (
                    <div className={styles.coverPlaceholder}><BookOpen20Regular style={{ width: '36px', height: '36px' }} /></div>
                  )}
                  <div
                    className={styles.mangaActions}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tooltip content="打开文件夹" relationship="label">
                      <Button size="small" appearance="secondary" icon={<FolderOpen20Regular />}
                        onClick={() => void window.electronAPI?.downloadOpenMangaFolder(g.mangaId).then((r) => {
                          if (!r?.ok) setActionError(r?.error ?? '打开文件夹失败')
                        })} />
                    </Tooltip>
                    <Tooltip content="删除记录" relationship="label">
                      <Button size="small" appearance="secondary" icon={<Delete20Regular />}
                        onClick={() => askRemoveManga(g, false)} />
                    </Tooltip>
                    <Tooltip content="删除记录+文件" relationship="label">
                      <Button size="small" appearance="secondary" icon={<Dismiss20Regular />}
                        onClick={() => askRemoveManga(g, true)} />
                    </Tooltip>
                  </div>
                </div>
                <div className={styles.mangaTitle}>{g.mangaTitle}</div>
                <div className={styles.mangaMeta}>
                  已下载 {g.completedChapters}/{g.totalChapters} 章
                  {g.activeTasks > 0 && ` · 下载中 ${g.activeTasks}`}
                  {g.failedTasks > 0 && ` · 失败 ${g.failedTasks}`}
                </div>
              </div>
            ))}
          </div>
        )
      ) : allTasks.length === 0 ? (
        <div className={styles.statusMsg}>
          <Text size={400}>暂无下载任务</Text>
          <Text size={200}>开始下载后可以在这里查看进度和管理任务</Text>
        </div>
      ) : (
        <>
          {retryableCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
              <Button
                size="small"
                appearance="secondary"
                icon={<ArrowClockwise20Regular />}
                disabled={retrying}
                onClick={() => void handleRetryAllFailed()}
              >
                {retrying ? '正在重试…' : `重试全部失败 (${retryableCount})`}
              </Button>
            </div>
          )}
          <div className={styles.taskList}>
            {allTasks.map((task) => {
            const progress = task.totalPages > 0
              ? Math.min(1, task.downloadedPages / task.totalPages)
              : 0
            const active = task.status === 'pending' || task.status === 'downloading'
            const retryable = task.status === 'failed' || task.status === 'cancelled'
            return (
              <div key={task.id} className={styles.taskItem}>
                <div className={styles.taskInfo}>
                  <div className={styles.taskTitle}>
                    {task.mangaTitle} - {task.chapterTitle}
                  </div>
                  <div className={styles.taskMeta}>
                    {STATUS_LABEL[task.status] ?? task.status}
                    {active && ` · ${task.downloadedPages}/${task.totalPages} 页`}
                  </div>
                  {(task.status === 'failed' || task.status === 'cancelled') && task.error && (
                    <Text size={200} style={{ color: 'var(--ac-danger, #d13438)', display: 'block', marginTop: '2px' }}>
                      {task.error}
                    </Text>
                  )}
                  {(task.status === 'downloading' || task.status === 'pending') && (
                    <div className={styles.taskProgress} style={{ marginTop: '6px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--ac-glass-border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, backgroundColor: 'var(--ac-brand)', transition: 'width 0.2s ease' }} />
                    </div>
                  )}
                </div>
                <div className={styles.taskActions}>
                  {active && (
                    <Tooltip content="取消" relationship="label">
                      <Button size="small" appearance="subtle" icon={<Dismiss20Regular />}
                        onClick={() => void window.electronAPI?.downloadCancel(task.id)} />
                    </Tooltip>
                  )}
                  {retryable && (
                    <Tooltip content="重试" relationship="label">
                      <Button size="small" appearance="subtle" icon={<ArrowClockwise20Regular />}
                        onClick={() => void window.electronAPI?.downloadRetry(task.id)} />
                    </Tooltip>
                  )}
                  <Tooltip content="打开文件夹" relationship="label">
                    <Button size="small" appearance="subtle" icon={<FolderOpen20Regular />}
                      onClick={() => void window.electronAPI?.downloadOpenTaskFolder(task.id).then((r) => {
                        if (!r?.ok) setActionError(r?.error ?? '打开文件夹失败')
                      })} />
                  </Tooltip>
                  <Tooltip content="删除记录" relationship="label">
                    <Button size="small" appearance="subtle" icon={<Delete20Regular />}
                      onClick={() => askRemoveTask(task, false)} />
                  </Tooltip>
                  <Tooltip content="删除记录+文件" relationship="label">
                    <Button size="small" appearance="subtle" icon={<Dismiss20Regular />}
                      onClick={() => askRemoveTask(task, true)} />
                  </Tooltip>
                </div>
              </div>
            )
            })}
          </div>
        </>
      )}
      <Dialog open={confirm !== null} onOpenChange={(_e, d) => { if (!d.open) setConfirm(null) }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{confirm?.title}</DialogTitle>
            <DialogContent>
              <Text size={300} style={{ whiteSpace: 'pre-line' }}>{confirm?.body}</Text>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirm(null)}>取消</Button>
              <Button
                appearance="primary"
                style={{ backgroundColor: 'var(--ac-danger, #d13438)' }}
                onClick={() => {
                  confirm?.onConfirm()
                  setConfirm(null)
                }}
              >
                删除
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
