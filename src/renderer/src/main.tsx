import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import { useAppStore, initSystemThemeListener } from './stores/appStore'
import { winuiLightTheme, winuiDarkTheme } from './theme/winuiTheme'
import App from './App'
import './assets/global.css'

function Root(): JSX.Element {
  const darkMode = useAppStore((s) => s.darkMode)
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode)
  const micaEnabled = useAppStore((s) => s.micaEnabled)
  const solidWindow = useAppStore((s) => s.solidWindow)
  const setThemeMode = useAppStore((s) => s.setThemeMode)
  const setMicaEnabled = useAppStore((s) => s.setMicaEnabled)
  const setSolidWindow = useAppStore((s) => s.setSolidWindow)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const off = initSystemThemeListener()
    window.electronAPI?.settingsGet()?.then((s) => {
        if (!s) return
        setThemeMode(s.themeMode)
        setMicaEnabled(s.micaEnabled)
        setSolidWindow(s.solidWindow)
      })?.finally(() => setReady(true))
    return off
  }, [setThemeMode, setMicaEnabled, setSolidWindow])

  if (!ready) {
    return <div style={{ height: '100%' }} />
  }

  return (
    <FluentProvider
      theme={darkMode ? winuiDarkTheme : winuiLightTheme}
      style={{ height: '100%' }}
    >
      <div
        className={`${darkMode ? 'ui-dark' : 'ui-light'}${!micaEnabled && solidWindow ? ' ui-solid' : ''}`}
        style={{ height: '100%' }}
      >
        <App darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
      </div>
    </FluentProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
