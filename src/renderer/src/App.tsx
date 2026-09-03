import React from 'react'
import { useAppStore } from './stores/appStore'
import { startRendererMetrics } from './performance/rendererMetrics'
import TitleBar from './components/TitleBar'
import AppFrame from './components/AppFrame'
import AppNavigation from './components/AppNavigation'
import AppStatusBar from './components/AppStatusBar'
import PageHost, { type PageId } from './components/PageHost'

// WinUI 导航宽度与指示条规范（供外部契约与布局参考）
export const NAV_WIDTH = 208
// active indicator: width: '2px'

type PrimaryNavPageId = 'home' | 'categories' | 'search' | 'favorites' | 'downloads' | 'settings'

const primaryPageIds: readonly PrimaryNavPageId[] = [
  'home', 'categories', 'search', 'favorites', 'downloads', 'settings'
]

function isPrimaryPage(page: string): page is PrimaryNavPageId {
  return primaryPageIds.includes(page as PrimaryNavPageId)
}

function rememberPrimaryPage(visited: PrimaryNavPageId[], page: string): PrimaryNavPageId[] {
  if (!isPrimaryPage(page) || visited.includes(page)) return visited
  return [...visited, page]
}

interface AppProps {
  darkMode: boolean
  onToggleDarkMode: () => void
}

export default function App({ darkMode, onToggleDarkMode }: AppProps): JSX.Element {
  const currentPage = useAppStore((state) => state.currentPage)
  const readerSourcePage = useAppStore((state) => state.readerSourcePage)
  const [visitedPrimaryPages, setVisitedPrimaryPages] = React.useState<PrimaryNavPageId[]>(['home'])

  React.useEffect(() => {
    const stop = startRendererMetrics((event) => {
      window.electronAPI?.performanceRecord(event)
    })
    return stop
  }, [])

  const rememberedPrimaryPages = rememberPrimaryPage(visitedPrimaryPages, currentPage)
  const keepDetailMounted =
    currentPage === 'detail' || (currentPage === 'reader' && readerSourcePage === 'detail')
  const mountedPages: PageId[] = [
    ...rememberedPrimaryPages,
    ...(keepDetailMounted ? ['detail' as const] : []),
    ...(currentPage === 'reader' ? ['reader' as const] : []),
    ...(currentPage === 'diagnostics' ? ['diagnostics' as const] : [])
  ]

  React.useEffect(() => {
    setVisitedPrimaryPages((visited) => rememberPrimaryPage(visited, currentPage))
  }, [currentPage])

  return (
    <AppFrame
      titleBar={<TitleBar darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />}
      navigation={<AppNavigation />}
      page={<PageHost currentPage={currentPage as PageId} mountedPages={mountedPages} />}
      statusBar={<AppStatusBar />}
    />
  )
}
