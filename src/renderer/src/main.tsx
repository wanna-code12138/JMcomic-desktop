import React from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider, webLightTheme, webDarkTheme } from '@fluentui/react-components'
import { useAppStore } from './stores/appStore'
import App from './App'
import './assets/global.css'

function Root(): JSX.Element {
  const darkMode = useAppStore((s) => s.darkMode)
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode)

  return (
    <FluentProvider theme={darkMode ? webDarkTheme : webLightTheme} style={{ height: '100%' }}>
      <App darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
    </FluentProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
