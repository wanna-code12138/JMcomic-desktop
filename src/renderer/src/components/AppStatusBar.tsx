import React from 'react'
import { makeStyles } from '@fluentui/react-components'
import {
  Wifi1Regular,
  Wifi3Regular,
  WifiOff20Regular
} from '@fluentui/react-icons'
import { useAppStore } from '../stores/appStore'

const STATUS_BAR_HEIGHT = 28

const useStyles = makeStyles({
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    height: `${STATUS_BAR_HEIGHT}px`,
    paddingLeft: '14px',
    paddingRight: '14px',
    backgroundColor: 'var(--ui-bg-toolbar)',
    borderTop: '1px solid var(--ui-stroke-card)',
    fontSize: '12px',
    color: 'var(--ui-text-tertiary)',
    gap: '10px',
    flexShrink: 0
  },
  statusSeparator: {
    width: '1px',
    height: '12px',
    backgroundColor: 'var(--ui-stroke-card)',
    flexShrink: 0
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  statusVersion: {
    marginLeft: 'auto'
  }
})

function AppStatusBar(): JSX.Element {
  const styles = useStyles()
  const networkStatus = useAppStore((state) => state.networkStatus)
  const [appVersion, setAppVersion] = React.useState('1.0.3')

  React.useEffect(() => {
    window.electronAPI?.appVersion().then((v) => {
      if (v) setAppVersion(String(v))
    })
  }, [])

  const networkIcon = () => {
    switch (networkStatus) {
      case 'online':
        return <Wifi3Regular style={{ color: 'var(--ui-success)' }} />
      case 'degraded':
        return <Wifi1Regular style={{ color: 'var(--ui-warning)' }} />
      default:
        return <WifiOff20Regular style={{ color: 'var(--ui-danger)' }} />
    }
  }

  const networkLabel = () => {
    switch (networkStatus) {
      case 'online':
        return '网络正常'
      case 'degraded':
        return '代理连接'
      default:
        return '无法访问'
    }
  }

  return (
    <div className={styles.statusBar}>
      <span className={styles.statusItem}>
        {networkIcon()}
        {networkLabel()}
      </span>
      <span className={styles.statusSeparator} />
      <span className={styles.statusVersion}>JMComic Desktop v{appVersion}</span>
    </div>
  )
}

export default React.memo(AppStatusBar)
