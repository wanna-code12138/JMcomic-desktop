import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  makeStyles,
  Button,
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
  const [activeCount, setActiveCount] = useState(0)
  const taskStatusRef = useRef(new Map<number, string>())

  useEffect(() => {
    // Sync native caption button colors with the active Fluent theme
    window.electronAPI?.windowSetCaptionTheme(darkMode)
  }, [darkMode])

  // 订阅下载进度与批量入队状态，顶部栏显示非阻塞的下载指示
  useEffect(() => {
    window.electronAPI?.downloadSummary().then((groups) => {
      const list = (groups ?? []) as Array<{ activeTasks: number }>
      setActiveCount(list.reduce((sum, g) => sum + (g.activeTasks ?? 0), 0))
    })

    const offProgress = window.electronAPI?.onDownloadProgress((progress) => {
      const p = progress as { taskId: number; status: string }
      if (p.taskId) {
        if (p.status === 'pending' || p.status === 'downloading') {
          taskStatusRef.current.set(p.taskId, p.status)
        } else {
          taskStatusRef.current.delete(p.taskId)
        }
        setActiveCount(taskStatusRef.current.size)
      }
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
        {(addStatus?.stage === 'fetching' || activeCount > 0) && (
          <div className={styles.downloadChip} role="button" tabIndex={0}
            onClick={handleChipClick}
            onKeyDown={(e) => { if (e.key === 'Enter') handleChipClick() }}
          >
            <ArrowDownload20Regular style={{ width: '14px', height: '14px' }} />
            {addStatus?.stage === 'fetching'
              ? `添加章节 ${addStatus.current}/${addStatus.total}`
              : `下载中 ${activeCount}`}
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

