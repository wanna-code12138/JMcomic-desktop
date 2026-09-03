import React from 'react'
import { useAppStore } from './stores/appStore'
import {
  HomePage, CategoriesPage, SearchPage,
  FavoritesPage, DownloadsPage, SettingsPage,
  MangaDetailPage, ReaderPage, PerformanceDiagnosticsPage
} from './pages'
import { startRendererMetrics } from './performance/rendererMetrics'
import TitleBar from './components/TitleBar'
import AppFrame from './components/AppFrame'
import AppNavigation from './components/AppNavigation'
import AppStatusBar from './components/AppStatusBar'

// WinUI 导航宽度与指示条规范（供外部契约与布局参考）
export const NAV_WIDTH = 208
// active indicator: width: '2px'

type PageId = 'home' | 'categories' | 'search' | 'favorites' | 'downloads' | 'settings'

const primaryPageIds: readonly PageId[] = [
  'home', 'categories', 'search', 'favorites', 'downloads', 'settings'
]

function isPrimaryPage(page: string): page is PageId {
  return primaryPageIds.includes(page as PageId)
}

function rememberPrimaryPage(visited: PageId[], page: string): PageId[] {
  if (!isPrimaryPage(page) || visited.includes(page)) return visited
  return [...visited, page]
}

const pageComponents: Record<string, React.ComponentType> = {
  home: HomePage,
  categories: CategoriesPage,
  search: SearchPage,
  favorites: FavoritesPage,
  downloads: DownloadsPage,
  settings: SettingsPage,
  detail: MangaDetailPage,
  reader: ReaderPage,
  diagnostics: PerformanceDiagnosticsPage
}

interface AppProps {
  darkMode: boolean
  onToggleDarkMode: () => void
}

export default function App({ darkMode, onToggleDarkMode }: AppProps): JSX.Element {
  const currentPage = useAppStore((state) => state.currentPage)
  const readerSourcePage = useAppStore((state) => state.readerSourcePage)
  const [visitedPrimaryPages, setVisitedPrimaryPages] = React.useState<PageId[]>(['home'])

  React.useEffect(() => {
    const stop = startRendererMetrics((event) => {
      window.electronAPI?.performanceRecord(event)
    })
    return stop
  }, [])

  const rememberedPrimaryPages = rememberPrimaryPage(visitedPrimaryPages, currentPage)
  const keepDetailMounted =
    currentPage === 'detail' || (currentPage === 'reader' && readerSourcePage === 'detail')
  const mountedPages = [
    ...rememberedPrimaryPages,
    ...(keepDetailMounted ? ['detail'] : []),
    ...(currentPage === 'reader' ? ['reader'] : []),
    ...(currentPage === 'diagnostics' ? ['diagnostics'] : [])
  ]

  React.useEffect(() => {
    setVisitedPrimaryPages((visited) => rememberPrimaryPage(visited, currentPage))
  }, [currentPage])

  const pagesContent = (
    <>
      {mountedPages.map((page) => {
        const Page = pageComponents[page] ?? HomePage
        return (
          <div
            key={page}
            style={{
              height: '100%',
              minHeight: 0,
              overflow: 'hidden',
              display: page === currentPage ? 'block' : 'none'
            }}
            aria-hidden={page !== currentPage}
          >
            <Page />
          </div>
        )
      })}
    </>
  )

  return (
    <AppFrame
      titleBar={<TitleBar darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />}
      navigation={<AppNavigation />}
      page={pagesContent}
      statusBar={<AppStatusBar />}
    />
  )
}
