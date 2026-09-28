import React from 'react'
import { useAppStore } from './stores/appStore'
import { startRendererMetrics } from './performance/rendererMetrics'
import TitleBar from './components/TitleBar'
import AppFrame from './components/AppFrame'
import AppNavigation from './components/AppNavigation'
import AppStatusBar from './components/AppStatusBar'
import PageHost, { type PageId } from './components/PageHost'

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
  const readerSidebarCollapsed = useAppStore((state) => state.readerSidebarCollapsed)
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
      navigation={currentPage === 'reader' && readerSidebarCollapsed ? null : <AppNavigation />}
      page={<PageHost currentPage={currentPage as PageId} mountedPages={mountedPages} />}
      statusBar={currentPage === 'reader' ? null : <AppStatusBar />}
    />
  )
}
