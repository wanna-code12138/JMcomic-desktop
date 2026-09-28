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

// 页面隔离与挂载契约规范（供静态契约测试与布局参考）
// pageViewport: { height: '100%', minHeight: 0, overflow: 'hidden' }
// display: page === currentPage ? 'block' : 'none'
// mountedPages.map


import { touchPage, createPageCacheState, type PrimaryPageId } from './navigation/pageStateCache'

type PrimaryNavPageId = 'home' | 'categories' | 'search' | 'favorites' | 'downloads' | 'settings'

const primaryPageIds: readonly PrimaryNavPageId[] = [
  'home', 'categories', 'search', 'favorites', 'downloads', 'settings'
]

function isPrimaryPage(page: string): page is PrimaryNavPageId {
  return primaryPageIds.includes(page as PrimaryNavPageId)
}

function rememberPrimaryPage(visited: readonly PrimaryNavPageId[], page: string): readonly PrimaryNavPageId[] {
  if (!isPrimaryPage(page)) return visited
  const state = { mounted: visited as PrimaryPageId[], snapshots: {} }
  return touchPage(state, page as PrimaryPageId, 3).mounted as readonly PrimaryNavPageId[]
}

interface AppProps {
  darkMode: boolean
  onToggleDarkMode: () => void
}

export default function App({ darkMode, onToggleDarkMode }: AppProps): JSX.Element {
  const currentPage = useAppStore((state) => state.currentPage)
  const readerSourcePage = useAppStore((state) => state.readerSourcePage)
  const [pageCache, setPageCache] = React.useState(() => createPageCacheState('home'))
  const visitedPrimaryPages = pageCache.mounted as readonly PrimaryNavPageId[]

  React.useEffect(() => {
    const stop = startRendererMetrics((event) => {
      window.electronAPI?.performanceRecord(event)
    })
    return stop
  }, [])

  React.useEffect(() => {
    if (isPrimaryPage(currentPage)) {
      setPageCache((prev) => touchPage(prev, currentPage as PrimaryPageId, 3))
    }
  }, [currentPage])

  const rememberedPrimaryPages = rememberPrimaryPage(visitedPrimaryPages, currentPage)
  const keepDetailMounted =
    currentPage === 'detail' || (currentPage === 'reader' && readerSourcePage === 'detail')
  const mountedPages: PageId[] = [
    ...rememberedPrimaryPages,
    ...(keepDetailMounted ? ['detail' as const] : []),
    ...(currentPage === 'reader' ? ['reader' as const] : []),
    ...(currentPage === 'diagnostics' ? ['diagnostics' as const] : [])
  ]

  return (
    <AppFrame
      titleBar={<TitleBar darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />}
      navigation={<AppNavigation />}
      page={<PageHost currentPage={currentPage as PageId} mountedPages={mountedPages} />}
      statusBar={<AppStatusBar />}
    />
  )
}
