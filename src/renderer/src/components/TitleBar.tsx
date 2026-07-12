import React from 'react'
import {
  makeStyles,
  tokens,
  Button,
  Tooltip
} from '@fluentui/react-components'
import {
  Subtract20Regular,
  Square20Regular,
  Dismiss20Regular,
  WeatherMoon20Regular,
  WeatherSunny20Regular
} from '@fluentui/react-icons'

const TITLE_BAR_HEIGHT = '36px'

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    height: TITLE_BAR_HEIGHT,
    paddingLeft: '12px',
    paddingRight: '4px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    WebkitAppRegion: 'drag',
    userSelect: 'none',
    flexShrink: 0
  },
  title: {
    fontSize: '13px',
    fontWeight: 500,
    color: tokens.colorNeutralForeground2,
    marginLeft: '4px',
    flex: 1
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    WebkitAppRegion: 'no-drag'
  }
})

interface TitleBarProps {
  darkMode: boolean
  onToggleDarkMode: () => void
}

export default function TitleBar({ darkMode, onToggleDarkMode }: TitleBarProps): JSX.Element {
  const styles = useStyles()

  const handleMinimize = (): void => {
    window.electronAPI?.windowMinimize()
  }
  const handleMaximize = (): void => {
    window.electronAPI?.windowMaximize()
  }
  const handleClose = (): void => {
    window.electronAPI?.windowClose()
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
            onClick={onToggleDarkMode}
          />
        </Tooltip>
        <Tooltip content="最小化" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<Subtract20Regular />}
            onClick={handleMinimize}
          />
        </Tooltip>
        <Tooltip content="最大化" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<Square20Regular />}
            onClick={handleMaximize}
          />
        </Tooltip>
        <Tooltip content="关闭" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<Dismiss20Regular />}
            onClick={handleClose}
          />
        </Tooltip>
      </div>
    </div>
  )
}
