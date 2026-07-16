import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider } from '@fluentui/react-components'
import { useAppStore, initSystemThemeListener } from './stores/appStore'
import { auroraLightTheme, auroraDarkTheme } from './theme/auroraTheme'
import App from './App'
import './assets/global.css'

function Root(): JSX.Element {
  const darkMode = useAppStore((s) => s.darkMode)
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode)

  useEffect((): (() => void) => initSystemThemeListener(), [])

  return (
    <FluentProvider
      theme={darkMode ? auroraDarkTheme : auroraLightTheme}
      style={{ height: '100%' }}
    >
      <div className={darkMode ? 'ac-dark' : 'ac-light'} style={{ height: '100%' }}>
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
