import React from 'react'
import { useAppStore } from './stores/appStore'
import { startRendererMetrics } from './performance/rendererMetrics'
import TitleBar from './components/TitleBar'
import AppFrame from './components/AppFrame'
import AppNavigation from './components/AppNavigation'
import AppStatusBar from './components/AppStatusBar'
import PageHost, { type PageId } from './components/PageHost'
import ReaderWorkspace from './reader/ReaderWorkspace'
import { installWorkspaceShortcuts } from './reader/workspaceShortcuts'
import { installWorkspacePersistence } from './reader/workspacePersistence'
import DownloadFormatDialog from './downloads/DownloadFormatDialog'
import { useExitPresence } from './motion/motion'

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
  const hasReader = useAppStore((state) => state.readerTabs.length > 0)
  const readerPresent = useExitPresence(hasReader)
  const readerExpanded = useAppStore((state) => state.readerExpanded)
  const readerVisible = useAppStore((state) => state.readerVisible)
  const readerClosing = useAppStore((state) => state.readerClosing)
  const restoreWorkspace = useAppStore(state => state.restoreReaderWorkspace)
  const [pageCache, setPageCache] = React.useState(() => createPageCacheState('home'))
  const visitedPrimaryPages = pageCache.mounted as readonly PrimaryNavPageId[]
  React.useEffect(installWorkspaceShortcuts, [])
  React.useEffect(() => restoreWorkspace ? installWorkspacePersistence() : undefined, [restoreWorkspace])

  React.useEffect(() => {
    const offClose = window.electronAPI?.onBeforeClose(() => useAppStore.getState().flushReaderWorkspace())
    const offCancel = window.electronAPI?.onCloseCancelled(() => useAppStore.getState().cancelReaderClose())
    return () => { offClose?.(); offCancel?.() }
  }, [])

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
  const mountedPages: PageId[] = [
    ...rememberedPrimaryPages,
    ...(currentPage === 'detail' ? ['detail' as const] : []),
    ...(currentPage === 'diagnostics' ? ['diagnostics' as const] : [])
  ]

  return (
    <><AppFrame
      titleBar={<TitleBar darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />}
      navigation={<AppNavigation />}
      page={<PageHost currentPage={currentPage as PageId} mountedPages={mountedPages} />}
      statusBar={hasReader && readerVisible ? null : <AppStatusBar />}
      reader={readerPresent ? <ReaderWorkspace /> : null}
      readerExpanded={readerExpanded}
      readerVisible={hasReader && readerVisible}
      closing={readerClosing}
    /><DownloadFormatDialog /></>
  )
}
