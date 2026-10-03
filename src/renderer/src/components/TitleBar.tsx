import React, { useCallback, useEffect, useState } from 'react'
import {
  makeStyles,
  Button,
  Text,
  Tooltip
} from '@fluentui/react-components'
import {
  WeatherMoon20Regular,
  WeatherSunny20Regular,
  ArrowDownload20Regular,
  PanelRightContract20Regular,
  PanelRightExpand20Regular
  , TabAdd20Regular
} from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'
import { toggleReaderVisibility } from '../reader/readerFocus'
import appIcon from '../../../../build/icons/icon-64.png'
import { useExitPresence } from '../motion/motion'

const TITLE_BAR_HEIGHT = '36px'

// Windows 11 native caption buttons (min/max/close) are drawn by the OS as an
// overlay ~138px wide on the right edge. We must reserve that space so our own
// controls are not hidden underneath them.
const CAPTION_RESERVED = 140

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    height: TITLE_BAR_HEIGHT,
    paddingLeft: '14px',
    paddingRight: '4px',
    position: 'relative',
    zIndex: 1000,
    backgroundColor: 'var(--ui-bg-pane)',
    borderBottom: '1px solid var(--ui-stroke-card)',
    WebkitAppRegion: 'drag',
    userSelect: 'none',
    flexShrink: 0
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--ui-text-secondary)',
    marginLeft: '8px',
    flex: 1
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    paddingRight: `${CAPTION_RESERVED}px`,
    WebkitAppRegion: 'no-drag'
  },
  chipWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    marginRight: '6px'
  },
  downloadChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 10px',
    borderRadius: 'var(--ui-radius-md)',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--ui-brand)',
    backgroundColor: 'var(--ui-bg-selected)',
    cursor: 'pointer',
    marginRight: '6px',
    transition: 'background-color var(--ui-motion-fast) ease-out',
    ':hover': {
      backgroundColor: 'var(--ui-bg-hover)'
    }
  },
  downloadPopover: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: '0',
    width: '320px',
    maxHeight: '280px',
    overflowY: 'auto',
    padding: '10px 12px',
    borderRadius: 'var(--ui-radius-lg)',
    backgroundColor: 'var(--ui-bg-dialog)',
    border: '1px solid var(--ui-stroke-card)',
    boxShadow: 'var(--ui-shadow-popup)',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  popRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  popTitle: {
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--ui-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  popMeta: {
    fontSize: '12px',
    lineHeight: '18px',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--ui-text-tertiary)'
  },
  popProgress: {
    height: '4px',
    borderRadius: '2px',
    backgroundColor: 'var(--ui-stroke-card)',
    overflow: 'hidden'
  }
})

interface TitleBarProps {
  darkMode: boolean
  onToggleDarkMode: () => void
}

export default function TitleBar({ darkMode, onToggleDarkMode }: TitleBarProps): JSX.Element {
  const styles = useStyles()
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const readerCount = useAppStore((s) => s.readerTabs.length)
  const readerVisible = useAppStore((s) => s.readerVisible)
  const readerPending = useAppStore((s) => s.readerTransitionPending)
  const [addStatus, setAddStatus] = useState<{ current: number; total: number; stage: string; error?: string } | null>(null)
  const [activeTasks, setActiveTasks] = useState<Array<{
    taskId: number
    kind: 'images' | 'pdf'
    mangaTitle: string
    chapterTitle: string
    totalPages: number
    downloadedPages: number
    status: string
  }>>([])
  const [hovered, setHovered] = useState(false)
  const popoverPresent = useExitPresence(hovered)

  useEffect(() => {
    // Sync native caption button colors with the active Fluent theme
    window.electronAPI?.windowSetCaptionTheme(darkMode)
  }, [darkMode])

  // 订阅下载进度与批量入队状态，顶部栏显示非阻塞的下载指示
  useEffect(() => {
    window.electronAPI?.downloadList().then((list) => {
      const rows = (list ?? []) as Array<{ status: string } & {
        id: number; kind?: 'images' | 'pdf'; mangaTitle: string; chapterTitle: string
        totalPages: number; downloadedPages: number
      }>
      setActiveTasks(
        rows
          .filter((t) => ['pending', 'downloading', 'resolving', 'merging', 'committing'].includes(t.status))
          .map((t) => ({
            taskId: t.id,
            kind: t.kind ?? 'images',
            mangaTitle: t.mangaTitle,
            chapterTitle: t.chapterTitle,
            totalPages: t.totalPages,
            downloadedPages: t.downloadedPages,
            status: t.status
          }))
      )
    })

    const offProgress = window.electronAPI?.onDownloadProgress((progress) => {
      const p = progress as {
        taskId: number
        kind?: 'images' | 'pdf'
        status: string
        mangaTitle?: string
        chapterTitle?: string
        totalPages?: number
        downloadedPages?: number
      }
      if (!p.taskId) return
      setActiveTasks((prev) => {
        const map = new Map(prev.map((t) => [`${t.kind}:${t.taskId}`, t]))
        const key = `${p.kind ?? 'images'}:${p.taskId}`
        if (['pending', 'downloading', 'resolving', 'merging', 'committing'].includes(p.status)) {
          map.set(key, {
            taskId: p.taskId,
            kind: p.kind ?? 'images',
            mangaTitle: p.mangaTitle ?? '',
            chapterTitle: p.chapterTitle ?? '',
            totalPages: p.totalPages ?? 0,
            downloadedPages: p.downloadedPages ?? 0,
            status: p.status
          })
        } else {
          map.delete(key)
        }
        return [...map.values()]
      })
    })
    const offAdd = window.electronAPI?.onDownloadAddStatus((status) => {
      const s = status as { current: number; total: number; stage: string; error?: string }
      if (s.stage === 'done') {
        setAddStatus(null)
      } else {
        setAddStatus({ current: s.current, total: s.total, stage: s.stage, error: s.error })
      }
    })
    return () => {
      offProgress?.()
      offAdd?.()
    }
  }, [])

  const handleChipClick = useCallback((): void => {
    setCurrentPage('downloads')
  }, [setCurrentPage])

  const handleToggleDarkMode = (): void => {
    onToggleDarkMode()
  }

  return (
    <div className={styles.bar}>
      <img src={appIcon} width={22} height={22} alt="" draggable={false} />
      <span className={styles.title}>JMComic Desktop</span>
      <div className={styles.actions}>
        {(addStatus?.stage === 'fetching' || activeTasks.length > 0) && (
          <div
            className={styles.chipWrap}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div className={styles.downloadChip} role="button" tabIndex={0}
              onClick={handleChipClick}
              onKeyDown={(e) => { if (e.key === 'Enter') handleChipClick() }}
            >
              <ArrowDownload20Regular style={{ width: '14px', height: '14px' }} />
              {addStatus?.stage === 'fetching'
                ? `添加章节 ${addStatus.current}/${addStatus.total}`
                : `下载中 ${activeTasks.length}`}
            </div>
            {popoverPresent && (
              <div className={`${styles.downloadPopover} download-status-popover`} data-exiting={!hovered}
                ref={element => { if (element) element.inert = !hovered }} aria-hidden={!hovered || undefined}>
                {addStatus?.stage === 'fetching' && (
                  <div className={styles.popRow}>
                    <Text size={200}>正在抓取章节图片列表… {addStatus.current}/{addStatus.total}</Text>
                  </div>
                )}
                {activeTasks.length === 0 ? (
                  <div className={styles.popRow}>
                    <Text size={200}>暂无下载中的任务</Text>
                  </div>
                ) : (
                  activeTasks.map((t) => {
                    const pct = t.totalPages > 0
                      ? Math.min(100, Math.round((t.downloadedPages / t.totalPages) * 100))
                      : 0
                    return (
                      <div key={`${t.kind}:${t.taskId}`} className={styles.popRow}>
                        <div className={styles.popTitle}>{t.mangaTitle} - {t.chapterTitle}</div>
                        <div className={styles.popMeta}>{t.kind === 'pdf' ? 'PDF · ' : ''}{t.status === 'merging' ? '正在合并' : t.status === 'committing' ? '正在保存' : `${t.downloadedPages}/${t.totalPages} 页 · ${pct}%`}</div>
                        <div className={styles.popProgress}>
                          <div
                            style={{
                              height: '100%',
                              width: '100%',
                              transform: `scaleX(${pct / 100})`,
                              transformOrigin: 'left',
                              backgroundColor: 'var(--ui-brand)',
                              transition: 'transform var(--ui-motion-standard) ease-out'
                            }}
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}
        <Tooltip content={darkMode ? '浅色模式' : '深色模式'} relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={darkMode ? <WeatherSunny20Regular /> : <WeatherMoon20Regular />}
            onClick={handleToggleDarkMode}
          />
        </Tooltip>
        <Tooltip content="新建阅读标签 · Ctrl T" relationship="description">
          <Button appearance="subtle" size="small" aria-label="新建阅读标签" icon={<TabAdd20Regular />}
            onClick={() => { void useAppStore.getState().newReaderTab() }} />
        </Tooltip>
        {readerCount > 0 && <Tooltip content={`${readerVisible ? '隐藏' : '显示'}阅读侧栏 · ${readerCount} 本漫画`} relationship="description">
          <Button appearance="subtle" size="small" data-reader-visibility-toggle
            aria-label={readerVisible ? '隐藏阅读侧栏' : '显示阅读侧栏'} aria-expanded={readerVisible}
            aria-controls="reader-workspace" disabled={readerPending}
            icon={readerVisible ? <PanelRightContract20Regular /> : <PanelRightExpand20Regular />}
            onClick={() => { void toggleReaderVisibility() }} />
        </Tooltip>}
      </div>
    </div>
  )
}

