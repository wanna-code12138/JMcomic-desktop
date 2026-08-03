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
  ArrowDownload20Regular
} from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'

const TITLE_BAR_HEIGHT = '32px'

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
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-toolbar))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-toolbar))',
    borderBottom: '1px solid var(--ac-glass-border)',
    WebkitAppRegion: 'drag',
    userSelect: 'none',
    flexShrink: 0
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--ac-text-2)',
    marginLeft: '4px',
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
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--ac-brand)',
    backgroundColor: 'color-mix(in srgb, var(--ac-brand) 12%, transparent)',
    cursor: 'pointer',
    marginRight: '6px',
    transition: 'background-color 0.15s',
    ':hover': {
      backgroundColor: 'color-mix(in srgb, var(--ac-brand) 20%, transparent)'
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
    borderRadius: 'var(--ac-radius-card)',
    backgroundColor: 'var(--ac-glass-bg)',
    backdropFilter: 'blur(var(--ac-blur-panel))',
    WebkitBackdropFilter: 'blur(var(--ac-blur-panel))',
    border: '1px solid var(--ac-glass-border)',
    boxShadow: '0 8px 24px var(--ac-glass-shadow)',
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
    color: 'var(--ac-text-1)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  popMeta: {
    fontSize: '11px',
    color: 'var(--ac-text-3)'
  },
  popProgress: {
    height: '4px',
    borderRadius: '2px',
    backgroundColor: 'var(--ac-glass-border)',
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
  const [addStatus, setAddStatus] = useState<{ current: number; total: number; stage: string; error?: string } | null>(null)
  const [activeTasks, setActiveTasks] = useState<Array<{
    taskId: number
    mangaTitle: string
    chapterTitle: string
    totalPages: number
    downloadedPages: number
    status: string
  }>>([])
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    // Sync native caption button colors with the active Fluent theme
    window.electronAPI?.windowSetCaptionTheme(darkMode)
  }, [darkMode])

  // 订阅下载进度与批量入队状态，顶部栏显示非阻塞的下载指示
  useEffect(() => {
    window.electronAPI?.downloadList().then((list) => {
      const rows = (list ?? []) as Array<{ status: string } & {
        id: number; mangaTitle: string; chapterTitle: string
        totalPages: number; downloadedPages: number
      }>
      setActiveTasks(
        rows
          .filter((t) => t.status === 'pending' || t.status === 'downloading')
          .map((t) => ({
            taskId: t.id,
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
        status: string
        mangaTitle?: string
        chapterTitle?: string
        totalPages?: number
        downloadedPages?: number
      }
      if (!p.taskId) return
      setActiveTasks((prev) => {
        const map = new Map(prev.map((t) => [t.taskId, t]))
        if (p.status === 'pending' || p.status === 'downloading') {
          map.set(p.taskId, {
            taskId: p.taskId,
            mangaTitle: p.mangaTitle ?? '',
            chapterTitle: p.chapterTitle ?? '',
            totalPages: p.totalPages ?? 0,
            downloadedPages: p.downloadedPages ?? 0,
            status: p.status
          })
        } else {
          map.delete(p.taskId)
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
            {hovered && (
              <div className={styles.downloadPopover}>
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
                      <div key={t.taskId} className={styles.popRow}>
                        <div className={styles.popTitle}>{t.mangaTitle} - {t.chapterTitle}</div>
                        <div className={styles.popMeta}>{t.downloadedPages}/{t.totalPages} 页 · {pct}%</div>
                        <div className={styles.popProgress}>
                          <div
                            style={{
                              height: '100%',
                              width: `${pct}%`,
                              backgroundColor: 'var(--ac-brand)',
                              transition: 'width 0.2s ease'
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
      </div>
    </div>
  )
}

