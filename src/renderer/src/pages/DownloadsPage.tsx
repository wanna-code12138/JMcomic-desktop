import React from 'react'
import {
  Button, makeStyles, Tab, TabList, Text, Tooltip
} from '@fluentui/react-components'
import {
  ArrowClockwise20Regular, Dismiss20Regular, FolderOpen20Regular,
  BookOpen20Regular, Delete20Regular
} from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'
import { toJmImg } from '../utils/image'

interface DownloadRow {
  id: number
  manga_id: string
  manga_title: string
  chapter_index: number
  chapter_title: string
  chapter_url?: string
  cover_url?: string
  status: string
  total_pages: number
  downloaded_pages: number
  save_path: string
  created_at: number
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

  const load = React.useCallback(async (): Promise<void> => {
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
    () => groups.flatMap((g) => g.tasks).sort((a, b) => b.created_at - a.created_at),
    [groups]
  )

  const handleRemoveManga = async (group: MangaGroup, deleteFiles: boolean): Promise<void> => {
    const confirmed = window.confirm(
      deleteFiles
        ? `确定删除《${group.mangaTitle}》的 ${group.tasks.length} 条下载记录，并删除本地文件吗？\n此操作不可恢复。`
        : `确定删除《${group.mangaTitle}》的 ${group.tasks.length} 条下载记录吗？\n本地文件将保留。`
    )
    if (!confirmed) return
    await window.electronAPI?.downloadRemoveManga(group.mangaId, deleteFiles)
    void load()
  }

  const handleRemoveTask = async (task: DownloadRow, deleteFiles: boolean): Promise<void> => {
    const confirmed = window.confirm(
      deleteFiles
        ? `确定删除任务《${task.manga_title} - ${task.chapter_title}》并删除本地文件吗？`
        : `确定删除任务《${task.manga_title} - ${task.chapter_title}》吗？\n本地文件将保留。`
    )
    if (!confirmed) return
    await window.electronAPI?.downloadRemove(task.id, deleteFiles)
    void load()
  }

  return (
    <div className={styles.root}>
      <div className={styles.tabRow}>
        <TabList selectedValue={mainTab} onTabSelect={(_e, d) => setMainTab(d.value as MainTab)}>
          <Tab value="manga">已下载</Tab>
          <Tab value="tasks">任务</Tab>
        </TabList>
      </div>

      {loading ? (
        <div className={styles.statusMsg}><Text size={300}>加载中…</Text></div>
      ) : mainTab === 'manga' ? (
        groups.length === 0 ? (
          <div className={styles.statusMsg}>
            <Text size={400}>📥 还没有下载记录</Text>
            <Text size={200}>在漫画详情页点击下载，即可在这里离线阅读</Text>
          </div>
        ) : (
          <div className={styles.grid}>
            {groups.map((g) => (
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
                        onClick={() => void window.electronAPI?.downloadOpenMangaFolder(g.mangaId)} />
                    </Tooltip>
                    <Tooltip content="删除记录" relationship="label">
                      <Button size="small" appearance="secondary" icon={<Delete20Regular />}
                        onClick={() => void handleRemoveManga(g, false)} />
                    </Tooltip>
                    <Tooltip content="删除记录+文件" relationship="label">
                      <Button size="small" appearance="secondary" icon={<Dismiss20Regular />}
                        onClick={() => void handleRemoveManga(g, true)} />
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
        <div className={styles.taskList}>
          {allTasks.map((task) => {
            const progress = task.total_pages > 0
              ? Math.min(1, task.downloaded_pages / task.total_pages)
              : 0
            const active = task.status === 'pending' || task.status === 'downloading'
            const retryable = task.status === 'failed' || task.status === 'cancelled'
            return (
              <div key={task.id} className={styles.taskItem}>
                <div className={styles.taskInfo}>
                  <div className={styles.taskTitle}>
                    {task.manga_title} - {task.chapter_title}
                  </div>
                  <div className={styles.taskMeta}>
                    {STATUS_LABEL[task.status] ?? task.status}
                    {active && ` · ${task.downloaded_pages}/${task.total_pages} 页`}
                  </div>
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
                      onClick={() => void window.electronAPI?.downloadOpenTaskFolder(task.id)} />
                  </Tooltip>
                  <Tooltip content="删除记录" relationship="label">
                    <Button size="small" appearance="subtle" icon={<Delete20Regular />}
                      onClick={() => void handleRemoveTask(task, false)} />
                  </Tooltip>
                  <Tooltip content="删除记录+文件" relationship="label">
                    <Button size="small" appearance="subtle" icon={<Dismiss20Regular />}
                      onClick={() => void handleRemoveTask(task, true)} />
                  </Tooltip>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
