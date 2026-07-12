import React, { useEffect } from 'react'
import {
  makeStyles,
  tokens,
  Button,
  Tooltip
} from '@fluentui/react-components'
import {
  WeatherMoon20Regular,
  WeatherSunny20Regular
} from '@fluentui/react-icons'

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
    paddingLeft: '12px',
    paddingRight: '4px',
    // 透明：透出 DWM 的 Mica 材质，与下方实色内容区形成层次差异
    backgroundColor: 'transparent',
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    WebkitAppRegion: 'drag',
    userSelect: 'none',
    flexShrink: 0
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground2,
    marginLeft: '4px',
    flex: 1
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    paddingRight: `${CAPTION_RESERVED}px`,
    WebkitAppRegion: 'no-drag'
  }
})

interface TitleBarProps {
  darkMode: boolean
  onToggleDarkMode: () => void
}

export default function TitleBar({ darkMode, onToggleDarkMode }: TitleBarProps): JSX.Element {
  const styles = useStyles()

  useEffect(() => {
    // Sync native caption button colors with the active Fluent theme
    window.electronAPI?.windowSetCaptionTheme(darkMode)
  }, [darkMode])

  const handleToggleDarkMode = (): void => {
    onToggleDarkMode()
  }

  return (
    <div className={styles.bar}>
      <span className={styles.title}>JMComic Desktop</span>
      <div className={styles.actions}>
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

