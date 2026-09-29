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
  const animations = useAppStore(s => s.animationsEnabled)
  const setThemeMode = useAppStore((s) => s.setThemeMode)
  const setMicaEnabled = useAppStore((s) => s.setMicaEnabled)
  const setSolidWindow = useAppStore((s) => s.setSolidWindow)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = (): void => {
      const enabled = animations && !media.matches
      document.documentElement.dataset.motion = enabled ? 'on' : 'off'
      if (!enabled) document.getAnimations().forEach(animation => animation.cancel())
    }
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [animations])

  useEffect(() => {
    const off = initSystemThemeListener()
    window.electronAPI?.settingsGet()?.then(async (s) => {
        if (!s) return
        setThemeMode(s.themeMode)
        setMicaEnabled(s.micaEnabled)
        setSolidWindow(s.solidWindow)
        useAppStore.setState({ animationsEnabled: s.animationsEnabled, restoreReaderWorkspace: s.restoreReaderWorkspace, browseRatio: s.browseRatio })
        if (s.restoreReaderWorkspace) {
          try {
            const snapshot = await window.electronAPI?.workspaceGet()
            if (snapshot && !useAppStore.getState().readerTabs.length) useAppStore.setState({ readerTabs: snapshot.tabs, activeReaderId: snapshot.activeId,
              readerVisible: snapshot.tabs.length > 0, readerAutoCollapse: snapshot.tabs.length > 0, readerSidebarCollapsed: snapshot.tabs.length > 0 })
          } catch (error) { useAppStore.setState({ workspaceStorageError: String(error) }) }
        }
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
