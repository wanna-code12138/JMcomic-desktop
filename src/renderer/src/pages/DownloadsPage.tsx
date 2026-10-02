import React from 'react'
import {
  Badge, Button, Dialog, DialogActions, DialogBody, DialogContent,
  DialogSurface, DialogTitle, makeStyles, Tab, TabList, Text, Tooltip
} from '@fluentui/react-components'
import {
  ArrowClockwise20Regular, Dismiss20Regular, FolderOpen20Regular,
  BookOpen20Regular, Delete20Regular, ArrowDownload20Regular
} from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'
import { toJmImg } from '../utils/image'
import { groupTasksByManga, type MangaDownloadGroup, type DownloadTaskRow, type DownloadProgress } from '../../../shared/downloadContracts'
import type { PdfTask } from '../../../shared/pdfContracts'
import { contentTabRow, emptyState, caption } from '../theme/surfaceStyles'

type MainTab = 'manga' | 'tasks'

const STATUS_LABEL: Record<string, string> = {
  pending: '等待中',
  downloading: '下载中',
  resolving: '获取章节', merging: '生成 PDF', committing: '保存 PDF',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消'
}

function missingFileMessage(reason?: DownloadedFileAvailability['availabilityReason']): string {
  if (reason === 'missing-root') return '下载根目录不存在，记录已保留，可打开文件夹检查路径'
  if (reason === 'missing-chapter') return '章节目录不存在，记录已保留'
  return '章节图片不完整，记录已保留'
}

const useStyles = makeStyles({
  root: { padding: '24px', height: '100%', overflow: 'auto' },
  tabRow: contentTabRow,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px'
  },
  mangaCard: {
    cursor: 'pointer',
    borderRadius: 'var(--ui-radius-lg)',
    transition: 'background-color var(--ui-motion-fast) ease-out',
    ':hover': {
      backgroundColor: 'var(--ui-bg-hover)'
    }
  },
  imageWrap: {
    position: 'relative',
    borderRadius: 'var(--ui-radius-md)',
    overflow: 'hidden',
    border: '1px solid var(--ui-stroke-card)'
  },
  cover: {
    display: 'block',
    width: '100%',
    aspectRatio: '3/4',
    objectFit: 'cover',
    backgroundColor: 'var(--ui-bg-canvas)'
  },
  coverPlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    aspectRatio: '3/4',
    color: 'var(--ui-text-tertiary)',
    backgroundColor: 'var(--ui-bg-canvas)'
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
    color: 'var(--ui-text-primary)'
  },
  mangaMeta: {
    ...caption,
    marginTop: '4px'
  },
  statusMsg: emptyState,
  taskList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  taskItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '12px 16px',
    borderRadius: 'var(--ui-radius-lg)',
    backgroundColor: 'var(--ui-bg-card)',
    border: '1px solid var(--ui-stroke-card)'
  },
  taskInfo: { flex: 1, minWidth: 0 },
  taskTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--ui-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  taskMeta: {
    ...caption,
    fontVariantNumeric: 'tabular-nums',
    marginTop: '4px'
  },
  taskProgress: {
    width: '160px',
    minWidth: '120px'
  },
  taskActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end'
  }
})

export default function DownloadsPage(): JSX.Element {
  const styles = useStyles()
  const setCurrentLocalMangaId = useAppStore((s) => s.setCurrentLocalMangaId)
  const [mainTab, setMainTab] = React.useState<MainTab>('manga')
  const [groups, setGroups] = React.useState<MangaDownloadGroup[]>([])
  const [pdfTasks, setPdfTasks] = React.useState<PdfTask[]>([])
  const groupsRef = React.useRef(groups)
  const loadingRequest = React.useRef<Promise<void>>()
  const progressDuringLoad = React.useRef(new Map<string, DownloadProgress>())
  const reloadRequested = React.useRef(false)
  const [loading, setLoading] = React.useState(true)
  const [actionError, setActionError] = React.useState('')
  const [actionMsg, setActionMsg] = React.useState('')
  const [retrying, setRetrying] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const exportCbz = async (selection: { mangaId?: string; taskId?: number }): Promise<void> => {
    setExporting(true); setActionError(''); setActionMsg('正在准备导出…')
    try {
      const result = await window.electronAPI?.downloadExportCbz(selection)
      if (result?.ok) setActionMsg(`已导出 ${result.pages} 页：${result.path}`)
      else { setActionMsg(''); if (!result?.canceled) setActionError(result?.error ?? '导出失败') }
    } catch (error) { setActionMsg(''); setActionError(String(error)) }
    finally { setExporting(false) }
  }
  const [confirm, setConfirm] = React.useState<{
    title: string
    body: string
    onConfirm: () => void
  } | null>(null)

  const load = React.useCallback(async (): Promise<void> => {
    if (loadingRequest.current) { reloadRequested.current = true; return loadingRequest.current }
    loadingRequest.current = (async () => {
      do {
        reloadRequested.current = false
        progressDuringLoad.current.clear()
        const [list, pdf] = await Promise.all([window.electronAPI?.downloadSummary(), window.electronAPI?.downloadPdfList()])
        setPdfTasks((pdf ?? []).map(task => {
          const progress = progressDuringLoad.current.get(`pdf:${task.id}`)
          return progress ? { ...task, status: progress.status, downloadedPages: progress.downloadedPages, totalPages: progress.totalPages,
            mergedPages: progress.mergedPages ?? task.mergedPages } : task
        }))
        groupsRef.current = groupTasksByManga((list ?? []).flatMap(group => group.tasks.map(task => {
          const progress = progressDuringLoad.current.get(`images:${task.id}`)
          return progress ? { ...task, status: progress.status, downloadedPages: progress.downloadedPages, totalPages: progress.totalPages } : task
        })))
        progressDuringLoad.current.clear()
        setGroups(groupsRef.current)
      } while (reloadRequested.current)
    })().catch(error => setActionError(String(error))).finally(() => {
      setLoading(false); loadingRequest.current = undefined; progressDuringLoad.current.clear()
    })
    return loadingRequest.current
  }, [])

  React.useEffect(() => {
    void load()
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = window.electronAPI?.onDownloadProgress((progress) => {
      if (loadingRequest.current) progressDuringLoad.current.set(`${progress.kind ?? 'images'}:${progress.taskId}`, progress)
      if (progress.kind === 'pdf') {
        setPdfTasks(tasks => tasks.map(task => task.id === progress.taskId ? { ...task, status: progress.status, totalPages: progress.totalPages,
          downloadedPages: progress.downloadedPages, mergedPages: progress.mergedPages ?? task.mergedPages } : task))
        if (!timer && progress.status !== 'downloading' && progress.status !== 'merging') timer = setTimeout(() => { timer = undefined; void load() }, 300)
        return
      }
      const known = groupsRef.current.some(group => group.tasks.some(task => task.id === progress.taskId))
      if (known) {
        groupsRef.current = groupTasksByManga(groupsRef.current.flatMap(group => group.tasks.map(task => task.id === progress.taskId
          ? { ...task, status: progress.status, downloadedPages: progress.downloadedPages, totalPages: progress.totalPages } : task)))
        setGroups(groupsRef.current)
      }
      if ((!known || progress.status !== 'downloading') && !timer) timer = setTimeout(() => { timer = undefined; void load() }, 300)
    })
    return () => { off?.(); clearTimeout(timer) }
  }, [load])

  const allTasks = React.useMemo(
    () => [...groups.flatMap((g) => g.tasks), ...pdfTasks].sort((a, b) => b.createdAt - a.createdAt),
    [groups, pdfTasks]
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

  const askRemoveManga = (group: MangaDownloadGroup, deleteFiles: boolean): void => {
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

  const askRemoveTask = (task: DownloadTaskRow, deleteFiles: boolean): void => {
    setConfirm({
      title: deleteFiles ? '删除记录和本地文件' : '删除下载记录',
      body: deleteFiles
        ? `确定删除任务《${task.mangaTitle} - ${task.chapterTitle}》并删除本地文件吗？此操作不可恢复。`
        : `确定删除任务《${task.mangaTitle} - ${task.chapterTitle}》吗？本地文件将保留。`,
      onConfirm: () => {
        void window.electronAPI?.downloadRemove({ kind: task.kind ?? 'images', id: task.id }, deleteFiles).then((r) => {
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
        <Text size={200} style={{ color: 'var(--ui-danger)', display: 'block', marginBottom: '10px' }}>
          {actionError}
        </Text>
      )}
      {actionMsg && (
        <Text size={200} style={{ color: 'var(--ui-success)', display: 'block', marginBottom: '10px' }}>
          {actionMsg}
        </Text>
      )}
      {mainTab === 'manga' && pdfTasks.some(task => task.status === 'completed') && <section className="download-pdf-library">
        <h2>PDF 文档</h2>{pdfTasks.filter(task => task.status === 'completed').map(task => <div className="download-pdf-card" key={task.id}>
          <span className="download-format-badge">PDF</span><div><strong>{task.mangaTitle}</strong><small>{task.outputFile} · {task.totalPages} 页{task.available === false ? ' · 文件缺失' : ''}</small></div>
          <Button size="small" disabled={task.available === false} onClick={() => { void window.electronAPI?.downloadOpenPdf(task.id).then(result => { if (!result.ok) setActionError(result.error) }) }}>打开 PDF</Button>
          <Button size="small" appearance="subtle" icon={<FolderOpen20Regular />} aria-label="显示 PDF 所在文件夹" onClick={() => { void window.electronAPI?.downloadOpenTaskFolder({ kind: 'pdf', id: task.id }) }} />
        </div>)}
      </section>}

      {loading ? (
        <div className={styles.statusMsg}><Text size={300}>加载中…</Text></div>
      ) : mainTab === 'manga' ? (
        completedGroups.length === 0 ? pdfTasks.some(task => task.status === 'completed') ? null : (
          <div className={styles.statusMsg}>
            <ArrowDownload20Regular aria-hidden="true" />
            <Text size={400}>还没有下载完成的漫画</Text>
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
                    <Button size="small" appearance="secondary" disabled={exporting} onClick={() => void exportCbz({ mangaId: g.mangaId })}>CBZ</Button>
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
                  {g.tasks.some((t) => t.status === 'completed' && t.available === false) && ' · 有文件缺失'}
                  {g.activeTasks > 0 && ` · 下载中 ${g.activeTasks}`}
                  {g.failedTasks > 0 && ` · 失败 ${g.failedTasks}`}
                </div>
              </div>
            ))}
          </div>
        )
      ) : allTasks.length === 0 ? (
        <div className={styles.statusMsg}>
          <ArrowDownload20Regular aria-hidden="true" />
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
            const active = ['pending', 'downloading', 'resolving', 'merging', 'committing'].includes(task.status)
            const identity = { kind: task.kind ?? 'images', id: task.id } as const
            const retryable = task.status === 'failed' || task.status === 'cancelled' || (task.status === 'completed' && task.available === false)
            return (
              <div key={`${identity.kind}:${task.id}`} className={`${styles.taskItem} download-task-row`} data-download-kind={identity.kind}>
                <div className={styles.taskInfo}>
                  <div className={styles.taskTitle}>
                    <span className="download-format-badge">{task.kind === 'pdf' ? 'PDF' : '图片'}</span>{task.mangaTitle} - {task.chapterTitle}
                  </div>
                  <div className={styles.taskMeta}>
                    {STATUS_LABEL[task.status] ?? task.status}
                    {active && ` · ${task.downloadedPages}/${task.totalPages} 页`}
                    {'mergedPages' in task && task.status === 'merging' && ` · 已合并 ${task.mergedPages} 页`}
                  </div>
                  {task.status === 'completed' && task.available === false && (
                    <Tooltip content={missingFileMessage(task.availabilityReason)} relationship="description">
                      <Badge appearance="tint" color="warning" size="small" style={{ marginTop: '4px' }}>文件缺失</Badge>
                    </Tooltip>
                  )}
                  {(task.status === 'failed' || task.status === 'cancelled') && task.error && (
                    <Text size={200} style={{ color: 'var(--ui-danger)', display: 'block', marginTop: '2px' }}>
                      {task.error}
                    </Text>
                  )}
                  {active && (
                    <div className={styles.taskProgress} style={{ marginTop: '6px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--ui-stroke-card)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, backgroundColor: 'var(--ui-brand)', transition: 'width var(--ui-motion-standard) ease-out' }} />
                    </div>
                  )}
                </div>
                <div className={styles.taskActions}>
                  {task.status === 'completed' && task.available !== false && (task.kind === 'pdf'
                    ? <Button size="small" appearance="subtle" onClick={() => { void window.electronAPI?.downloadOpenPdf(task.id).then(result => { if (!result.ok) setActionError(result.error) }) }}>打开 PDF</Button>
                    : <Button size="small" appearance="subtle" disabled={exporting} onClick={() => void exportCbz({ taskId: task.id })}>导出 CBZ</Button>)}
                  {active && (
                    <Tooltip content="取消" relationship="label">
                      <Button size="small" appearance="subtle" icon={<Dismiss20Regular />}
                        onClick={() => void window.electronAPI?.downloadCancel(identity).then(result => { if (!result.ok) setActionError(result.error); void load() })} />
                    </Tooltip>
                  )}
                  {retryable && (
                    <Tooltip content={task.status === 'completed' ? '修复缺失页' : '重试'} relationship="label">
                      <Button size="small" appearance="subtle" icon={<ArrowClockwise20Regular />}
                        onClick={() => void window.electronAPI?.downloadRetry(identity).then(result => { if (!result.ok) setActionError(result.error ?? '重试失败'); void load() })}>{task.status === 'completed' ? '修复缺失页' : null}</Button>
                    </Tooltip>
                  )}
                  <Tooltip content="打开文件夹" relationship="label">
                    <Button size="small" appearance="subtle" icon={<FolderOpen20Regular />}
                      onClick={() => void window.electronAPI?.downloadOpenTaskFolder(identity).then((r) => {
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
                style={{ backgroundColor: 'var(--ui-danger)' }}
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
